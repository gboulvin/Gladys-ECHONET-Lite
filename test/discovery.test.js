import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { EchonetClient } from '../src/echonet/client.js';
import { ESV, decodeFrame, encodeFrame } from '../src/echonet/frame.js';
import {
  buildDiscoveryRequest,
  describeNode,
  discoverNodes,
  parseScanReplies,
} from '../src/discovery.js';
import { normalizeConfig } from '../src/config.js';
import {
  AIR_CONDITIONER_IP,
  HEMS_IP,
  SENSOR_IP,
  airConditionerNode,
  createNetwork,
  hemsNode,
  sensorNode,
} from './helpers/simulator.js';

async function clientFor(nodes) {
  const network = createNetwork(nodes);
  const client = new EchonetClient({
    createSocket: network.createSocket,
    timeoutMs: 30,
    retries: 0,
  });
  await client.start();
  return { network, client };
}

const scanReply = (ip) => ({
  source_ip: ip,
  source_port: 3610,
  payload_base64: encodeFrame({
    tid: 1,
    seoj: '0ef001',
    deoj: '05ff01',
    esv: ESV.GET_RES,
    properties: [{ epc: 0xd6, edt: Buffer.from('01013001', 'hex') }],
  }).toString('base64'),
});

test('the broadcast request asks the node profile for its instance list', () => {
  const frame = decodeFrame(buildDiscoveryRequest());
  assert.equal(frame.deoj, '0ef001');
  assert.equal(frame.esv, ESV.GET);
  assert.deepEqual(
    frame.properties.map(({ epc }) => epc),
    [0xd6],
  );
  assert.ok(buildDiscoveryRequest().length <= 512, 'the core relays at most 512 bytes');
});

test('parseScanReplies keeps the ECHONET Lite answers only', () => {
  const replies = [
    scanReply('192.168.1.20'),
    scanReply('192.168.1.20'),
    { source_ip: '192.168.1.99', source_port: 3610, payload_base64: 'aGVsbG8=' },
  ];
  assert.deepEqual(parseScanReplies(replies), ['192.168.1.20']);
  assert.deepEqual(parseScanReplies(undefined), []);
});

test('describeNode lists the device objects with their maps and identity', async () => {
  const { client } = await clientFor({ [AIR_CONDITIONER_IP]: airConditionerNode() });
  const node = await describeNode(client, AIR_CONDITIONER_IP);
  assert.equal(node.uid, '00000801020304050607080910111213');
  assert.equal(node.objects.length, 1);
  const [object] = node.objects;
  assert.equal(object.eoj, '013001');
  assert.equal(object.manufacturer, 'Daikin');
  assert.equal(object.product, 'AN22ZRS');
  assert.ok(object.getMap.includes(0xb3));
  assert.deepEqual(object.setMap, [0x80, 0xa0, 0xb0, 0xb3]);
  client.stop();
});

test('describeNode resolves null for a node that does not answer', async () => {
  const { client } = await clientFor({});
  assert.equal(await describeNode(client, '192.168.1.250'), null);
  client.stop();
});

test('discoverNodes combines the core broadcast, the configured hosts and the known devices', async () => {
  const { client } = await clientFor({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
    [HEMS_IP]: hemsNode(),
    [SENSOR_IP]: sensorNode(),
  });
  const gladys = createFakeGladys({
    scanResults: { 'udp-active-broadcast': [scanReply(AIR_CONDITIONER_IP)] },
  });
  const nodes = await discoverNodes({
    gladys,
    client,
    config: normalizeConfig({ hosts: HEMS_IP }),
    knownIps: [SENSOR_IP],
  });
  assert.deepEqual(nodes.map((node) => node.ip).sort(), [AIR_CONDITIONER_IP, HEMS_IP, SENSOR_IP]);
  const [scan] = gladys.fake.scans;
  assert.equal(scan.type, 'udp-active-broadcast');
  assert.equal(scan.port, 3610);
  assert.equal(
    Buffer.from(scan.payload_base64, 'base64').toString('hex'),
    buildDiscoveryRequest().toString('hex'),
  );
  client.stop();
});

test('discoverNodes skips the broadcast when it is disabled, and survives a refused scan', async () => {
  const { client } = await clientFor({ [HEMS_IP]: hemsNode() });
  const gladys = createFakeGladys();
  const disabled = await discoverNodes({
    gladys,
    client,
    config: normalizeConfig({ broadcast_discovery: false, hosts: HEMS_IP }),
  });
  assert.equal(disabled.length, 1);
  assert.equal(gladys.fake.scans.length, 0);

  gladys.scanNetwork = async () => {
    throw new Error('403 network_discovery not declared');
  };
  const refused = await discoverNodes({
    gladys,
    client,
    config: normalizeConfig({ hosts: HEMS_IP }),
  });
  assert.equal(refused.length, 1, 'the configured hosts still work');
  client.stop();
});

test('discoverNodes sweeps the configured subnet in unicast', async () => {
  const { network, client } = await clientFor({ '10.0.0.6': sensorNode() });
  const gladys = createFakeGladys();
  const nodes = await discoverNodes({
    gladys,
    client,
    config: normalizeConfig({ broadcast_discovery: false, subnet: '10.0.0.0/29' }),
  });
  assert.deepEqual(
    nodes.map((node) => node.ip),
    ['10.0.0.6'],
  );
  const probed = new Set(network.sent.map(({ ip }) => ip));
  assert.equal(probed.size, 6, 'every host address of the /29 was queried');
  client.stop();
});
