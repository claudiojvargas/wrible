export const BOARD = {
  width: 1600,
  height: 1000,
  minBrush: 2,
  maxBrush: 48,
  maxBatch: 128,
} as const;

export const SOCKET_PATH = '/ws';
export const TEXT_FONTS = ['sans', 'serif', 'mono'] as const;
export const MAX_TEXT_LENGTH = 512;
export type TextFont = typeof TEXT_FONTS[number];

export interface Point {
  x: number;
  y: number;
  pressure: number;
}

export interface Brush {
  tool: 'pen' | 'eraser';
  color: string;
  width: number;
}

export interface Stroke {
  id: number;
  brush: Brush;
  points: Point[];
  complete: boolean;
}

export type BoardAction =
  | { type: 'begin'; brush: Brush; point: Point; localId?: number; recognize?: true }
  | { type: 'points'; points: Point[] }
  | { type: 'end' | 'undo' | 'clear' };

export type BoardEvent =
  | { type: 'snapshot'; strokes: Stroke[] }
  | { type: 'begin'; stroke: Stroke; localId?: number }
  | { type: 'points'; id: number; points: Point[] }
  | { type: 'end' | 'remove'; id: number }
  | { type: 'clear' }
  | { type: 'notice'; code: 'capacity'; localId?: number }
  | { type: 'heartbeat' };

export interface TextSegment {
  id: number;
  revision: number;
  text: string;
  font: TextFont;
  status: 'pending' | 'preview' | 'unavailable' | 'confirmed';
}

export type TextAction =
  | { type: 'text:confirm'; id: number; text: string }
  | { type: 'text:font'; id: number; font: TextFont }
  | { type: 'text:remove'; id: number };

export type TextEvent =
  | { type: 'text:snapshot'; enabled: boolean; segments: TextSegment[] }
  | { type: 'text:segment'; segment: TextSegment }
  | { type: 'text:remove'; id: number }
  | { type: 'text:clear' }
  | { type: 'text:capacity' };

export type ClientAction = BoardAction | TextAction;
export type ServerEvent = BoardEvent | TextEvent;
