import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureExtendedScreen, captureWindowOrScreen } from '../src/monitor/browser-capture.ts';

function captureFixture(t, settings, apply = async () => {}) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let selection;
  let stopped = false;
  const track = {
    readyState: 'live',
    getSettings: () => ({ ...settings }),
    applyConstraints: apply,
    stop() { stopped = true; },
  };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        async getDisplayMedia(options) {
          selection = options;
          return stream;
        },
      },
    },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  });
  return { stream, selection: () => selection, stopped: () => stopped };
}

test('modo estendido descarta uma janela e o espelhamento continua aceitando a fonte', async t => {
  const source = captureFixture(t, { displaySurface: 'window' });
  assert.equal((await captureWindowOrScreen()).stream, source.stream);
  assert.equal(source.stopped(), false);
  assert.match((await captureExtendedScreen()).error, /Tela inteira/);
  assert.equal(source.stopped(), true);
  assert.deepEqual(source.selection(), { video: true, audio: false });
});

test('modo estendido pede que o cursor fique sempre visível e aceita a mudança', async t => {
  const settings = { displaySurface: 'monitor', cursor: 'motion' };
  const source = captureFixture(t, settings, async preferences => {
    if (preferences.cursor === 'always') settings.cursor = 'always';
  });
  assert.equal((await captureExtendedScreen()).stream, source.stream);
  assert.equal(settings.cursor, 'always');
  assert.equal(source.stopped(), false);
});

test('modo estendido descarta a fonte quando ela continua ocultando o cursor', async t => {
  const source = captureFixture(t, { displaySurface: 'monitor', cursor: 'never' }, async () => {
    throw new DOMException('Restrição não suportada', 'OverconstrainedError');
  });
  assert.match((await captureExtendedScreen()).error, /cursor visível/);
  assert.equal(source.stopped(), true);
});

test('modo estendido permite conferir a prévia quando os metadados não estão disponíveis', async t => {
  const source = captureFixture(t, {});
  assert.equal((await captureExtendedScreen()).stream, source.stream);
  assert.equal(source.stopped(), false);
});
