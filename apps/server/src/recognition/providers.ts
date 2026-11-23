import { Logger, type FactoryProvider } from '@nestjs/common';
import { resolve } from 'node:path';
import { HANDWRITING_RECOGNIZER, type HandwritingRecognizer } from './recognizer';
import { TextRecognition } from './text-recognition';
import { WritePadRecognizer } from './writepad-recognizer';

function milliseconds(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 && value <= 60_000 ? value : fallback;
}

const recognizers: Record<string, () => HandwritingRecognizer> = {
  writepad: () => {
    const executable = process.env.WRITEPAD_EXECUTABLE;
    const dictionary = process.env.WRITEPAD_DICTIONARY;
    if (!executable || !dictionary) {
      Logger.warn('Configure WRITEPAD_EXECUTABLE e WRITEPAD_DICTIONARY para usar o WritePad', 'Reconhecimento');
    }
    return new WritePadRecognizer(
      executable && resolve(executable),
      dictionary && resolve(dictionary),
      milliseconds('WRITEPAD_TIMEOUT_MS', 4_000),
    );
  },
};

export const recognizerProvider: FactoryProvider<HandwritingRecognizer | null> = {
  provide: HANDWRITING_RECOGNIZER,
  useFactory: () => {
    const engine = process.env.HANDWRITING_ENGINE ?? 'off';
    if (engine === 'off') return null;
    if (!Object.hasOwn(recognizers, engine)) {
      Logger.warn(`Reconhecedor desconhecido: ${engine}`, 'Reconhecimento');
      return null;
    }
    return recognizers[engine]();
  },
};

export const textRecognitionProvider: FactoryProvider<TextRecognition> = {
  provide: TextRecognition,
  inject: [HANDWRITING_RECOGNIZER],
  useFactory: (recognizer: HandwritingRecognizer | null) => new TextRecognition(
    recognizer,
    milliseconds('HANDWRITING_IDLE_MS', 450),
    process.env.HANDWRITING_LANGUAGE ?? 'pt-BR',
  ),
};
