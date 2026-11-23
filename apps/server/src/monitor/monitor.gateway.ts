import type { IncomingMessage } from 'node:http';
import type { OnModuleDestroy } from '@nestjs/common';
import { WebSocketGateway, type OnGatewayConnection, type OnGatewayDisconnect } from '@nestjs/websockets';
import {
  MONITOR_PATH, MONITOR_ROLE_TAKEN, MONITOR_VIEWER_REPLACED,
  type MonitorAction, type MonitorEvent, type MonitorRole, type MonitorSession,
} from '@wrible/contracts';
import { WebSocket } from 'ws';
import { isLocalMonitorRequest } from './lan';
import { parseMonitorAction } from './monitor-messages';

@WebSocketGateway({ path: MONITOR_PATH, maxPayload: 128 * 1024 })
export class MonitorGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly sockets = new Map<WebSocket, boolean>();
  private readonly participants: Partial<Record<MonitorRole, WebSocket>> = {};
  private capture: MonitorSession['capture'] = 'waiting';
  private connection: number | null = null;
  private nextConnection = 1;
  private readonly heartbeat = setInterval(() => {
    for (const [socket, alive] of this.sockets) {
      if (!alive) socket.terminate();
      else if (socket.readyState === WebSocket.OPEN) {
        this.sockets.set(socket, false);
        socket.ping();
      }
    }
  }, 10_000).unref();

  handleConnection(socket: WebSocket, request: IncomingMessage) {
    if (!isLocalMonitorRequest(request.headers.host, request.socket.remoteAddress)
        || (request.headers.origin && ![`http://${request.headers.host}`, `https://${request.headers.host}`].includes(request.headers.origin))) {
      socket.close(1008, 'Monitor disponível apenas na rede local');
      return;
    }

    this.sockets.set(socket, true);
    socket.on('pong', () => { this.sockets.set(socket, true); });
    socket.on('message', (data, binary) => {
      if (binary) return;
      const action = parseMonitorAction(data.toString());
      if (action) this.handleAction(socket, action);
    });
  }

  handleDisconnect(socket: WebSocket) {
    this.sockets.delete(socket);
    if (this.participants.sender === socket) {
      delete this.participants.sender;
      if (this.capture === 'active') this.capture = 'ended';
    } else if (this.participants.viewer === socket) {
      delete this.participants.viewer;
    } else {
      return;
    }
    this.refreshSession();
  }

  onModuleDestroy() {
    clearInterval(this.heartbeat);
    for (const socket of this.sockets.keys()) socket.terminate();
  }

  private handleAction(socket: WebSocket, action: MonitorAction) {
    const { sender, viewer } = this.participants;

    if (action.type === 'join') {
      if (socket === sender || socket === viewer) return;
      if (action.role === 'sender' && sender?.readyState === WebSocket.OPEN) {
        socket.close(MONITOR_ROLE_TAKEN, 'Já existe um transmissor');
        return;
      }
      this.participants[action.role] = socket;
      if (action.role === 'viewer') viewer?.close(MONITOR_VIEWER_REPLACED, 'Outra aba assumiu a visualização');
      else if (sender) this.capture = 'ended';
      this.refreshSession();
      return;
    }

    if (action.type === 'capture') {
      if (socket !== sender || (this.capture === 'active') === action.active) return;
      this.capture = action.active ? 'active' : 'ended';
      this.refreshSession();
      return;
    }

    if (action.connection !== this.connection) return;
    if (socket === sender && action.type !== 'answer') this.send(viewer, action);
    if (socket === viewer && action.type !== 'offer') this.send(sender, action);
  }

  private refreshSession() {
    const { sender, viewer } = this.participants;
    const viewerConnected = viewer?.readyState === WebSocket.OPEN;
    this.connection = sender?.readyState === WebSocket.OPEN && viewerConnected && this.capture === 'active'
      ? this.nextConnection++ : null;
    const event: MonitorSession = { type: 'session', capture: this.capture, connection: this.connection, viewerConnected };
    this.send(sender, event);
    this.send(viewer, event);
  }

  private send(socket: WebSocket | undefined, event: MonitorEvent) {
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 1024 * 1024) {
      socket.terminate();
      return;
    }
    socket.send(JSON.stringify(event));
  }
}
