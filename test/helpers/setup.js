// Shared test setup: a fake Gladys, a simulated ECHONET Lite network and an
// integration wired to both, with the discovered devices "added" by the user.

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { EchonetClient } from '../../src/echonet/client.js';
import { EchonetIntegration } from '../../src/integration.js';
import { createNetwork } from './simulator.js';

export const TEST_TIMEOUT_MS = 30;

/**
 * @param {Record<string, object>} nodes - IP -> simulated node
 * @param {object} [options]
 * @param {object} [options.config] - extra configuration values
 * @param {boolean} [options.addDevices] - add every discovered device to Gladys
 */
export async function setup(nodes, { config = {}, addDevices = true } = {}) {
  const network = createNetwork(nodes);
  const gladys = createFakeGladys();
  const client = new EchonetClient({
    createSocket: network.createSocket,
    timeoutMs: TEST_TIMEOUT_MS,
    retries: 0,
  });
  const integration = new EchonetIntegration(gladys, { client });
  integration.setConfig({
    broadcast_discovery: false,
    hosts: Object.keys(nodes).join(','),
    ...config,
  });
  // setConfig applies the user timeout (seconds): keep the tests fast.
  client.timeoutMs = TEST_TIMEOUT_MS;
  await integration.start();
  await integration.discover();
  if (addDevices) {
    gladys.fake.devices = [...integration.discovered.values()];
    await gladys.getDevices();
  }
  const deviceOf = (classCode) =>
    gladys.devices.find((device) =>
      device.params.some((p) => p.name === 'ECHONET_EOJ' && p.value.startsWith(classCode)),
    );
  return { network, gladys, client, integration, deviceOf };
}
