// -----------------------------------------------------------------------------
// Manifest actions: the buttons of the Configuration screen. Each handler is
// keyed by the action `key` of the manifest `actions` field and resolves the
// multi-language message displayed under the button.
// -----------------------------------------------------------------------------

import { isIPv4 } from 'node:net';
import { createLogger } from '@gladysassistant/integration-sdk';
import { classOf } from './echonet/frame.js';
import { getDeviceClass } from './echonet/classes.js';
import { MESSAGES } from './i18n.js';

const logger = createLogger({ name: 'actions' });

/** Run a discovery and say what it found. */
export async function discoverAndReport(integration) {
  const { nodes, devices } = await integration.discover();
  return devices > 0 ? MESSAGES.discoveryResult(devices, nodes) : MESSAGES.discoveryEmpty;
}

export const ACTIONS = {
  async discover(integration) {
    logger.info('Action discover');
    return discoverAndReport(integration);
  },

  async test_host(integration, { fields }) {
    const ip = String(fields.host ?? '').trim();
    logger.info(`Action test_host <- ${ip}`);
    if (!isIPv4(ip)) {
      return MESSAGES.hostInvalid;
    }
    const node = await integration.probe(ip);
    if (!node) {
      return MESSAGES.hostNoAnswer(ip);
    }
    const names = node.objects.map((object) => {
      const name = getDeviceClass(classOf(object.eoj))?.name;
      const brand = object.manufacturer ? `${object.manufacturer} ` : '';
      return Object.fromEntries(
        Object.entries(name ?? { en: object.eoj }).map(([lang, text]) => [lang, `${brand}${text}`]),
      );
    });
    if (names.length === 0) {
      return MESSAGES.hostAnswer(ip, [{ en: '-', fr: '-', de: '-', es: '-' }]);
    }
    return MESSAGES.hostAnswer(ip, names);
  },
};
