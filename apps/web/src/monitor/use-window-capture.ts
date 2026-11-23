import { useCallback, useEffect, useRef, useState } from 'react';

const PREFERRED_VIDEO: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 15, max: 15 },
};

function captureError(error: unknown): string {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
      return 'Captura cancelada ou bloqueada pelo navegador (NotAllowedError). Escolha uma fonte e clique em Compartilhar no seletor.';
    case 'AbortError':
      return 'O navegador interrompeu a captura (AbortError). Tente escolher a janela ou tela novamente.';
    case 'InvalidStateError':
      return 'O seletor precisa de uma aba ativa (InvalidStateError). Abra esta página em uma aba do Chrome ou Edge e clique em Escolher janela ou tela.';
    case 'NotReadableError':
      return 'O navegador selecionou a fonte, mas não conseguiu lê-la (NotReadableError). Tente outra janela ou tela.';
    case 'NotFoundError':
      return 'O navegador não encontrou uma janela ou tela disponível (NotFoundError). Abra a janela desejada e tente novamente.';
    default:
      return name ? `O navegador não conseguiu iniciar a captura (${name}).` : 'O navegador não conseguiu iniciar a captura.';
  }
}

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
      const media = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = media.getVideoTracks()[0];
      if (request.current !== current || !track || track.readyState === 'ended') {
        media.getTracks().forEach(item => item.stop());
        if (request.current === current) setFeedback('A fonte selecionada não entregou vídeo. Escolha outra janela ou tela.');
        return;
      }
      active.current = media;
      setStream(media);
      track.onended = () => {
        if (active.current === media) stop();
      };
      // Older browsers or capture sources can reject the preferred quality.
      void track.applyConstraints?.(PREFERRED_VIDEO).catch(() => undefined);
    } catch (error) {
      if (request.current !== current) return;
      setFeedback(captureError(error));
    } finally {
      if (request.current === current) setPicking(false);
    }
  }

  return { stream, picking, feedback, chooseWindow, stop };
}
