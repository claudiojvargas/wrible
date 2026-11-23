import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { SOCKET_PATH, type BoardAction, type BoardEvent } from '@wrible/contracts';
import { BoardRenderer } from './board-renderer';

type Connection = 'connecting' | 'connected' | 'reconnecting';

export function useBoard(canvas: RefObject<HTMLCanvasElement | null>, viewer: boolean) {
  const currentSocket = useRef<WebSocket | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [canUndo, setCanUndo] = useState(false);
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!canvas.current) return;
    const renderer = new BoardRenderer(canvas.current);
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
        const event = JSON.parse(data) as BoardEvent;
        monitor();
        if (event.type === 'snapshot') {
          delay = 500;
          setFull(false);
          setConnection('connected');
        }
        if (event.type === 'notice') setFull(true);
        if (event.type === 'remove' || event.type === 'clear') setFull(false);
        if (event.type === 'begin' || event.type === 'points') {
          renderer.update(event);
        } else if (event.type !== 'heartbeat' && event.type !== 'notice') {
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
      renderer.dispose();
    };
  }, [canvas, viewer]);

  const send = useCallback((action: BoardAction) => {
    const socket = currentSocket.current;
    if (viewer || socket?.readyState !== WebSocket.OPEN) return false;
    if (socket.bufferedAmount > 1_000_000) {
      socket.close();
      return false;
    }
    socket.send(JSON.stringify(action));
    return true;
  }, [viewer]);

  return { connection, canUndo, full, send };
}
