import { BOARD, type BoardAction, type Brush, type Point } from '@wrible/contracts';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function between(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function point(value: unknown): Point | undefined {
  if (!record(value)) return;
  const { x, y, pressure } = value;
  if (between(x, 0, 1) && between(y, 0, 1) && between(pressure, 0, 1)) {
    return { x, y, pressure };
  }
}

function brush(value: unknown): Brush | undefined {
  if (!record(value)) return;
  const { tool, width, color } = value;
  if ((tool === 'pen' || tool === 'eraser') && between(width, BOARD.minBrush, BOARD.maxBrush)
      && typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) {
    return { tool, width, color };
  }
}

export function parseAction(json: string): BoardAction | undefined {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return;
  }

  if (!record(value)) return;
  switch (value.type) {
    case 'begin': {
      const validBrush = brush(value.brush);
      const validPoint = point(value.point);
      if (validBrush && validPoint) return { type: 'begin', brush: validBrush, point: validPoint };
      return;
    }
    case 'points': {
      if (!Array.isArray(value.points) || !value.points.length || value.points.length > BOARD.maxBatch) return;
      const points = [];
      for (const item of value.points) {
        const validPoint = point(item);
        if (!validPoint) return;
        points.push(validPoint);
      }
      return { type: 'points', points };
    }
    case 'end':
    case 'undo':
    case 'clear':
      return { type: value.type };
  }
}
