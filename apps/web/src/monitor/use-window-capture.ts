import { useCallback, useEffect, useRef, useState } from 'react';

const CAPTURE_VIDEO: MediaTrackConstraints = {
  displaySurface: 'window',
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 15, max: 15 },
};

export function useWindowCapture(enabled: boolean) {
  const active = useRef<MediaStream | null>(null);
  const request = useRef(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [picking, setPicking] = useState(false);
  const [feedback, setFeedback] = useState('');

  const stop = useCallback(() => {
    request.current++;
    const media = active.current;
    active.current = null;
    for (const track of media?.getTracks() ?? []) {
      track.onended = null;
      track.stop();
    }
    setPicking(false);
    setStream(null);
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', stop);
    return () => {
      window.removeEventListener('pagehide', stop);
      stop();
    };
  }, [stop]);

  async function chooseWindow() {
    if (!enabled || picking || active.current) return;
    const current = ++request.current;
    setFeedback('');
    setPicking(true);

    try {
      const media = await navigator.mediaDevices.getDisplayMedia({ video: CAPTURE_VIDEO, audio: false });
      const track = media.getVideoTracks()[0];
      if (request.current !== current || !track || track.readyState === 'ended') {
        media.getTracks().forEach(item => item.stop());
        return;
      }
      active.current = media;
      setStream(media);
      track.onended = () => {
        if (active.current === media) stop();
      };
    } catch (error) {
      if (request.current !== current) return;
      const name = error instanceof DOMException ? error.name : '';
      setFeedback(name === 'NotAllowedError' || name === 'AbortError'
        ? 'Captura cancelada ou não autorizada. Você pode escolher a janela novamente.'
        : 'O navegador não conseguiu capturar a janela. Confira as permissões de captura.');
    } finally {
      if (request.current === current) setPicking(false);
    }
  }

  return { stream, picking, feedback, chooseWindow, stop };
}
