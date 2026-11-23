import { useEffect, useRef, useState } from 'react';
import {
  MONITOR_PATH, MONITOR_ROLE_TAKEN, MONITOR_VIEWER_REPLACED,
  type MonitorAction, type MonitorEvent, type MonitorRole, type MonitorSession,
} from '@wrible/contracts';
import { MonitorPeer, type DirectConnection } from './monitor-peer';

type Signaling = 'opening' | 'online' | 'reconnecting' | 'taken' | 'replaced' | 'local-only';

const INITIAL: MonitorSession = {
  type: 'session', capture: 'waiting', connection: null, viewerConnected: false,
};

export function useMonitorConnection(role: MonitorRole, enabled: boolean, capture: MediaStream | null) {
  const socketRef = useRef<WebSocket | null>(null);
  const captureRef = useRef(capture);
  const [signaling, setSignaling] = useState<Signaling>('opening');
  const [session, setSession] = useState(INITIAL);
  const [direct, setDirect] = useState<DirectConnection>('connecting');
  const [received, setReceived] = useState<MediaStream | null>(null);

  useEffect(() => {
    captureRef.current = capture;
    if (role === 'sender') {
      send(socketRef.current, { type: 'capture', active: !!capture });
    }
  }, [role, capture]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout>;
    let delay = 300;
    let peer: MonitorPeer | null = null;

    function closePeer() {
      peer?.close();
      peer = null;
      setReceived(null);
      setDirect('connecting');
    }

    function connect() {
      const url = new URL(MONITOR_PATH, window.location.href);
      url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
        send(socket, { type: 'join', role });
        if (role === 'sender' && captureRef.current) send(socket, { type: 'capture', active: true });
      };

      socket.onmessage = ({ data }) => {
        if (disposed || socketRef.current !== socket) return;
        const event = JSON.parse(data) as MonitorEvent;
        if (event.type !== 'session') {
          if (peer?.id === event.connection) peer.receive(event);
          return;
        }

        delay = 300;
        setSignaling('online');
        setSession(event);
        if (peer?.id === event.connection || (peer === null && event.connection === null)) return;
        closePeer();

        const source = captureRef.current;
        if (event.connection === null || (role === 'sender' && !source)) return;
        try {
          peer = new MonitorPeer(event.connection, role, {
            signal: action => send(socket, action),
            state: setDirect,
            stream: setReceived,
          });
          if (role === 'sender' && source) peer.start(source);
        } catch {
          setDirect('failed');
        }
      };

      socket.onclose = event => {
        if (disposed || socketRef.current !== socket) return;
        socketRef.current = null;
        closePeer();
        if (event.code === MONITOR_ROLE_TAKEN || event.code === MONITOR_VIEWER_REPLACED || event.code === 1008) {
          setSignaling(event.code === 1008 ? 'local-only' : event.code === MONITOR_ROLE_TAKEN ? 'taken' : 'replaced');
          return;
        }
        setSignaling('reconnecting');
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 5_000);
      };
    }

    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      peer?.close();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [role, enabled]);

  const retry = () => socketRef.current?.close();
  return { signaling, session, direct, received, retry };
}

function send(socket: WebSocket | null, action: MonitorAction) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(action));
}
