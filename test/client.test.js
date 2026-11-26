import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { EchonetClient, EchonetTimeoutError } from '../src/echonet/client.js';
import { ECHONET_PORT, decodeFrame } from '../src/echonet/frame.js';
import { AIR_CONDITIONER_IP, airConditionerNode, createNetwork } from './helpers/simulator.js';

async function startClient(nodes, options = {}) {
  const network = createNetwork(nodes);
  const client = new EchonetClient({
    createSocket: network.createSocket,
    timeoutMs: 30,
    retries: 0,
    ...options,
  });
  await client.start();
  return { network, client };
}

test('the client binds the ECHONET Lite port', async () => {
  const { network, client } = await startClient({});
  assert.equal(network.sockets[0].port, ECHONET_PORT);
  client.stop();
});

test('the client falls back to a random port when 3610 is taken', async () => {
  let attempts = 0;
  const createSocket = () => {
    const socket = new EventEmitter();
    attempts += 1;
    const busy = attempts === 1;
    socket.bind = (port, callback) =>
      setImmediate(() => {
        if (busy) {
          socket.emit('error', Object.assign(new Error('busy'), { code: 'EADDRINUSE' }));
        } else {
          socket.port = port;
          callback();
        }
      });
    socket.close = () => {};
    socket.send = () => {};
    return socket;
  };
  const client = new EchonetClient({ createSocket });
  await client.start();
  assert.equal(client.socket.port, 0);
  client.stop();
});

test('get reads the supported properties and skips the unsupported ones', async () => {
  const { client } = await startClient({ [AIR_CONDITIONER_IP]: airConditionerNode() });
  const values = await client.get(AIR_CONDITIONER_IP, '013001', [0x80, 0xb3, 0xc0]);
  assert.equal(values.get(0x80).toString('hex'), '31');
  assert.equal(values.get(0xb3).toString('hex'), '1a');
  assert.equal(values.has(0xc0), false, 'Get_SNA: unsupported EPC left out');
  client.stop();
});

test('get splits a long property list into several requests', async () => {
  const { network, client } = await startClient({ [AIR_CONDITIONER_IP]: airConditionerNode() });
  const epcs = [0x80, 0x88, 0xb0, 0xb3, 0xa0, 0xbb, 0xba, 0xbe, 0x8a, 0x9e];
  const values = await client.get(AIR_CONDITIONER_IP, '013001', epcs);
  assert.equal(values.size, epcs.length);
  assert.equal(network.sent.length, 2, 'at most 8 properties per request');
  client.stop();
});

test('set confirms an accepted write and reports a refused one', async () => {
  const { client } = await startClient({ [AIR_CONDITIONER_IP]: airConditionerNode() });
  const accepted = await client.set(AIR_CONDITIONER_IP, '013001', [
    { epc: 0x80, edt: Buffer.from([0x30]) },
  ]);
  assert.deepEqual(accepted, { ok: true, rejected: [] });
  const after = await client.get(AIR_CONDITIONER_IP, '013001', [0x80]);
  assert.equal(after.get(0x80).toString('hex'), '30');

  const refused = await client.set(AIR_CONDITIONER_IP, '013001', [
    { epc: 0xbb, edt: Buffer.from([0x10]) },
  ]);
  assert.deepEqual(refused, { ok: false, rejected: [0xbb] });
  client.stop();
});

test('a silent node times out after the retries', async () => {
  const node = airConditionerNode();
  node.silent = true;
  const { network, client } = await startClient({ [AIR_CONDITIONER_IP]: node }, { retries: 2 });
  await assert.rejects(client.get(AIR_CONDITIONER_IP, '013001', [0x80]), EchonetTimeoutError);
  assert.equal(network.sent.length, 3, 'one attempt + two retries');
  client.stop();
});

test('requests to the same node are sent one after the other', async () => {
  const { network, client } = await startClient({ [AIR_CONDITIONER_IP]: airConditionerNode() });
  const tids = [];
  const results = await Promise.all(
    [0x80, 0xb0, 0xb3].map((epc) => client.get(AIR_CONDITIONER_IP, '013001', [epc])),
  );
  for (const { datagram } of network.sent) {
    tids.push(decodeFrame(datagram).tid);
  }
  assert.equal(new Set(tids).size, 3, 'one transaction id per request');
  assert.deepEqual(
    results.map((values) => [...values.keys()][0]),
    [0x80, 0xb0, 0xb3],
    'each answer reaches its own request',
  );
  client.stop();
});

test('spontaneous notifications are emitted', async () => {
  const { network, client } = await startClient({});
  const received = new Promise((resolve) => client.once('notification', resolve));
  network.notify(AIR_CONDITIONER_IP, '013001', { 0x80: '30' });
  const { ip, frame } = await received;
  assert.equal(ip, AIR_CONDITIONER_IP);
  assert.equal(frame.seoj, '013001');
  client.stop();
});

test('stop fails the pending requests', async () => {
  const node = airConditionerNode();
  node.silent = true;
  const { client } = await startClient({ [AIR_CONDITIONER_IP]: node }, { timeoutMs: 10_000 });
  const pending = client.get(AIR_CONDITIONER_IP, '013001', [0x80]);
  await new Promise((resolve) => setImmediate(resolve));
  client.stop();
  await assert.rejects(pending, /stopped/);
});
