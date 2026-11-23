import { useState } from 'react';
import { TEXT_FONTS, MAX_TEXT_LENGTH, type TextAction, type TextSegment } from '@wrible/contracts';

const fontLabels = { sans: 'Sem serifa', serif: 'Com serifa', mono: 'Monoespaçada' };

interface TextPanelProps {
  segments: TextSegment[];
  viewer: boolean;
  connected: boolean;
  full: boolean;
  send: (action: TextAction) => boolean;
}

export function TextPanel({ segments, viewer, connected, full, send }: TextPanelProps) {
  return (
    <section className="text-panel" aria-labelledby="text-panel-title">
      <h2 id="text-panel-title">Texto reconhecido</h2>
      {full && <p role="status">Limite de trechos atingido. Apague um trecho para continuar convertendo.</p>}
      {segments.length
        ? <div className="text-segments">
            {[...segments].reverse().map(segment => (
              <TextCard key={segment.id} segment={segment} viewer={viewer} connected={connected} send={send} />
            ))}
          </div>
        : <p>Escreva na lousa e faça uma pausa para converter.</p>}
    </section>
  );
}

function TextCard({ segment, viewer, connected, send }: {
  segment: TextSegment;
  viewer: boolean;
  connected: boolean;
  send: (action: TextAction) => boolean;
}) {
  const [draft, setDraft] = useState<string>();
  const { id, font, status, text } = segment;
  const value = draft ?? text;
  const label = {
    pending: 'Reconhecendo…',
    preview: text ? 'Prévia' : 'Nenhum texto reconhecido',
    unavailable: 'Conversão indisponível',
    confirmed: 'Confirmado',
  }[status];

  return (
    <article className="text-card">
      <div className="text-card-header">
        <span role="status">{label}</span>
        {!viewer && <label>
          Fonte
          <select value={font} disabled={!connected} onChange={event => {
            const next = TEXT_FONTS.find(option => option === event.currentTarget.value);
            if (next) send({ type: 'text:font', id, font: next });
          }}>
            {TEXT_FONTS.map(option => <option key={option} value={option}>{fontLabels[option]}</option>)}
          </select>
        </label>}
      </div>
      {viewer || status === 'confirmed'
        ? <p className={`text-result text-font-${font}`}>{text}</p>
        : <textarea aria-label="Corrigir prévia de texto" className={`text-result text-font-${font}`}
            value={value} maxLength={MAX_TEXT_LENGTH} disabled={!connected}
            onChange={event => setDraft(event.currentTarget.value)} />}
      {!viewer && <div className="text-card-actions">
        {status !== 'confirmed' && <button type="button" className="tool" disabled={!connected || !value.trim()}
          onClick={() => send({ type: 'text:confirm', id, text: value.trim() })}>Confirmar</button>}
        <button type="button" className="tool clear" disabled={!connected}
          onClick={() => send({ type: 'text:remove', id })}>Apagar trecho</button>
      </div>}
    </article>
  );
}
