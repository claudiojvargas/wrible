import type { ScreenCaptureSource } from './use-screen-capture';

const PREFERRED_VIDEO: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 15, max: 15 },
};

type DisplaySettings = MediaTrackSettings & { cursor?: 'always' | 'motion' | 'never' };
type DisplayConstraints = MediaTrackConstraints & { cursor?: 'always' };

export const captureWindowOrScreen: ScreenCaptureSource = () => captureDisplay(false);
export const captureExtendedScreen: ScreenCaptureSource = () => captureDisplay(true);

async function captureDisplay(extended: boolean): ReturnType<ScreenCaptureSource> {
  let stream: MediaStream;
  try {
    // Keep the native picker unconstrained. Preferences are applied after permission.
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (error) {
    return { error: captureError(error) };
  }

  const reject = (error: string) => {
    for (const track of stream.getTracks()) track.stop();
    return { error };
  };
  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState === 'ended') return reject('A fonte selecionada não entregou vídeo. Escolha outra fonte.');

  if (!extended) {
    void applyPreferences(track, PREFERRED_VIDEO);
    return { stream };
  }

  try {
    const settings = (): DisplaySettings => track.getSettings?.() ?? {};
    const original = settings();
    if (original.displaySurface && original.displaySurface !== 'monitor') {
      return reject('Selecione Tela inteira no navegador e escolha o monitor virtual do Windows.');
    }

    await applyPreferences(track, { ...PREFERRED_VIDEO, cursor: 'always' });
    const cursor = settings().cursor ?? original.cursor;
    if (cursor && cursor !== 'always') {
      await applyPreferences(track, { cursor: 'always' });
      if ((settings().cursor ?? cursor) !== 'always') {
        return reject('Esta fonte não mantém o cursor visível na captura. Escolha outra fonte ou use um navegador que capture o cursor.');
      }
    }
    return { stream };
  } catch {
    return reject('O navegador não conseguiu verificar a fonte capturada. Escolha a tela novamente.');
  }
}

async function applyPreferences(track: MediaStreamTrack, preferences: DisplayConstraints) {
  try {
    await track.applyConstraints?.(preferences);
  } catch {
    // The current capture can still be used if the browser rejects a preference.
  }
}

function captureError(error: unknown): string {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
      return 'Captura cancelada ou bloqueada pelo navegador (NotAllowedError). Escolha uma fonte e clique em Compartilhar no seletor.';
    case 'AbortError':
      return 'O navegador interrompeu a captura (AbortError). Tente escolher a fonte novamente.';
    case 'InvalidStateError':
      return 'O seletor precisa de uma aba ativa (InvalidStateError). Volte para esta aba e abra o seletor pelo botão.';
    case 'NotReadableError':
      return 'O navegador selecionou a fonte, mas não conseguiu lê-la (NotReadableError). Tente selecionar a tela novamente.';
    case 'NotFoundError':
      return 'O navegador não encontrou uma fonte de vídeo disponível (NotFoundError). Confira as telas nas configurações do Windows.';
    default:
      return name ? `O navegador não conseguiu iniciar a captura (${name}).` : 'O navegador não conseguiu iniciar a captura.';
  }
}
