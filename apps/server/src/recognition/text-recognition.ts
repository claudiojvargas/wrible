import { MAX_TEXT_LENGTH, type Stroke, type TextAction, type TextEvent, type TextSegment } from '@wrible/contracts';
import { Subject } from 'rxjs';
import type { HandwritingRecognizer } from './recognizer';

const MAX_SEGMENTS = 128;

interface Segment {
  value: TextSegment;
  editor: number | undefined;
  strokes: Map<number, Stroke | undefined>;
  timer?: ReturnType<typeof setTimeout>;
}

export class TextRecognition {
  readonly events = new Subject<TextEvent>();
  private readonly segments = new Map<number, Segment>();
  private readonly byEditor = new Map<number, Segment>();
  private readonly byStroke = new Map<number, Segment>();
  private nextId = 1;

  constructor(
    private readonly recognizer: HandwritingRecognizer | null,
    private readonly idleMs: number,
    private readonly language: string,
  ) {}

  snapshot(): TextEvent {
    return {
      type: 'text:snapshot',
      enabled: this.recognizer !== null,
      segments: [...this.segments.values()].map(segment => segment.value),
    };
  }

  begin(editor: number, strokeId: number) {
    if (!this.recognizer) return true;
    let segment = this.byEditor.get(editor);
    if (!segment) {
      if (this.segments.size >= MAX_SEGMENTS) return false;
      segment = {
        value: { id: this.nextId++, revision: 0, text: '', font: 'sans', status: 'pending' },
        editor,
        strokes: new Map(),
      };
      this.segments.set(segment.value.id, segment);
      this.byEditor.set(editor, segment);
    }
    segment.strokes.set(strokeId, undefined);
    this.byStroke.set(strokeId, segment);
    this.invalidate(segment);
    return true;
  }

  end(stroke: Stroke) {
    const segment = this.byStroke.get(stroke.id);
    if (!segment) return;
    segment.strokes.set(stroke.id, stroke);
    this.schedule(segment);
  }

  undo(strokeId: number) {
    const segment = this.byStroke.get(strokeId);
    if (!segment) return;
    this.byStroke.delete(strokeId);
    segment.strokes.delete(strokeId);
    if (!segment.strokes.size) {
      this.remove(segment);
      return;
    }
    this.invalidate(segment, '');
    this.schedule(segment);
  }

  disconnect(editor: number) {
    const segment = this.byEditor.get(editor);
    if (segment) segment.editor = undefined;
    this.byEditor.delete(editor);
  }

  apply(action: TextAction) {
    const segment = this.segments.get(action.id);
    if (!segment) return;
    switch (action.type) {
      case 'text:font':
        this.update(segment, { font: action.font });
        break;
      case 'text:confirm':
        if (segment.value.status === 'confirmed') return;
        this.releaseInk(segment);
        this.update(segment, {
          revision: segment.value.revision + 1,
          text: action.text,
          status: 'confirmed',
        });
        break;
      case 'text:remove':
        this.remove(segment);
    }
  }

  clear() {
    if (!this.segments.size) return;
    for (const segment of this.segments.values()) clearTimeout(segment.timer);
    this.segments.clear();
    this.byEditor.clear();
    this.byStroke.clear();
    this.events.next({ type: 'text:clear' });
  }

  onModuleDestroy() {
    this.clear();
    this.events.complete();
  }

  private releaseInk(segment: Segment) {
    clearTimeout(segment.timer);
    if (segment.editor !== undefined) this.byEditor.delete(segment.editor);
    for (const strokeId of segment.strokes.keys()) this.byStroke.delete(strokeId);
    segment.strokes.clear();
  }

  private remove(segment: Segment) {
    this.releaseInk(segment);
    this.segments.delete(segment.value.id);
    this.events.next({ type: 'text:remove', id: segment.value.id });
  }

  private invalidate(segment: Segment, text = segment.value.text) {
    clearTimeout(segment.timer);
    this.update(segment, { revision: segment.value.revision + 1, text, status: 'pending' });
  }

  private schedule(segment: Segment) {
    const strokes: Stroke[] = [];
    for (const stroke of segment.strokes.values()) {
      if (!stroke) return;
      strokes.push(stroke);
    }
    const { revision } = segment.value;
    segment.timer = setTimeout(() => void this.recognize(segment, revision, strokes), this.idleMs);
  }

  private async recognize(segment: Segment, revision: number, strokes: Stroke[]) {
    const isCurrent = () => this.segments.get(segment.value.id) === segment && segment.value.revision === revision;
    if (!this.recognizer || !isCurrent()) return;
    try {
      const text = await this.recognizer.recognize(strokes, this.language);
      if (isCurrent()) {
        this.update(segment, { text: text.trim().slice(0, MAX_TEXT_LENGTH), status: 'preview' });
      }
    } catch {
      if (isCurrent()) this.update(segment, { status: 'unavailable' });
    }
  }

  private update(segment: Segment, patch: Partial<TextSegment>) {
    segment.value = { ...segment.value, ...patch };
    this.events.next({ type: 'text:segment', segment: segment.value });
  }
}
