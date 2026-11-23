import { useCallback, useEffect, useRef, useState } from 'react';

export type ScreenCaptureSource = () => Promise<{ stream: MediaStream } | { error: string }>;

export function useScreenCapture(source: ScreenCaptureSource, publishOnSelection: boolean) {
  const active = useRef<MediaStream | null>(null);
  const request = useRef(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [publishing, setPublishing] = useState(false);
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
    setPublishing(false);
    setStream(null);
    setFeedback('');
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', stop);
    return () => {
      window.removeEventListener('pagehide', stop);
      stop();
    };
  }, [stop]);

  async function choose() {
    if (picking || active.current) return;
    const current = ++request.current;
    setFeedback('');
    setPicking(true);

    try {
      const result = await source();
      if ('error' in result) {
        if (request.current === current) setFeedback(result.error);
        return;
      }
      const media = result.stream;
      const track = media.getVideoTracks()[0];
      if (request.current !== current || !track || track.readyState === 'ended') {
        media.getTracks().forEach(item => item.stop());
        if (request.current === current) setFeedback('A fonte selecionada não entregou vídeo. Escolha outra fonte.');
        return;
      }

      active.current = media;
      setStream(media);
      setPublishing(publishOnSelection);
      track.onended = () => {
        if (active.current !== media) return;
        stop();
        setFeedback('Compartilhamento encerrado pelo navegador. Você pode escolher outra fonte.');
      };
    } catch {
      if (request.current === current) setFeedback('A captura não pôde ser iniciada. Escolha uma fonte e tente novamente.');
    } finally {
      if (request.current === current) setPicking(false);
    }
  }

  function publish() {
    const track = active.current?.getVideoTracks()[0];
    if (track?.readyState === 'live') setPublishing(true);
  }

  return { stream, publishing, picking, feedback, choose, publish, stop };
}
