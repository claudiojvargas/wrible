import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const [executable, dictionary, language, source] = process.argv.slice(2);
if (!source || !['pt-BR', 'en-US'].includes(language)) {
  console.error('Uso: node native/writepad/probe.mjs EXECUTÁVEL DICIONÁRIO pt-BR|en-US AMOSTRA.csv|acao');
  process.exit(2);
}

function readReferenceCsv(path) {
  const strokes = [];
  let stroke = [];
  for (const line of readFileSync(path, 'utf8').trim().split(/\r?\n/).slice(1)) {
    const [x, y] = line.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Ponto inválido na amostra');
    if (x < 0 || y < 0) {
      if (stroke.length) strokes.push(stroke);
      stroke = [];
    } else {
      stroke.push([x / 2, y / 2]);
    }
  }
  if (stroke.length) strokes.push(stroke);
  return strokes;
}

// Polylines manually defined for this probe. They represent the strokes of
// “ação”, with detached cedilla and tilde, and were not captured on a tablet.
const acao = [
  [[27, 23], [23, 19], [16, 20], [11, 25], [10, 33], [13, 37], [20, 37], [25, 32], [28, 23], [27, 37]],
  [[52, 22], [46, 19], [39, 22], [35, 28], [35, 34], [40, 38], [46, 38], [52, 34]],
  [[44, 39], [41, 44], [47, 44], [46, 49], [41, 50]],
  [[75, 23], [70, 19], [64, 20], [59, 25], [58, 33], [61, 37], [68, 37], [73, 32], [76, 23], [75, 37]],
  [[61, 13], [66, 9], [72, 13], [77, 10]],
  [[101, 23], [97, 19], [90, 20], [85, 25], [83, 32], [87, 37], [94, 38], [100, 33], [103, 27], [101, 23]],
];

const strokes = source === 'acao' ? acao : readReferenceCsv(source);
let minX = Infinity;
let minY = Infinity;
for (const stroke of strokes) for (const [x, y] of stroke) {
  minX = Math.min(minX, x);
  minY = Math.min(minY, y);
}

const request = [language, strokes.length];
for (const stroke of strokes) {
  request.push(stroke.length);
  for (const [x, y] of stroke) request.push(x - minX + 10, y - minY + 10, 127);
}

const start = performance.now();
const result = spawnSync(executable, [dictionary], { input: request.join(' ') + '\n', encoding: 'utf8', timeout: 10000 });
const elapsed = performance.now() - start;
if (result.error) throw result.error;
console.log(JSON.stringify({
  platform: process.platform, arch: process.arch, language, source, strokes: strokes.length,
  points: strokes.reduce((count, stroke) => count + stroke.length, 0),
  elapsedMs: Math.round(elapsed), output: result.stdout?.trimEnd(),
}, null, 2));
if (result.stderr) console.error(result.stderr.trimEnd());
if (result.status !== 0 || !result.stdout?.startsWith('OK\t')) process.exitCode = 1;
