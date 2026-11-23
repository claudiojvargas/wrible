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
const { MonitorGateway } = require('../dist/monitor/monitor.gateway.js');

function messages(socket) {
  const queue = [];
  socket.on('message', raw => queue.push(JSON.parse(raw)));
  return {
    queue,
    send: event => socket.send(JSON.stringify(event)),
    async next(predicate) {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const index = queue.findIndex(predicate);
        if (index >= 0) return queue.splice(index, 1)[0];
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      assert.fail('Evento WebSocket esperado não recebido');
    },
  };
}

test('monitor isola sinalização, renova a conexão do espectador e preserva a lousa', async () => {
  class TestModule {}
  Module({ providers: [Board, BoardGateway, MonitorGateway] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  const sockets = [];
  try {
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.listen(0, '127.0.0.1');
    const url = (await app.getUrl()).replace('http:', 'ws:');
    const connect = (path = '/ws/monitor', options) => {
      const socket = new WebSocket(url + path, options);
      sockets.push(socket);
      return { socket, ...messages(socket) };
    };
    const session = (client, capture, connection) => client.next(event => event.type === 'session'
      && event.capture === capture && (connection === null ? event.connection === null : event.connection !== null));
    const sender = connect();
    const viewer = connect();
    const board = connect('/ws');
    await Promise.all([sender, viewer, board].map(client => once(client.socket, 'open')));
    await board.next(event => event.type === 'snapshot');
    viewer.send({ type: 'join', role: 'viewer' });
    await session(viewer, 'waiting', null);
    sender.send({ type: 'join', role: 'sender' });
    await session(sender, 'waiting', null);

    // A viewer cannot start the capture or originate an offer.
    viewer.send({ type: 'capture', active: true });
    viewer.send({ type: 'offer', connection: 1, sdp: 'v=0\r\nwrong role' });
    sender.send({ type: 'capture', active: true });
    const first = await session(viewer, 'active', 1);
    assert.equal((await session(sender, 'active', 1)).connection, first.connection);
    const offer = { type: 'offer', connection: first.connection, sdp: 'v=0\r\nwindow' };
    sender.send(offer);
    assert.deepEqual(await viewer.next(event => event.type === 'offer'), offer);
    assert.equal(sender.queue.some(event => event.type === 'offer'), false);
    assert.equal(board.queue.some(event => event.type === 'session' || event.type === 'offer'), false);

    const replacement = connect();
    await once(replacement.socket, 'open');
    const replaced = once(viewer.socket, 'close');
    replacement.send({ type: 'join', role: 'viewer' });
    assert.equal((await replaced)[0], 4001);
    const second = await session(replacement, 'active', 1);
    assert.notEqual(second.connection, first.connection);
    sender.send(offer);
    const newOffer = { ...offer, connection: second.connection };
    sender.send(newOffer);
    assert.deepEqual(await replacement.next(event => event.type === 'offer'), newOffer);
    assert.equal(replacement.queue.some(event => event.type === 'offer' && event.connection === first.connection), false);

    const answer = { type: 'answer', connection: second.connection, sdp: 'v=0\r\nvideo' };
    replacement.send(answer);
    assert.deepEqual(await sender.next(event => event.type === 'answer'), answer);
    const ice = {
      type: 'candidate', connection: second.connection,
      candidate: { candidate: 'candidate:1 1 udp 1 192.168.0.10 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 },
    };
    sender.send(ice);
    assert.deepEqual(await replacement.next(event => event.type === 'candidate'), ice);

    const busy = connect();
    await once(busy.socket, 'open');
    const rejected = once(busy.socket, 'close');
    busy.send({ type: 'join', role: 'sender' });
    assert.equal((await rejected)[0], 4002);

    sender.send({ type: 'capture', active: false });
    await session(replacement, 'ended', null);
    sender.send({ type: 'capture', active: true });
    const third = await session(replacement, 'active', 1);
    assert.notEqual(third.connection, second.connection);

    const publicPeer = connect('/ws/monitor', { headers: { Host: 'wrible.example.com' } });
    assert.equal((await once(publicPeer.socket, 'close'))[0], 1008);

    board.send({ type: 'clear' });
    await board.next(event => event.type === 'clear');
    assert.equal(replacement.queue.some(event => event.type === 'clear'), false);
  } finally {
    for (const socket of sockets) socket.terminate();
    await app.close();
  }
});
