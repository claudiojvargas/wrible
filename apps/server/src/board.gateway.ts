import type { IncomingMessage } from 'node:http';
import { Inject, type OnModuleDestroy } from '@nestjs/common';
import { WebSocketGateway, type OnGatewayConnection, type OnGatewayDisconnect } from '@nestjs/websockets';
import { SOCKET_PATH, type BoardAction, type BoardEvent, type ServerEvent } from '@wrible/contracts';
import type { Subscription } from 'rxjs';
import { WebSocket } from 'ws';
import { Board } from './board';
import { parseAction } from './board-messages';
import { TextRecognition } from './recognition/text-recognition';

const MAX_BUFFER = 16 * 1024 * 1024;
const HEARTBEAT = JSON.stringify({ type: 'heartbeat' } satisfies BoardEvent);

@WebSocketGateway({ path: SOCKET_PATH, maxPayload: 16 * 1024 })
export class BoardGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly clients = new Map<WebSocket, { id: number; alive: boolean }>();
  private readonly textEvents: Subscription;
  private nextClientId = 1;
  private readonly heartbeat = setInterval(() => {
    for (const [socket, client] of this.clients) {
      if (!client.alive) {
        socket.terminate();
        continue;
      }
      if (socket.readyState === WebSocket.OPEN) {
        client.alive = false;
        socket.ping();
        this.send(socket, HEARTBEAT);
      }
    }
  }, 10_000).unref();

  constructor(
    @Inject(Board) private readonly board: Board,
    @Inject(TextRecognition) private readonly text: TextRecognition,
  ) {
    this.textEvents = this.text.events.subscribe(event => this.broadcast(event));
  }

  handleConnection(socket: WebSocket, request: IncomingMessage) {
    const origin = request.headers.origin;
    if (origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}`) {
      socket.close(1008, 'Origem inválida');
      return;
    }
    const viewer = new URL(request.url ?? SOCKET_PATH, 'http://localhost').searchParams.get('mode') === 'view';
    const client = { id: this.nextClientId++, alive: true };
    this.clients.set(socket, client);
    socket.on('pong', () => { client.alive = true; });
    this.send(socket, JSON.stringify(this.board.snapshot()));
    this.send(socket, JSON.stringify(this.text.snapshot()));

    if (viewer) return;
    socket.on('message', (data, binary) => {
      if (binary) return;
      const action = parseAction(data.toString());
      if (!action) return;
      if ('id' in action) {
        this.text.apply(action);
        return;
      }
      const event = this.board.apply(client.id, action);
      const localId = action.type === 'begin' ? action.localId : undefined;
      if (event?.type === 'notice') {
        this.send(socket, JSON.stringify({ ...event, localId }));
      } else if (event?.type === 'begin' && localId !== undefined) {
        this.send(socket, JSON.stringify({ ...event, localId }));
        this.broadcast(event, socket);
      } else {
        this.broadcast(event);
      }
      this.updateText(socket, client.id, action, event);
    });
  }

  handleDisconnect(socket: WebSocket) {
    const client = this.clients.get(socket);
    if (!client) return;
    this.clients.delete(socket);
    const event = this.board.finish(client.id);
    this.broadcast(event);
    if (event?.type === 'end') this.finishTextStroke(event.id);
    this.text.disconnect(client.id);
  }

  onModuleDestroy() {
    clearInterval(this.heartbeat);
    this.textEvents.unsubscribe();
    for (const socket of this.clients.keys()) socket.terminate();
  }

  private updateText(socket: WebSocket, editor: number, action: BoardAction, event?: BoardEvent) {
    switch (event?.type) {
      case 'begin':
        if (action.type === 'begin' && action.recognize && action.brush.tool === 'pen'
            && !this.text.begin(editor, event.stroke.id)) {
          this.send(socket, JSON.stringify({ type: 'text:capacity' } satisfies ServerEvent));
        }
        break;
      case 'end':
        this.finishTextStroke(event.id);
        break;
      case 'remove':
        this.text.undo(event.id);
        break;
      case 'clear':
        this.text.clear();
    }
  }

  private finishTextStroke(id: number) {
    const stroke = this.board.getStroke(id);
    if (stroke) this.text.end(stroke);
  }

  private broadcast(event: ServerEvent | undefined, except?: WebSocket) {
    if (!event) return;
    const message = JSON.stringify(event);
    for (const socket of this.clients.keys()) {
      if (socket !== except) this.send(socket, message);
    }
  }

  private send(socket: WebSocket, message: string) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > MAX_BUFFER) {
      socket.terminate();
      return;
    }
    socket.send(message);
  }
}
