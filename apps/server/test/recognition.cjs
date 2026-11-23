const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
require('reflect-metadata');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { WsAdapter } = require('@nestjs/platform-ws');
const { WebSocket } = require('ws');
const { Board } = require('../dist/board.js');
const { BoardGateway } = require('../dist/board.gateway.js');
const { HANDWRITING_RECOGNIZER } = require('../dist/recognition/recognizer.js');
const { textRecognitionProvider } = require('../dist/recognition/providers.js');

const point = (x, y) => ({ x, y, pressure: 0.5 });
const brush = { tool: 'pen', color: '#222222', width: 8 };

function listen(socket) {
  const events = [];
  socket.on('message', raw => events.push(JSON.parse(raw)));
  return {
    events,
    send: action => socket.send(JSON.stringify(action)),
    async next(predicate) {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const index = events.findIndex(predicate);
        if (index >= 0) return events.splice(index, 1)[0];
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      assert.fail('Evento WebSocket esperado não recebido');
    },
  };
}

test('reconhecimento pelo gateway com motor injetado, revisão, confirmação, exclusão e falha', async () => {
  const requests = [];
  const fakeRecognizer = {
    recognize(strokes, language) {
      return new Promise((resolve, reject) => requests.push({ strokes, language, resolve, reject }));
    },
  };
  class TestModule {}
  Module({ providers: [
    Board, BoardGateway,
    { provide: HANDWRITING_RECOGNIZER, useValue: fakeRecognizer },
    textRecognitionProvider,
  ] })(TestModule);
  const oldDelay = process.env.HANDWRITING_IDLE_MS;
  const oldLanguage = process.env.HANDWRITING_LANGUAGE;
  process.env.HANDWRITING_IDLE_MS = '15';
  process.env.HANDWRITING_LANGUAGE = 'pt-BR';
  const app = await NestFactory.create(TestModule, { logger: false });
  const sockets = [];
  try {
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.listen(0, '127.0.0.1');
    const address = (await app.getUrl()).replace('http:', 'ws:');
    const connect = async suffix => {
      const socket = new WebSocket(address + '/ws' + suffix);
      sockets.push(socket);
      const client = listen(socket);
      await once(socket, 'open');
      await client.next(event => event.type === 'snapshot');
      return client;
    };
    const editor = await connect('');
    const viewer = await connect('?mode=view');
    assert.equal((await viewer.next(e => e.type === 'text:snapshot')).enabled, true);

    async function stroke(x, y, recognize = true) {
      editor.send({ type: 'begin', brush, point: point(x, y), ...(recognize && { recognize: true }) });
      editor.send({ type: 'points', points: [point(x + 0.01, y + 0.01)] });
      editor.send({ type: 'end' });
      await viewer.next(event => event.type === 'end');
    }
    const segment = (status, revision) => viewer.next(event => event.type === 'text:segment'
      && event.segment.status === status && (revision === undefined || event.segment.revision === revision));
    async function request() {
      const deadline = Date.now() + 3000;
      while (!requests.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
      assert.ok(requests.length, 'Motor de teste não acionado');
      return requests.shift();
    }

    await stroke(0.1, 0.2, false);
    assert.equal(viewer.events.some(e => e.type === 'text:segment'), false);
    await stroke(0.2, 0.3);
    const first = (await segment('pending', 1)).segment;
    const old = await request();
    assert.equal(old.language, 'pt-BR');
    await stroke(0.22, 0.28);
    assert.equal((await segment('pending', 2)).segment.id, first.id);
    const latest = await request();
    assert.deepEqual(latest.strokes.map(item => item.points[0]), [point(0.2, 0.3), point(0.22, 0.28)]);
    latest.resolve('ação');
    assert.equal((await segment('preview', 2)).segment.text, 'ação');
    old.resolve('acao desatualizada');

    editor.send({ type: 'text:font', id: first.id, font: 'serif' });
    const styled = (await segment('preview', 2)).segment;
    assert.equal(styled.font, 'serif');
    assert.equal(styled.text, 'ação');
    assert.equal(viewer.events.some(e => e.segment?.text === 'acao desatualizada'), false);

    await stroke(0.23, 0.35);
    assert.equal((await segment('pending', 3)).segment.id, first.id);
    const pending = await request();
    editor.send({ type: 'text:confirm', id: first.id, text: 'ação manual' });
    assert.equal((await segment('confirmed', 4)).segment.text, 'ação manual');
    pending.resolve('não deve sobrescrever');

    await stroke(0.4, 0.3);
    const second = (await segment('pending', 1)).segment;
    assert.notEqual(second.id, first.id);
    const failing = await request();
    failing.reject(new Error('indisponível'));
    assert.equal((await segment('unavailable', 1)).segment.id, second.id);

    await stroke(0.43, 0.3);
    const removed = await request();
    editor.send({ type: 'text:remove', id: second.id });
    await viewer.next(e => e.type === 'text:remove' && e.id === second.id);
    removed.resolve('não deve recriar');
    editor.send({ type: 'text:confirm', id: second.id, text: 'também não deve recriar' });

    const late = await connect('?mode=view');
    const snapshot = await late.next(e => e.type === 'text:snapshot');
    assert.deepEqual(snapshot.segments, [{ ...styled, text: 'ação manual', revision: 4, status: 'confirmed' }]);
    assert.equal(viewer.events.some(e => e.segment?.text === 'não deve recriar'), false);
    assert.equal(viewer.events.some(e => e.segment?.text === 'não deve sobrescrever'), false);
    editor.send({ type: 'clear' });
    await viewer.next(e => e.type === 'clear');
    await viewer.next(e => e.type === 'text:clear');
  } finally {
    if (oldDelay === undefined) delete process.env.HANDWRITING_IDLE_MS;
    else process.env.HANDWRITING_IDLE_MS = oldDelay;
    if (oldLanguage === undefined) delete process.env.HANDWRITING_LANGUAGE;
    else process.env.HANDWRITING_LANGUAGE = oldLanguage;
    for (const socket of sockets) socket.terminate();
    await app.close();
  }
});
