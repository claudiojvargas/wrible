import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, Eraser, Eye, Maximize, Minimize, PenLine, Trash2, Type, Undo2, X } from 'lucide-react';
import { BOARD, type Brush } from '@wrible/contracts';
import { useBoard } from './use-board';
import { useDrawing } from './use-drawing';
import { useFullscreen } from './use-fullscreen';
import { TextPanel } from './text-panel';
import './styles.css';

const colors = [
  ['#232925', 'Grafite'],
  ['#28785c', 'Verde'],
  ['#3672cf', 'Azul'],
  ['#ca4f58', 'Vermelho'],
  ['#da9b37', 'Âmbar'],
] as const;

const viewer = new URLSearchParams(location.search).get('mode') === 'view';

function App() {
  const app = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [brush, setBrush] = useState<Brush>({ tool: 'pen', color: colors[0][0], width: 8 });
  const [convert, setConvert] = useState(false);
  const board = useBoard(canvas, viewer);
  const { connection, canUndo, full, recognition, send } = board;
  const connected = connection === 'connected';
  const conversionActive = recognition.enabled && convert;
  const drawing = useDrawing(brush, connected && !viewer, conversionActive, board);
  const { fullscreen, toggleFullscreen } = useFullscreen(app);
  const fullscreenLabel = fullscreen ? 'Sair da tela cheia' : 'Tela cheia';
  const status = { connecting: 'Conectando', connected: 'Conectado', reconnecting: 'Reconectando' };

  return (
    <div ref={app} className={fullscreen ? 'app is-fullscreen' : 'app'}>
      <header className="topbar">
        <a className="brand" href={viewer ? '?mode=view' : './'} aria-label="Wrible">
          <span className="mark"><PenLine size={19} aria-hidden="true" /></span>
          <span>wrible<span className="brand-period">.</span></span>
        </a>
        <div className="header-actions">
          <span className={`connection ${connection}`} role="status">
            <span className="status-dot" />{status[connection]}
          </span>
          {viewer
            ? <a className="mode-button" href="./"><PenLine size={16} /> <span>Editar lousa</span></a>
            : <a className="mode-button" href="?mode=view" target="_blank" rel="noopener">
                <Eye size={17} /> <span>Modo visualização</span><ArrowUpRight className="external" size={14} />
              </a>}
          <button type="button" className="mode-button fullscreen-button"
            aria-label={fullscreenLabel} title={fullscreenLabel} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize size={17} aria-hidden="true" /> : <Maximize size={17} aria-hidden="true" />}
            <span>{fullscreenLabel}</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <div className="heading">
          <div>
            <h1>Lousa digital</h1>
            <p>{viewer ? 'Acompanhe os traços em tempo real.' : 'Desenhe e compartilhe seus traços em tempo real.'}</p>
          </div>
        </div>

        {!viewer && <div className="toolbar" role="group" aria-label="Ferramentas da lousa">
          <div className="tool-group" role="group" aria-label="Ferramenta">
            <button type="button" className="tool" aria-pressed={brush.tool === 'pen'}
              onClick={() => setBrush({ ...brush, tool: 'pen' })}>
              <PenLine size={17} /> <span>Caneta</span>
            </button>
            <button type="button" className="tool" aria-pressed={brush.tool === 'eraser'}
              onClick={() => setBrush({ ...brush, tool: 'eraser' })}>
              <Eraser size={17} /> <span>Borracha</span>
            </button>
          </div>
          <div className="tool-group palette" role="group" aria-label="Cor do traço">
            {colors.map(([color, name]) => (
              <button type="button" className="swatch" aria-label={name} title={name} key={color}
                aria-pressed={brush.color === color && brush.tool === 'pen'}
                onClick={() => setBrush({ ...brush, tool: 'pen', color })}>
                <span style={{ backgroundColor: color }} />
              </button>
            ))}
          </div>
          <label className="tool-group thickness">
            <span>Espessura</span>
            <input type="range" min={BOARD.minBrush} max={BOARD.maxBrush} value={brush.width}
              onChange={(event) => setBrush({ ...brush, width: event.currentTarget.valueAsNumber })} />
            <output>{brush.width}</output>
          </label>
          {recognition.enabled && <div className="tool-group">
            <button type="button" className="tool" aria-pressed={conversionActive}
              onClick={() => setConvert(active => !active)}>
              <Type size={17} aria-hidden="true" /> <span>Converter em texto</span>
            </button>
          </div>}
          <div className="tool-group edit-actions">
            <button type="button" className="tool" disabled={!connected || !canUndo}
              onClick={() => send({ type: 'undo' })}>
              <Undo2 size={17} /> <span>Desfazer</span>
            </button>
            <button type="button" className="tool clear" disabled={!connected}
              onClick={() => dialog.current?.showModal()}>
              <Trash2 size={17} /> <span>Limpar</span>
            </button>
          </div>
        </div>}

        <div className="surface">
          <canvas ref={canvas} className={`board ${connected && !viewer ? 'editable' : ''}`}
            aria-label={viewer ? 'Lousa compartilhada em modo visualização' : 'Área de desenho da lousa compartilhada'}
            {...drawing} />
        </div>
        {(recognition.segments.length > 0 || conversionActive || recognition.full) && (
          <TextPanel key={recognition.session} segments={recognition.segments} viewer={viewer}
            connected={connected} full={recognition.full} send={send} />
        )}
        <footer className={full ? 'footnote has-notice' : 'footnote'}>
          <span>{viewer ? 'Visualização em tempo real' : 'Mouse, toque ou caneta'}</span>
          <span role="status">{full ? 'Limite da lousa atingido. Desfaça um traço ou limpe a lousa.' : 'Lousa compartilhada'}</span>
        </footer>
      </main>

      {!viewer && <dialog ref={dialog} aria-labelledby="clear-title">
        <form method="dialog">
          <div className="dialog-heading">
            <h2 id="clear-title">Limpar a lousa?</h2>
            <button className="tool" aria-label="Fechar" value="cancel"><X size={19} /></button>
          </div>
          <p>Todos os traços serão apagados para quem estiver conectado.</p>
          <div className="dialog-actions">
            <button className="mode-button" value="cancel" autoFocus>Cancelar</button>
            <button className="danger-button" value="clear" disabled={!connected}
              onClick={() => send({ type: 'clear' })}>Limpar lousa</button>
          </div>
        </form>
      </dialog>}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
