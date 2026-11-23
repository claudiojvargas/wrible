import { BOARD, MAX_TEXT_LENGTH, TEXT_FONTS, type Brush, type ClientAction, type Point } from '@wrible/contracts';

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

function identifier(value: unknown): value is number {
  return between(value, 1, Number.MAX_SAFE_INTEGER) && Number.isInteger(value);
}

export function parseAction(json: string): ClientAction | undefined {
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
      const { localId, recognize } = value;
      if (!validBrush || !validPoint) return;
      if (localId !== undefined && !identifier(localId)) return;
      if (recognize !== undefined && recognize !== true) return;
      return { type: 'begin', brush: validBrush, point: validPoint, localId, recognize };
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
    case 'text:confirm':
      if (identifier(value.id) && typeof value.text === 'string' && value.text.length <= MAX_TEXT_LENGTH && value.text.trim()) {
        return { type: value.type, id: value.id, text: value.text.trim() };
      }
      return;
    case 'text:font': {
      const font = TEXT_FONTS.find(option => option === value.font);
      if (identifier(value.id) && font) return { type: value.type, id: value.id, font };
      return;
    }
    case 'text:remove':
      if (identifier(value.id)) return { type: value.type, id: value.id };
  }
}
