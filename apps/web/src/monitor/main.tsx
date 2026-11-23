import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, Maximize, Minimize, Monitor, Play, Square } from 'lucide-react';
import { MONITOR_ADDRESSES_PATH, type MonitorAddress, type MonitorRole } from '@wrible/contracts';
import { useFullscreen } from '../use-fullscreen';
import { captureExtendedScreen, captureWindowOrScreen } from './browser-capture';
import { useMonitorConnection } from './use-monitor-connection';
import { useScreenCapture } from './use-screen-capture';
import { useVideoPlayback } from './use-video-playback';
import '../styles.css';
import './monitor.css';

const mode = new URLSearchParams(window.location.search).get('mode');
const isViewer = mode === 'watch';
const isExtended = mode === 'extend';
const role: MonitorRole = isViewer ? 'viewer' : 'sender';

function capabilityError(): string {
  if (!isViewer && !window.isSecureContext) {
    return 'Abra o transmissor no PC usando localhost ou HTTPS para capturar uma janela.';
  }
  if (typeof window.RTCPeerConnection !== 'function') return 'Este navegador não oferece suporte a WebRTC.';
  if ((isViewer || isExtended) && !('srcObject' in HTMLVideoElement.prototype)) return 'Este navegador não exibe vídeo em tempo real.';
  if (!isViewer && !navigator.mediaDevices?.getDisplayMedia) return 'Este navegador não oferece captura de janela.';
  return '';
}

function MonitorApp() {
  const unsupported = capabilityError();
  const stage = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const { fullscreen, toggleFullscreen } = useFullscreen(stage);
  const capture = useScreenCapture(isExtended ? captureExtendedScreen : captureWindowOrScreen, !isExtended);
  const outgoing = capture.publishing ? capture.stream : null;
  const link = useMonitorConnection(role, !unsupported, outgoing);
  const media = useVideoPlayback(video, isExtended ? capture.stream : link.received);
  const online = link.signaling === 'online';
  const captureUnavailable = !!unsupported || link.signaling === 'local-only' || link.signaling === 'taken';

  const status = (() => {
    if (unsupported) return unsupported;
    if (link.signaling === 'local-only') return 'O modo monitor está disponível apenas na rede local.';
    if (link.signaling === 'taken') return 'Já existe um transmissor neste servidor.';
    if (link.signaling === 'replaced') return 'Outra aba assumiu a visualização.';
    if (!isViewer && capture.picking) return 'Aguardando a escolha da janela ou tela…';
    if (isExtended && capture.stream && !outgoing) return 'Prévia local. Confira a tela antes de transmitir.';
    if (!isViewer && !online && outgoing) return 'Captura ativa no PC. Aguardando conexão com o servidor…';
    if (link.signaling === 'reconnecting') return 'Reconectando ao servidor…';
    if (!online) return 'Conectando ao servidor…';
    if (link.direct === 'failed') return 'A conexão direta falhou. Confira se os dois dispositivos estão na mesma rede.';
    if (link.direct === 'interrupted') return 'Conexão de vídeo interrompida. Aguardando recuperação…';
    if (!isViewer) {
      if (!capture.stream) return 'Pronto para transmitir';
      if (!link.session.viewerConnected) return 'Captura ativa. Aguardando o receptor…';
      return link.direct === 'connected' ? 'Transmitindo para o receptor' : 'Estabelecendo a conexão de vídeo…';
    }
    if (link.session.capture === 'ended') return 'Transmissão encerrada';
    if (link.session.capture === 'waiting') return 'Aguardando o PC iniciar a transmissão…';
    if (media.feedback === 'paused') return 'O navegador pausou a reprodução automática.';
    if (media.feedback === 'unsupported') return 'O navegador não conseguiu reproduzir o vídeo recebido.';
    return link.received && link.direct === 'connected' ? 'Recebendo a transmissão' : 'Estabelecendo a conexão de vídeo…';
  })();

  const fullscreenLabel = fullscreen ? 'Sair da tela cheia' : 'Tela cheia';
  const overVideo = !link.received || media.feedback !== null || link.direct === 'failed';

  return (
    <div className="monitor-app">
      <header className="topbar monitor-topbar">
        <a href="/" className="mode-button"><ArrowLeft size={16} /> Lousa</a>
        <nav className="monitor-nav" aria-label="Modo monitor">
          <a href="/monitor/?mode=extend" className="mode-button" aria-current={isExtended ? 'page' : undefined}>Monitor estendido</a>
          <a href="/monitor/" className="mode-button" aria-current={!isViewer && !isExtended ? 'page' : undefined}>Espelhar janela</a>
          <a href="/monitor/?mode=watch" className="mode-button" aria-current={isViewer ? 'page' : undefined}>Assistir</a>
        </nav>
      </header>

      <main className="monitor-workspace">
        <h1>{isViewer ? 'Assistir à transmissão' : isExtended ? 'Monitor estendido' : 'Transmitir tela'}</h1>
        {isViewer ? (
          <section ref={stage} className={`monitor-stage${fullscreen ? ' is-fullscreen' : ''}`} aria-label="Vídeo da transmissão">
            <video ref={video} autoPlay muted playsInline onLoadedMetadata={media.updateResolution} onResize={media.updateResolution} />
            {overVideo && <div className="monitor-overlay">
              <Monitor size={34} aria-hidden="true" />
              <p role="status">{status}</p>
              {media.feedback === 'paused' && link.direct !== 'failed' && <button type="button" className="mode-button" onClick={media.play}>
                <Play size={16} /> Iniciar visualização
              </button>}
              {link.direct === 'failed' && <button type="button" className="mode-button" onClick={link.retry}>Tentar novamente</button>}
            </div>}
            {!unsupported && <button type="button" className="mode-button monitor-fullscreen"
              aria-label={fullscreenLabel} title={fullscreenLabel} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize size={16} aria-hidden="true" /> : <Maximize size={16} aria-hidden="true" />}
              <span>{fullscreenLabel}</span>
            </button>}
          </section>
        ) : (
          <div className="monitor-card">
            <div className="monitor-controls">
              <button type="button" className="mode-button monitor-primary" disabled={captureUnavailable || capture.picking || !!capture.stream}
                onClick={capture.choose}><Monitor size={17} /> {isExtended ? 'Escolher monitor virtual' : 'Escolher janela ou tela'}</button>
              {isExtended && capture.stream && !outgoing && <button type="button" className="mode-button monitor-primary"
                disabled={captureUnavailable || !media.resolution || media.feedback !== null} onClick={capture.publish}>
                <Play size={16} /> Iniciar transmissão
              </button>}
              {capture.stream && <button type="button" className="mode-button" onClick={capture.stop}>
                <Square size={16} /> {outgoing ? 'Encerrar transmissão' : 'Descartar prévia'}
              </button>}
              {link.direct === 'failed' && <button type="button" className="mode-button" onClick={link.retry}>Tentar novamente</button>}
            </div>
            {capture.feedback && <p role="status">{capture.feedback}</p>}
            {isExtended && !capture.stream && <p className="monitor-hint">
              No Windows, use <strong>Estender</strong>. No seletor do navegador, abra <strong>Tela inteira</strong> e escolha o monitor virtual.
            </p>}
            {isExtended && capture.stream && (
              <section className="monitor-preview" aria-label="Prévia da tela capturada">
                <video ref={video} autoPlay muted playsInline onLoadedMetadata={media.updateResolution} onResize={media.updateResolution} />
                {media.feedback === 'paused' && <button type="button" className="mode-button" onClick={media.play}>Reproduzir prévia</button>}
                {media.feedback === 'unsupported' && <p role="status">Este navegador não conseguiu reproduzir a prévia.</p>}
                {!outgoing && <p>Confirme que a prévia mostra o monitor virtual. Mova o mouse físico do PC para verificar o cursor.</p>}
              </section>
            )}
            {!unsupported && link.signaling !== 'local-only' && <ViewerAddress />}
          </div>
        )}

        <div className="monitor-meta" role="status">
          {(!isViewer || !overVideo) && <span>{status}</span>}
          {isViewer && media.resolution && <span>Resolução recebida {media.resolution}</span>}
        </div>
      </main>
    </div>
  );
}

function ViewerAddress() {
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  const [addresses, setAddresses] = useState<MonitorAddress[] | null>(null);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    if (!loopback) return;
    const controller = new AbortController();
    fetch(MONITOR_ADDRESSES_PATH, { signal: controller.signal })
      .then(response => response.ok ? response.json() as Promise<MonitorAddress[]> : [])
      .then(items => {
        if (controller.signal.aborted) return;
        setAddresses(items);
        setSelected(items[0]?.address ?? '');
      })
      .catch(() => {
        if (!controller.signal.aborted) setAddresses([]);
      });
    return () => controller.abort();
  }, [loopback]);

  const url = new URL('/monitor/?mode=watch', window.location.href);
  if (loopback && selected) url.hostname = selected;
  return (
    <div className="monitor-address">
      <h2>Abra no dispositivo receptor</h2>
      {addresses && addresses.length > 1 && <label>
        Rede
        <select value={selected} onChange={event => setSelected(event.currentTarget.value)}>
          {addresses.map(({ name, address }) => (
            <option key={`${name}-${address}`} value={address}>{name} · {address}</option>
          ))}
        </select>
      </label>}
      {!loopback || selected
        ? <a href={url.href} target="_blank" rel="noopener">{url.href}</a>
        : <p>{addresses === null ? 'Buscando o endereço do PC…' : 'Use ipconfig para encontrar o IPv4 do PC.'}</p>}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><MonitorApp /></StrictMode>);
