import { type BoardAction, type BoardEvent, type Stroke } from '@wrible/contracts';

const MAX_STROKES = 2_000;
const MAX_POINTS = 100_000;

export class Board {
  private readonly strokes = new Map<number, Stroke>();
  private readonly active = new Map<number, Stroke>();
  private readonly history: number[] = [];
  private nextId = 1;
  private pointCount = 0;

  snapshot(): BoardEvent {
    return { type: 'snapshot', strokes: [...this.strokes.values()] };
  }

  apply(client: number, action: BoardAction): BoardEvent | undefined {
    const active = this.active.get(client);
    switch (action.type) {
      case 'begin': {
        if (active) return;
        if (this.strokes.size >= MAX_STROKES || this.pointCount >= MAX_POINTS) {
          return { type: 'notice', code: 'capacity' };
        }
        const stroke: Stroke = {
          id: this.nextId++,
          brush: action.brush,
          points: [action.point],
          complete: false,
        };
        this.strokes.set(stroke.id, stroke);
        this.active.set(client, stroke);
        this.pointCount++;
        return { type: 'begin', stroke };
      }
      case 'points': {
        if (!active) return;
        const points = action.points.slice(0, MAX_POINTS - this.pointCount);
        if (!points.length) return { type: 'notice', code: 'capacity' };
        active.points.push(...points);
        this.pointCount += points.length;
        return { type: 'points', id: active.id, points };
      }
      case 'end':
        return this.finish(client);
      case 'undo': {
        const id = this.history.pop();
        if (id === undefined) return;
        this.pointCount -= this.strokes.get(id)!.points.length;
        this.strokes.delete(id);
        return { type: 'remove', id };
      }
      case 'clear':
        this.strokes.clear();
        this.active.clear();
        this.history.length = 0;
        this.pointCount = 0;
        return { type: 'clear' };
    }
  }

  finish(client: number): BoardEvent | undefined {
    const stroke = this.active.get(client);
    if (!stroke) return;
    this.active.delete(client);
    stroke.complete = true;
    this.history.push(stroke.id);
    return { type: 'end', id: stroke.id };
  }
}
