import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS } from '../src/actions.js';
import { LANGUAGES } from '../src/i18n.js';
import { setup } from './helpers/setup.js';
import { AIR_CONDITIONER_IP, HEMS_IP, airConditionerNode, hemsNode } from './helpers/simulator.js';

const assertTranslated = (message) => {
  for (const lang of LANGUAGES) {
    assert.ok(message[lang], `message in ${lang}`);
  }
};

test('discover reports how many devices and nodes answered', async () => {
  const { integration, client } = await setup(
    { [AIR_CONDITIONER_IP]: airConditionerNode(), [HEMS_IP]: hemsNode() },
    { addDevices: false },
  );
  const message = await ACTIONS.discover(integration, { fields: {} });
  assertTranslated(message);
  assert.match(message.en, /^4 devices found on 2 ECHONET Lite nodes/);
  assert.match(message.fr, /^4 appareils trouvés sur 2 nœuds/);
  client.stop();
});

test('discover explains what to do when nothing answers', async () => {
  const { integration, client } = await setup({}, { addDevices: false });
  const message = await ACTIONS.discover(integration, { fields: {} });
  assertTranslated(message);
  assert.match(message.en, /No ECHONET Lite device answered/);
  client.stop();
});

test('test_host describes the node at an address', async () => {
  const { integration, client } = await setup({ [HEMS_IP]: hemsNode() }, { addDevices: false });
  const message = await ACTIONS.test_host(integration, { fields: { host: HEMS_IP } });
  assertTranslated(message);
  assert.match(message.en, /Panasonic Smart electricity meter/);
  assert.match(message.de, /Panasonic Intelligenter Stromzähler/);

  const silent = await ACTIONS.test_host(integration, { fields: { host: '192.168.1.251' } });
  assert.match(silent.en, /No ECHONET Lite answer from 192\.168\.1\.251/);
  const invalid = await ACTIONS.test_host(integration, { fields: { host: 'my-ac' } });
  assert.match(invalid.en, /valid IPv4/);
  client.stop();
});
