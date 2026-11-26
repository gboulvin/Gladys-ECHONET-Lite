import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { EchonetIntegration } from '../src/integration.js';
import { WIDGETS, WIDGET_KEYS, refreshWidgets } from '../src/widgets.js';
import { LANGUAGES } from '../src/i18n.js';
import { setup } from './helpers/setup.js';
import {
  AIR_CONDITIONER_IP,
  HEMS_IP,
  SENSOR_IP,
  airConditionerNode,
  hemsNode,
  sensorNode,
} from './helpers/simulator.js';

const get = (integration, key, settings = {}) =>
  WIDGETS[key].get(integration, { settings, language: 'en', units: 'metric' });

function assertToast(message) {
  for (const lang of LANGUAGES) {
    assert.ok(message[lang], `toast in ${lang}`);
    assert.ok(message[lang].length <= 200, `toast in ${lang} is at most 200 characters`);
  }
}

test('every widget renders an empty state exactly as sent', async () => {
  const integration = new EchonetIntegration(createFakeGladys());
  for (const key of Object.keys(WIDGETS)) {
    const content = await get(integration, key);
    assert.deepEqual(validateWidgetContent(content), [], key);
    assert.ok(content.components.length > 0, `${key}: explains what to do`);
  }
});

test('the widgets render the added devices exactly as sent', async () => {
  const { integration, deviceOf, client } = await setup({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
    [HEMS_IP]: hemsNode(),
    [SENSOR_IP]: sensorNode(),
  });
  await integration.refresh(deviceOf('0130'));
  const contents = {
    status: await get(integration, WIDGET_KEYS.DEVICES_STATUS),
    ac: await get(integration, WIDGET_KEYS.AIR_CONDITIONER, {
      device: deviceOf('0130').external_id,
    }),
    energy: await get(integration, WIDGET_KEYS.ENERGY),
  };
  for (const [name, content] of Object.entries(contents)) {
    assert.deepEqual(validateWidgetContent(content), [], name);
  }
  const status = contents.status.components.find((c) => c.type === 'status');
  assert.equal(status.items.length, 6, 'one row per added device');
  assert.ok(
    status.items.some((item) => item.color === 'success'),
    'the polled device is online',
  );
  const energyTiles = contents.energy.components.filter((c) => c.type === 'value');
  assert.equal(energyTiles.length, 5, 'grid, solar, battery level, charge, discharge');
  const acTiles = contents.ac.components.filter((c) => c.type === 'value');
  assert.equal(acTiles.length, 3, 'room, target, humidity');
  client.stop();
});

test('live tiles and device buttons reference features the integration publishes', async () => {
  const { integration, gladys, deviceOf, client } = await setup({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
    [HEMS_IP]: hemsNode(),
  });
  const featureIds = new Set(
    gladys.devices.flatMap((device) => device.features.map((feature) => feature.external_id)),
  );
  const contents = [
    await get(integration, WIDGET_KEYS.AIR_CONDITIONER, { device: deviceOf('0130').external_id }),
    await get(integration, WIDGET_KEYS.ENERGY),
  ];
  const bound = contents.flatMap((content) => content.components.filter((c) => c.device_feature));
  assert.ok(bound.length > 0);
  for (const component of bound) {
    assert.ok(featureIds.has(component.device_feature), component.device_feature);
  }
  client.stop();
});

test('the air conditioner widget asks for an air conditioner', async () => {
  const { integration, deviceOf, client } = await setup({ [SENSOR_IP]: sensorNode() });
  const content = await get(integration, WIDGET_KEYS.AIR_CONDITIONER, {
    device: deviceOf('0011').external_id,
  });
  assert.equal(content.components[0].type, 'text');
  client.stop();
});

test('the air conditioner widget buttons set the temperature and the mode', async () => {
  const { integration, network, deviceOf, client } = await setup({
    [AIR_CONDITIONER_IP]: airConditionerNode(),
  });
  const device = deviceOf('0130');
  const content = await get(integration, WIDGET_KEYS.AIR_CONDITIONER, {
    device: device.external_id,
  });
  const actions = content.components.filter((c) => c.type === 'button' && c.action);
  assert.deepEqual(
    actions.map((button) => button.action.key),
    ['set_temperature', 'set_mode'],
  );
  const widget = WIDGETS[WIDGET_KEYS.AIR_CONDITIONER];
  const props = network.nodes[AIR_CONDITIONER_IP].objects.get('013001').props;

  assertToast(
    await widget.action(integration, {
      actionKey: 'set_temperature',
      params: actions[0].action.params,
      values: { temperature: 20 },
    }),
  );
  assert.equal(props.get(0xb3).toString('hex'), '14');

  assertToast(
    await widget.action(integration, {
      actionKey: 'set_mode',
      params: actions[1].action.params,
      values: { mode: 'dry' },
    }),
  );
  assert.equal(props.get(0xb0).toString('hex'), '44');

  network.nodes[AIR_CONDITIONER_IP].silent = true;
  await assert.rejects(
    widget.action(integration, {
      actionKey: 'set_mode',
      params: actions[1].action.params,
      values: { mode: 'cool' },
    }),
    /refused/,
  );
  await assert.rejects(
    widget.action(integration, { actionKey: 'nope', params: {}, values: {} }),
    /Unknown widget action/,
  );
  client.stop();
});

test('the search button of the status widget runs a discovery', async () => {
  const { integration, network, client } = await setup(
    { [SENSOR_IP]: sensorNode() },
    { addDevices: false },
  );
  const widget = WIDGETS[WIDGET_KEYS.DEVICES_STATUS];
  assertToast(await widget.action(integration, { actionKey: 'discover', params: {} }));
  network.nodes[SENSOR_IP].silent = true;
  assertToast(await widget.action(integration, { actionKey: 'discover', params: {} }));
  await assert.rejects(widget.action(integration, { actionKey: 'nope' }), /Unknown widget action/);
  client.stop();
});

test('refreshWidgets nudges every widget', () => {
  const gladys = createFakeGladys();
  refreshWidgets(gladys);
  assert.deepEqual(gladys.fake.widgetRefreshes, Object.keys(WIDGETS));
});
