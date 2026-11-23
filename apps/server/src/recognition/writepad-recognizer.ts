import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { BOARD, type Stroke } from '@wrible/contracts';
import type { HandwritingRecognizer } from './recognizer';

type WorkerProcess = ChildProcessByStdio<Writable, Readable, null>;

interface Worker {
  child: WorkerProcess;
  complete?: (error: Error | null, text?: string) => void;
}

export class WritePadRecognizer implements HandwritingRecognizer {
  private worker?: Worker;
  private queue: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private closed = false;

  constructor(
    private readonly executable: string | undefined,
    private readonly dictionary: string | undefined,
    private readonly timeoutMs: number,
  ) {}

  recognize(strokes: readonly Stroke[], language: string): Promise<string> {
    if (language !== 'pt-BR' && language !== 'en-US') return Promise.reject(new Error('Idioma indisponível no WritePad'));
    if (this.queued >= 8) return Promise.reject(new Error('Fila de reconhecimento cheia'));
    this.queued++;
    const result = this.queue.then(() => this.run(strokes, language));
    this.queue = result.catch(() => undefined);
    return result.finally(() => { this.queued--; });
  }

  onModuleDestroy() {
    this.closed = true;
    if (this.worker) this.stop(this.worker, new Error('WritePad encerrado'));
  }

  private run(strokes: readonly Stroke[], language: string): Promise<string> {
    if (this.closed) return Promise.reject(new Error('WritePad encerrado'));
    if (!this.executable || !this.dictionary) return Promise.reject(new Error('Configure o executável e o dicionário do WritePad'));
    const request = encode(strokes, language);
    const worker = this.worker ?? this.start(this.executable, this.dictionary);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.stop(worker, new Error('Tempo limite do WritePad')), this.timeoutMs);
      worker.complete = (error, text) => {
        clearTimeout(timer);
        worker.complete = undefined;
        if (error) reject(error);
        else resolve(text ?? '');
      };
      worker.child.stdin.write(request, error => {
        if (error) this.stop(worker, error);
      });
    });
  }

  private start(executable: string, dictionary: string) {
    const child = spawn(executable, [dictionary], {
      stdio: ['pipe', 'pipe', 'inherit'],
      windowsHide: true,
    });
    const worker: Worker = { child };
    this.worker = worker;
    const output = createInterface({ input: child.stdout });
    output.on('line', line => {
      if (line.startsWith('OK\t')) worker.complete?.(null, line.slice(3));
      else if (line.startsWith('ERR\t')) worker.complete?.(new Error(line.slice(4)));
      else this.stop(worker, new Error('Resposta inválida do WritePad'));
    });
    child.on('error', error => this.stop(worker, error));
    child.stdin.on('error', error => this.stop(worker, error));
    child.on('close', () => {
      output.close();
      this.stop(worker, new Error('Processo WritePad terminou'));
    });
    return worker;
  }

  private stop(worker: Worker, error: Error) {
    if (this.worker === worker) {
      this.worker = undefined;
      worker.child.kill();
    }
    worker.complete?.(error);
  }
}

function encode(strokes: readonly Stroke[], language: string): string {
  let minX = 1;
  let minY = 1;
  for (const stroke of strokes) {
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
    }
  }

  const data = [language, String(strokes.length)];
  for (const { points } of strokes) {
    data.push(String(points.length));
    for (const { x, y, pressure } of points) {
      data.push(
        ((x - minX) * BOARD.width + 10).toFixed(3),
        ((y - minY) * BOARD.height + 10).toFixed(3),
        String(Math.round(pressure * 254)),
      );
    }
  }
  return data.join(' ') + '\n';
}
