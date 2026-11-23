import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { SOCKET_PATH, type Brush, type ClientAction, type Point, type ServerEvent, type TextSegment } from '@wrible/contracts';
import { BoardRenderer } from './board-renderer';

type Connection = 'connecting' | 'connected' | 'reconnecting';

interface RecognitionState {
  enabled: boolean;
  segments: TextSegment[];
  session: number;
  full: boolean;
}

export function useBoard(canvas: RefObject<HTMLCanvasElement | null>, viewer: boolean) {
  const currentSocket = useRef<WebSocket | null>(null);
  const currentRenderer = useRef<BoardRenderer | null>(null);
  const nextLocalId = useRef(1);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [canUndo, setCanUndo] = useState(false);
  const [full, setFull] = useState(false);
  const [recognition, setRecognition] = useState<RecognitionState>({
    enabled: false, segments: [], session: 0, full: false,
  });

  useEffect(() => {
    if (!canvas.current) return;
    const renderer = new BoardRenderer(canvas.current);
    currentRenderer.current = renderer;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout>;
    let watchdog: ReturnType<typeof setTimeout>;
    let delay = 500;

    function connect() {
      const url = new URL(SOCKET_PATH, window.location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      if (viewer) url.searchParams.set('mode', 'view');
      const socket = new WebSocket(url);
      currentSocket.current = socket;

      const reconnect = () => {
        if (disposed || currentSocket.current !== socket) return;
        currentSocket.current = null;
        clearTimeout(watchdog);
        socket.close();
        renderer.discardPreviews();
        setConnection('reconnecting');
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 5_000);
      };

      const monitor = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(reconnect, 30_000);
      };

      monitor();
      socket.onmessage = ({ data }) => {
        if (disposed || currentSocket.current !== socket) return;
        const event = JSON.parse(data) as ServerEvent;
        monitor();
        switch (event.type) {
          case 'text:snapshot':
            setRecognition(state => ({
              enabled: event.enabled, segments: event.segments, session: state.session + 1, full: false,
            }));
            return;
          case 'text:segment':
            setRecognition(state => {
              const segment = event.segment;
              const known = state.segments.some(item => item.id === segment.id);
              const segments = known
                ? state.segments.map(item => item.id === segment.id ? segment : item)
                : [...state.segments, segment];
              return { ...state, segments };
            });
            return;
          case 'text:remove':
            setRecognition(state => ({
              ...state, segments: state.segments.filter(item => item.id !== event.id), full: false,
            }));
            return;
          case 'text:clear':
            setRecognition(state => ({ ...state, segments: [], full: false }));
            return;
          case 'text:capacity':
            setRecognition(state => ({ ...state, full: true }));
            return;
        }
        if (event.type === 'snapshot') {
          delay = 500;
          setFull(false);
          setConnection('connected');
        }
        if (event.type === 'notice') setFull(true);
        if (event.type === 'remove' || event.type === 'clear') setFull(false);
        if (event.type === 'begin' || event.type === 'points' || event.type === 'notice') {
          renderer.update(event);
        } else if (event.type !== 'heartbeat') {
          setCanUndo(renderer.update(event));
        }
      };
      socket.onclose = reconnect;
    }

    const offline = () => currentSocket.current?.close();
    window.addEventListener('offline', offline);
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearTimeout(watchdog);
      window.removeEventListener('offline', offline);
      currentSocket.current?.close();
      currentSocket.current = null;
      currentRenderer.current = null;
      renderer.dispose();
    };
  }, [canvas, viewer]);

  const send = useCallback((action: ClientAction) => {
    const socket = currentSocket.current;
    if (viewer || socket?.readyState !== WebSocket.OPEN) return false;
    if (socket.bufferedAmount > 1_000_000) {
      socket.close();
      return false;
    }
    socket.send(JSON.stringify(action));
    return true;
  }, [viewer]);

  function beginStroke(brush: Brush, point: Point, recognize: boolean): number | undefined {
    const localId = nextLocalId.current++;
    if (!send({ type: 'begin', localId, brush, point, recognize: recognize ? true : undefined })) return;
    currentRenderer.current?.beginPreview(localId, brush, point);
    return localId;
  }

  function previewPoints(localId: number, points: Point[]) {
    currentRenderer.current?.appendPreview(localId, points);
  }

  return { connection, canUndo, full, recognition, send, beginStroke, previewPoints };
}
