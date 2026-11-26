import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { DEVICE_CLASSES } from '../src/echonet/classes.js';
import {
  buildDevice,
  decodeMap,
  encodeMap,
  featureIdOf,
  featuresOf,
  platformIdOf,
  targetOf,
} from '../src/devices.js';
import { setup } from './helpers/setup.js';
import {
  AIR_CONDITIONER_IP,
  HEMS_IP,
  SENSOR_IP,
  airConditionerNode,
  hemsNode,
  sensorNode,
} from './helpers/simulator.js';

const gladys = createFakeGladys();

// One object per supported class, every property readable, nothing writable.
const everyClass = Object.keys(DEVICE_CLASSES).map((code, index) => ({
  node: { ip: `192.168.2.${index + 1}`, uid: null },
  object: { eoj: `${code}01`, manufacturer: null, product: null, getMap: [], setMap: [] },
}));

test('Gladys accepts the discovery payload of every supported class', async () => {
  const fresh = createFakeGladys();
  const devices = everyClass.map(({ node, object }) => buildDevice(fresh, node, object));
  await fresh.publishDiscoveredDevices(devices);
  assert.equal(fresh.fake.discoveredDevices.length, Object.keys(DEVICE_CLASSES).length);
});

test('every feature carries the columns Gladys needs to create it', () => {
  for (const { node, object } of everyClass) {
    const device = buildDevice(gladys, node, object);
    for (const feature of device.features) {
      const where = `${device.name} / ${feature.name}`;
      assert.ok(feature.name.length > 0, `${where}: name`);
      assert.ok(Number.isFinite(feature.min) && Number.isFinite(feature.max), `${where}: range`);
      assert.ok(feature.min <= feature.max, `${where}: min <= max`);
      assert.equal(typeof feature.read_only, 'boolean', `${where}: read_only`);
      assert.equal(typeof feature.has_feedback, 'boolean', `${where}: has_feedback`);
    }
  }
});

test('every device is polled at a frequency Gladys accepts', () => {
  const frequencies = Object.values(DEVICE_POLL_FREQUENCIES);
  for (const { node, object } of everyClass) {
    const device = buildDevice(gladys, node, object);
    assert.ok(frequencies.includes(device.poll_frequency), device.name);
    assert.equal(device.should_poll, true, `${device.name}: older cores need should_poll`);
  }
  const motion = buildDevice(gladys, { ip: '1.1.1.1', uid: null }, { eoj: '000701', getMap: [] });
  assert.equal(motion.poll_frequency, DEVICE_POLL_FREQUENCIES.EVERY_10_SECONDS);
});

test('a discovered air conditioner gets its features, its brand and its writable settings', async () => {
  const { integration, client } = await setup({ [AIR_CONDITIONER_IP]: airConditionerNode() });
  const [device] = integration.discovered.values();
  assert.equal(device.name, 'Daikin Air conditioner');
  assert.equal(device.model, 'AN22ZRS');
  const byKey = Object.fromEntries(
    device.features.map((f) => [f.external_id.split(':').at(-1), f]),
  );
  assert.deepEqual(Object.keys(byKey).sort(), [
    'fan-speed',
    'mode',
    'outdoor-temperature',
    'power',
    'room-humidity',
    'room-temperature',
    'target-temperature',
  ]);
  assert.equal(byKey.power.category, DEVICE_FEATURE_CATEGORIES.AIR_CONDITIONING);
  assert.equal(byKey.power.read_only, false);
  assert.equal(byKey['target-temperature'].read_only, false);
  assert.equal(byKey['room-temperature'].read_only, true);
  client.stop();
});

test('a HEMS gateway gives one device per object, the node profile none', async () => {
  const { integration, client } = await setup({ [HEMS_IP]: hemsNode() });
  const names = [...integration.discovered.values()].map((d) => d.name).sort();
  assert.deepEqual(names, [
    'Panasonic Smart electricity meter',
    'Panasonic Solar power generation',
    'Panasonic Storage battery',
  ]);
  client.stop();
});

test('external ids rest on the node identification number, else on the IP', async () => {
  const withUid = platformIdOf({ ip: '192.168.1.20', uid: 'abc123' }, { eoj: '013001' });
  assert.equal(withUid, 'abc123-013001');
  const withoutUid = platformIdOf({ ip: '192.168.1.40', uid: null }, { eoj: '000701' });
  assert.equal(withoutUid, 'ip-192-168-1-40-000701');
  const { integration, client } = await setup({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
    [SENSOR_IP]: sensorNode(),
  });
  const ids = [...integration.discovered.keys()];
  assert.equal(new Set(ids).size, ids.length, 'unique external ids');
  assert.ok(ids.some((id) => id.endsWith('00000801020304050607080910111213-013001')));
  client.stop();
});

test('targetOf and featuresOf read a device back from its params', async () => {
  const { deviceOf, client } = await setup({ [AIR_CONDITIONER_IP]: airConditionerNode() });
  const device = deviceOf('0130');
  const target = targetOf(device);
  assert.equal(target.ip, AIR_CONDITIONER_IP);
  assert.equal(target.eoj, '013001');
  assert.equal(target.classCode, '0130');
  assert.deepEqual(target.setMap, [0x80, 0xa0, 0xb0, 0xb3]);
  assert.equal(featuresOf(device).length, device.features.length);
  assert.equal(featureIdOf(device, 'power'), `${device.external_id}:power`);
  assert.equal(featureIdOf(device, 'nope'), undefined);
  assert.equal(targetOf({ params: [] }), null);
  client.stop();
});

test('property maps survive the round trip through a device param', () => {
  assert.equal(encodeMap([0x80, 0xb3]), '80,b3');
  assert.deepEqual(decodeMap('80,b3,zz,10'), [0x80, 0xb3]);
  assert.deepEqual(decodeMap(undefined), []);
});
