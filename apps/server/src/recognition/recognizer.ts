import type { Stroke } from '@wrible/contracts';

export const HANDWRITING_RECOGNIZER = Symbol('HandwritingRecognizer');

export interface HandwritingRecognizer {
  recognize(strokes: readonly Stroke[], language: string): Promise<string>;
}
