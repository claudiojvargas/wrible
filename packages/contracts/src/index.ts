export const BOARD = {
  width: 1600,
  height: 1000,
  minBrush: 2,
  maxBrush: 48,
  maxBatch: 128,
} as const;

export const SOCKET_PATH = '/ws';

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
  | { type: 'begin'; brush: Brush; point: Point }
  | { type: 'points'; points: Point[] }
  | { type: 'end' | 'undo' | 'clear' };

export type BoardEvent =
  | { type: 'snapshot'; strokes: Stroke[] }
  | { type: 'begin'; stroke: Stroke }
  | { type: 'points'; id: number; points: Point[] }
  | { type: 'end' | 'remove'; id: number }
  | { type: 'clear' }
  | { type: 'notice'; code: 'capacity' }
  | { type: 'heartbeat' };
