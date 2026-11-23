import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { BOARD, type BoardAction, type Brush, type Point } from '@wrible/contracts';

interface Drawing {
  localId: number;
  pointer: number;
  last: Point;
  points: Point[];
  frame?: number;
}

interface DrawingTransport {
  beginStroke(brush: Brush, point: Point, recognize: boolean): number | undefined;
  previewPoints(localId: number, points: Point[]): void;
  send(action: BoardAction): boolean;
}

function point(event: PointerEvent, bounds: DOMRect, fallback = 0.5): Point {
  const normalize = (value: number) => Math.max(0, Math.min(1, value));
  return {
    x: normalize((event.clientX - bounds.left) / bounds.width),
    y: normalize((event.clientY - bounds.top) / bounds.height),
    pressure: event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : fallback,
  };
}

export function useDrawing(
  brush: Brush,
  enabled: boolean,
  recognize: boolean,
  { beginStroke, previewPoints, send }: DrawingTransport,
) {
  const active = useRef<Drawing | null>(null);

  useEffect(() => {
    return () => {
      if (active.current?.frame !== undefined) cancelAnimationFrame(active.current.frame);
      active.current = null;
    };
  }, [enabled]);

  function flush(drawing: Drawing) {
    if (drawing.frame !== undefined) cancelAnimationFrame(drawing.frame);
    drawing.frame = undefined;
    const points = drawing.points;
    drawing.points = [];
    for (let i = 0; i < points.length; i += BOARD.maxBatch) {
      if (!send({ type: 'points', points: points.slice(i, i + BOARD.maxBatch) })) break;
    }
  }

  function append(drawing: Drawing, next: Point) {
    const { last } = drawing;
    if (last.x === next.x && last.y === next.y && last.pressure === next.pressure) return false;
    drawing.last = next;
    drawing.points.push(next);
    return true;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!enabled || active.current || event.button !== 0) return;
    const first = point(event.nativeEvent, event.currentTarget.getBoundingClientRect());
    const localId = beginStroke(brush, first, recognize && brush.tool === 'pen');
    if (localId === undefined) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = { localId, pointer: event.pointerId, last: first, points: [] };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drawing = active.current;
    if (!drawing || drawing.pointer !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const samples = event.nativeEvent.getCoalescedEvents?.();
    const offset = drawing.points.length;
    for (const sample of samples?.length ? samples : [event.nativeEvent]) {
      append(drawing, point(sample, bounds));
    }
    if (drawing.points.length > offset) previewPoints(drawing.localId, drawing.points.slice(offset));
    if (drawing.points.length && drawing.frame === undefined) {
      drawing.frame = requestAnimationFrame(() => flush(drawing));
    }
  }

  function finish(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drawing = active.current;
    if (!drawing || drawing.pointer !== event.pointerId) return;
    if (event.type === 'pointerup') {
      const last = point(event.nativeEvent, event.currentTarget.getBoundingClientRect(), drawing.last.pressure);
      if (append(drawing, last)) previewPoints(drawing.localId, [last]);
    }
    active.current = null;
    flush(drawing);
    send({ type: 'end' });
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish,
  };
}
