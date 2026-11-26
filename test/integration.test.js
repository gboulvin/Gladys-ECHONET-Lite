import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_POLL_FREQUENCIES, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { TRIGGERS } from '../src/integration.js';
import { setup } from './helpers/setup.js';
import {
  AIR_CONDITIONER_IP,
  HEMS_IP,
  SENSOR_IP,
  airConditionerNode,
  hemsNode,
  sensorNode,
} from './helpers/simulator.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('discover publishes the devices in the Discovery tab', async () => {
  const { gladys, client } = await setup({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
    [HEMS_IP]: hemsNode(),
  });
  assert.equal(gladys.fake.discoveredDevices.length, 4);
  client.stop();
});

test('a poll publishes the decoded values of an air conditioner', async () => {
  const { gladys, integration, deviceOf, client } = await setup({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
  });
  const device = deviceOf('0130');
  assert.equal(await integration.onPoll(device), true);
  const id = (key) => `${device.external_id}:${key}`;
  assert.equal(gladys.fake.lastState(id('power')), 0);
  assert.equal(gladys.fake.lastState(id('mode')), 1, 'cooling');
  assert.equal(gladys.fake.lastState(id('target-temperature')), 26);
  assert.equal(gladys.fake.lastState(id('room-temperature')), 28);
  assert.equal(gladys.fake.lastState(id('outdoor-temperature')), -5);
  assert.equal(gladys.fake.lastState(id('room-humidity')), 55);
  assert.equal(gladys.fake.lastState(id('fan-speed')), 0, 'auto');
  // The fake records the wire format of POST /device/transport.
  assert.deepEqual(gladys.fake.transports.at(-1), {
    device_external_id: device.external_id,
    transport: DEVICE_TRANSPORTS.LOCAL,
  });
  client.stop();
});

test('energy devices publish power, indexes and battery values', async () => {
  const { gladys, integration, deviceOf, client } = await setup({ [HEMS_IP]: hemsNode() });
  for (const code of ['0288', '0279', '027d']) {
    await integration.onPoll(deviceOf(code));
  }
  const state = (code, key) => gladys.fake.lastState(`${deviceOf(code).external_id}:${key}`);
  assert.equal(state('0288', 'grid-power'), 1000);
  assert.equal(state('0288', 'input-index'), 1234.5);
  assert.equal(state('0288', 'output-index'), 1);
  assert.equal(state('0279', 'production-power'), 2400);
  assert.equal(state('0279', 'production-index'), 1000);
  assert.equal(state('027d', 'battery-level'), 80);
  assert.equal(state('027d', 'discharge-power'), 500);
  assert.equal(state('027d', 'charge-power'), 0);
  client.stop();
});

test('polls follow the configured refresh interval, motion sensors every time', async (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  const { integration, deviceOf, client } = await setup(
    { [SENSOR_IP]: sensorNode() },
    { config: { poll_frequency: 300 } },
  );
  const thermometer = deviceOf('0011');
  const motion = deviceOf('0007');
  assert.equal(await integration.onPoll(thermometer), true);
  t.mock.timers.tick(DEVICE_POLL_FREQUENCIES.EVERY_MINUTES);
  assert.equal(await integration.onPoll(thermometer), false, 'not due yet');
  assert.equal(await integration.onPoll(motion), true);
  assert.equal(await integration.onPoll(motion), true, 'motion sensors are always read');
  t.mock.timers.tick(4 * DEVICE_POLL_FREQUENCIES.EVERY_MINUTES - 50);
  assert.equal(await integration.onPoll(thermometer), true, 'due at 5 min');
  client.stop();
});

test('a command is written with SetC and the confirmed state is published', async () => {
  const { gladys, integration, network, deviceOf, client } = await setup({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
  });
  const device = deviceOf('0130');
  const target = { external_id: `${device.external_id}:target-temperature` };
  await integration.onSetValue(device, target, 21);
  const props = network.nodes[AIR_CONDITIONER_IP].objects.get('013001').props;
  assert.equal(props.get(0xb3).toString('hex'), '15');
  assert.equal(gladys.fake.lastState(target.external_id), 21);

  const power = { external_id: `${device.external_id}:power` };
  await integration.onSetValue(device, power, 1);
  assert.equal(props.get(0x80).toString('hex'), '30');
  assert.equal(gladys.fake.lastState(power.external_id), 1);
  client.stop();
});

test('a command on a read-only feature or refused by the device fails', async () => {
  const { integration, network, deviceOf, client } = await setup({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
  });
  const device = deviceOf('0130');
  await assert.rejects(
    integration.onSetValue(device, { external_id: `${device.external_id}:room-temperature` }, 20),
    /read-only/,
  );
  // The device stops accepting the mode.
  network.nodes[AIR_CONDITIONER_IP].objects.get('013001').settable = [0x80];
  await assert.rejects(
    integration.onSetValue(device, { external_id: `${device.external_id}:mode` }, 2),
    /refused the command \(EPC 0xb0\)/,
  );
  await assert.rejects(
    integration.onSetValue(device, { external_id: 'ext:test-integration:nope' }, 1),
    /Unknown ECHONET Lite feature/,
  );
  client.stop();
});

test('a device that stops answering turns unreachable and fires device_unreachable once', async () => {
  const { gladys, integration, network, deviceOf, client } = await setup({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
  });
  const device = deviceOf('0130');
  await integration.refresh(device);
  network.nodes[AIR_CONDITIONER_IP].silent = true;
  assert.equal(await integration.refresh(device), false);
  assert.equal(await integration.refresh(device), false);
  const events = gladys.fake.sceneEvents.filter((e) => e.key === TRIGGERS.DEVICE_UNREACHABLE);
  assert.equal(events.length, 1, 'one event per transition');
  assert.deepEqual(events[0].data, {
    device: device.external_id,
    device_name: device.name,
    ip_address: AIR_CONDITIONER_IP,
  });
  assert.equal(gladys.fake.transports.at(-1).transport, DEVICE_TRANSPORTS.UNREACHABLE);
  assert.equal(integration.healthOf(device.external_id).reachable, false);

  network.nodes[AIR_CONDITIONER_IP].silent = false;
  assert.equal(await integration.refresh(device), true);
  assert.equal(gladys.fake.transports.at(-1).transport, DEVICE_TRANSPORTS.LOCAL);
  client.stop();
});

test('motion_detected fires on the 0 -> 1 edge only', async () => {
  const { gladys, integration, network, deviceOf, client } = await setup({
    [SENSOR_IP]: sensorNode(),
  });
  const sensor = deviceOf('0007');
  const props = network.nodes[SENSOR_IP].objects.get('000701').props;
  await integration.refresh(sensor); // not detected
  props.set(0xb1, Buffer.from([0x41]));
  await integration.refresh(sensor); // detected -> event
  await integration.refresh(sensor); // still detected -> nothing
  props.set(0xb1, Buffer.from([0x42]));
  await integration.refresh(sensor); // cleared -> nothing
  const events = gladys.fake.sceneEvents.filter((e) => e.key === TRIGGERS.MOTION_DETECTED);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data, { device: sensor.external_id, device_name: sensor.name });
  assert.equal(gladys.fake.lastState(`${sensor.external_id}:motion`), 0);
  client.stop();
});

test('fault_detected fires when a device reports a fault', async () => {
  const { gladys, integration, network, deviceOf, client } = await setup({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
  });
  const device = deviceOf('0130');
  await integration.refresh(device);
  network.nodes[AIR_CONDITIONER_IP].objects.get('013001').props.set(0x88, Buffer.from([0x41]));
  await integration.refresh(device);
  await integration.refresh(device);
  const events = gladys.fake.sceneEvents.filter((e) => e.key === TRIGGERS.FAULT_DETECTED);
  assert.equal(events.length, 1);
  assert.equal(integration.healthOf(device.external_id).fault, 1);
  client.stop();
});

test('health changes notify the dashboard', async () => {
  const { integration, network, deviceOf, client } = await setup({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
  });
  let changes = 0;
  integration.onHealthChange = () => {
    changes += 1;
  };
  const device = deviceOf('0130');
  await integration.refresh(device); // unknown -> reachable, fault unknown -> 0
  await integration.refresh(device); // no change
  network.nodes[AIR_CONDITIONER_IP].silent = true;
  await integration.refresh(device); // reachable -> unreachable
  assert.equal(changes, 3);
  client.stop();
});

test('a spontaneous notification updates the states', async () => {
  const { gladys, network, deviceOf, client } = await setup({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
  });
  const device = deviceOf('0130');
  network.notify(AIR_CONDITIONER_IP, '013001', { 0x80: '30', 0xb0: '43' });
  await flush();
  await flush();
  assert.equal(gladys.fake.lastState(`${device.external_id}:power`), 1);
  assert.equal(gladys.fake.lastState(`${device.external_id}:mode`), 2, 'heating');
  client.stop();
});

test('setAirConditioner writes every requested setting in one command', async () => {
  const { gladys, integration, network, deviceOf, client } = await setup({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
  });
  const device = deviceOf('0130');
  const ok = await integration.setAirConditioner(device.external_id, {
    power: 'on',
    mode: 'heat',
    target_temperature: 22,
    fan_speed: 'high',
  });
  assert.equal(ok, true);
  const props = network.nodes[AIR_CONDITIONER_IP].objects.get('013001').props;
  assert.equal(props.get(0x80).toString('hex'), '30');
  assert.equal(props.get(0xb0).toString('hex'), '43');
  assert.equal(props.get(0xb3).toString('hex'), '16');
  assert.equal(props.get(0xa0).toString('hex'), '38');
  assert.equal(gladys.fake.lastState(`${device.external_id}:mode`), 2, 'states refreshed');
  assert.equal(await integration.setAirConditioner(device.external_id, {}), false, 'nothing to do');
  const sensorless = await setup({ [SENSOR_IP]: sensorNode() });
  await assert.rejects(
    sensorless.integration.setAirConditioner(sensorless.deviceOf('0011').external_id, {
      power: 'on',
    }),
    /not an air conditioner/,
  );
  sensorless.client.stop();
  client.stop();
});
