import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { TRIGGERS } from '../src/integration.js';
import { setup } from './helpers/setup.js';
import {
  AIR_CONDITIONER_IP,
  SENSOR_IP,
  airConditionerNode,
  sensorNode,
} from './helpers/simulator.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const declarationOf = (list, key) => manifest[list].find((entry) => entry.key === key);

/** The outputs must be declared, or the core drops them. */
function assertDeclaredOutputs(actionKey, outputs) {
  const declared = declarationOf('scene_actions', actionKey).outputs;
  for (const [key, value] of Object.entries(outputs)) {
    const output = declared.find((entry) => entry.key === key);
    assert.ok(output, `${actionKey}: output "${key}" is not declared`);
    assert.equal(typeof value, output.type, `${actionKey}: output "${key}" type`);
  }
}

test('set_air_conditioner applies the settings and returns success', async () => {
  const { integration, network, deviceOf, client } = await setup({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
  });
  const device = deviceOf('0130');
  const outputs = await SCENE_ACTIONS.set_air_conditioner(integration, {
    fields: { device: device.external_id, power: 'on', mode: 'cool', target_temperature: 25 },
  });
  assert.deepEqual(outputs, { success: true });
  assertDeclaredOutputs('set_air_conditioner', outputs);
  const props = network.nodes[AIR_CONDITIONER_IP].objects.get('013001').props;
  assert.equal(props.get(0x80).toString('hex'), '30');
  assert.equal(props.get(0xb3).toString('hex'), '19');
  client.stop();
});

test('set_air_conditioner reports an unreachable device through its output', async () => {
  const { integration, network, deviceOf, client } = await setup({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
  });
  network.nodes[AIR_CONDITIONER_IP].silent = true;
  const outputs = await SCENE_ACTIONS.set_air_conditioner(integration, {
    fields: { device: deviceOf('0130').external_id, power: 'off' },
  });
  assert.deepEqual(outputs, { success: false });
  await assert.rejects(
    SCENE_ACTIONS.set_air_conditioner(integration, { fields: { device: 'unknown', power: 'on' } }),
    /Unknown ECHONET Lite device/,
  );
  client.stop();
});

test('refresh_device says whether the device answered', async () => {
  const { integration, network, deviceOf, client } = await setup({ [SENSOR_IP]: sensorNode() });
  const device = deviceOf('0011');
  const outputs = await SCENE_ACTIONS.refresh_device(integration, {
    fields: { device: device.external_id },
  });
  assert.deepEqual(outputs, { reachable: true });
  assertDeclaredOutputs('refresh_device', outputs);
  network.nodes[SENSOR_IP].silent = true;
  assert.deepEqual(
    await SCENE_ACTIONS.refresh_device(integration, { fields: { device: device.external_id } }),
    { reachable: false },
  );
  client.stop();
});

test('read_property returns the raw value, in hexadecimal and as a number', async () => {
  const { integration, deviceOf, client } = await setup({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
  });
  const device = deviceOf('0130').external_id;
  const outputs = await SCENE_ACTIONS.read_property(integration, { fields: { device, epc: 'B3' } });
  assert.deepEqual(outputs, { success: true, value_hex: '1a', value_number: 26 });
  assertDeclaredOutputs('read_property', outputs);
  assert.deepEqual(
    await SCENE_ACTIONS.read_property(integration, { fields: { device, epc: 'C0' } }),
    { success: false, value_hex: '', value_number: 0 },
    'unsupported property',
  );
  await assert.rejects(
    SCENE_ACTIONS.read_property(integration, { fields: { device, epc: 'xyz' } }),
    /Invalid/,
  );
  client.stop();
});

test('write_property writes a raw value', async () => {
  const { integration, network, deviceOf, client } = await setup({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
  });
  const device = deviceOf('0130').external_id;
  const outputs = await SCENE_ACTIONS.write_property(integration, {
    fields: { device, epc: '80', value: '30' },
  });
  assert.deepEqual(outputs, { success: true });
  assertDeclaredOutputs('write_property', outputs);
  const props = network.nodes[AIR_CONDITIONER_IP].objects.get('013001').props;
  assert.equal(props.get(0x80).toString('hex'), '30');
  assert.deepEqual(
    await SCENE_ACTIONS.write_property(integration, { fields: { device, epc: 'bb', value: '10' } }),
    { success: false },
    'refused by the device',
  );
  client.stop();
});

test('the data of every fired trigger only carries declared keys', async () => {
  const { gladys, integration, network, deviceOf, client } = await setup({
    [SENSOR_IP]: sensorNode(),
    [AIR_CONDITIONER_IP]: airConditionerNode(),
  });
  const sensor = deviceOf('0007');
  const ac = deviceOf('0130');
  await integration.refresh(sensor);
  await integration.refresh(ac);
  network.nodes[SENSOR_IP].objects.get('000701').props.set(0xb1, Buffer.from([0x41]));
  network.nodes[AIR_CONDITIONER_IP].objects.get('013001').props.set(0x88, Buffer.from([0x41]));
  await integration.refresh(sensor);
  await integration.refresh(ac);
  network.nodes[AIR_CONDITIONER_IP].silent = true;
  await integration.refresh(ac);

  const fired = new Set(gladys.fake.sceneEvents.map((event) => event.key));
  assert.deepEqual([...fired].sort(), Object.values(TRIGGERS).sort(), 'every trigger was fired');
  for (const { key, data } of gladys.fake.sceneEvents) {
    const trigger = declarationOf('scene_triggers', key);
    const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
    for (const [dataKey, value] of Object.entries(data)) {
      assert.ok(declared.includes(dataKey), `${key}: data.${dataKey} is not declared`);
      assert.ok(value === null || typeof value !== 'object', `${key}: data.${dataKey} primitive`);
    }
    assert.ok(Object.keys(data).length <= 30);
  }
  client.stop();
});
