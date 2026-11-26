// -----------------------------------------------------------------------------
// Discovery of the ECHONET Lite nodes of the LAN.
//
// ECHONET Lite discovery is a multicast/broadcast "Get self-node instance
// list" (node profile 0x0EF001, EPC 0xD6) to which every node answers. The
// integration container sits on a bridge network that cannot broadcast to the
// LAN, so three sources are combined:
//
//   1. the Gladys core broadcasts the request for us (manifest
//      `network_discovery`, type `udp-active-broadcast` on port 3610) and
//      relays the unicast answers;
//   2. the IP addresses the user listed in the configuration;
//   3. optionally, every address of a subnet, queried in unicast (unicast
//      crosses the Docker NAT);
//
// plus the nodes of the devices already added to Gladys, so a device that
// changed nothing stays discoverable. Each answering node is then described
// in unicast: its device objects, their manufacturer, product code and
// property maps.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  CONTROLLER_EOJ,
  ECHONET_PORT,
  EPC,
  ESV,
  NODE_PROFILE_EOJ,
  classOf,
  decodeFrame,
  decodeInstanceList,
  decodePropertyMap,
  encodeFrame,
} from './echonet/frame.js';
import { getDeviceClass } from './echonet/classes.js';
import { identificationNumber, manufacturerName, productCode } from './echonet/manufacturers.js';
import { expandSubnet, parseHosts } from './config.js';

const logger = createLogger({ name: 'discovery' });

const SCAN_TIMEOUT_SECONDS = 3;
const SUBNET_CONCURRENCY = 32;
const SUBNET_TIMEOUT_MS = 800;

/** The broadcast discovery request: Get 0xD6 on the node profile. */
export function buildDiscoveryRequest() {
  return encodeFrame({
    tid: 1,
    seoj: CONTROLLER_EOJ,
    deoj: NODE_PROFILE_EOJ,
    esv: ESV.GET,
    properties: [{ epc: EPC.SELF_NODE_INSTANCE_LIST_S }],
  });
}

/**
 * The IPs of the nodes that answered a mediated broadcast scan
 * (`[{ source_ip, source_port, payload_base64 }]`). Anything that is not an
 * ECHONET Lite answer is ignored.
 * @param {Array<{source_ip: string, payload_base64: string}>} replies
 * @returns {string[]}
 */
export function parseScanReplies(replies) {
  const ips = new Set();
  for (const reply of replies ?? []) {
    try {
      const frame = decodeFrame(Buffer.from(reply.payload_base64 ?? '', 'base64'));
      if ([ESV.GET_RES, ESV.GET_SNA, ESV.INF].includes(frame.esv) && reply.source_ip) {
        ips.add(reply.source_ip);
      }
    } catch {
      // not ECHONET Lite: ignored
    }
  }
  return [...ips];
}

/**
 * Describe one node: its identification number and its device objects.
 * @param {import('./echonet/client.js').EchonetClient} client
 * @param {string} ip
 * @param {object} [options] - request options for the first probe
 * @returns {Promise<{ip: string, uid: string|null, objects: object[]}|null>}
 *   null when the node does not answer
 */
export async function describeNode(client, ip, options) {
  let profile;
  try {
    profile = await client.get(
      ip,
      NODE_PROFILE_EOJ,
      [EPC.SELF_NODE_INSTANCE_LIST_S, EPC.IDENTIFICATION_NUMBER, EPC.MANUFACTURER_CODE],
      options,
    );
  } catch {
    return null;
  }
  const nodeManufacturer = manufacturerName(profile.get(EPC.MANUFACTURER_CODE));
  const eojs = decodeInstanceList(profile.get(EPC.SELF_NODE_INSTANCE_LIST_S)).filter(
    (eoj) => getDeviceClass(classOf(eoj)) !== null,
  );
  const objects = [];
  for (const eoj of eojs) {
    try {
      const values = await client.get(ip, eoj, [
        EPC.GET_PROPERTY_MAP,
        EPC.SET_PROPERTY_MAP,
        EPC.MANUFACTURER_CODE,
        EPC.PRODUCT_CODE,
        EPC.IDENTIFICATION_NUMBER,
      ]);
      objects.push({
        eoj,
        manufacturer: manufacturerName(values.get(EPC.MANUFACTURER_CODE)) ?? nodeManufacturer,
        product: productCode(values.get(EPC.PRODUCT_CODE)),
        getMap: decodePropertyMap(values.get(EPC.GET_PROPERTY_MAP)),
        setMap: decodePropertyMap(values.get(EPC.SET_PROPERTY_MAP)),
        uid: identificationNumber(values.get(EPC.IDENTIFICATION_NUMBER)),
      });
    } catch (err) {
      logger.warn(`Could not describe ${eoj} on ${ip}: ${err.message}`);
    }
  }
  // The node identification number is the stable id; a node without one
  // falls back to the id of its first object, then to its IP address.
  const uid =
    identificationNumber(profile.get(EPC.IDENTIFICATION_NUMBER)) ??
    objects.find((object) => object.uid)?.uid ??
    null;
  return { ip, uid, objects };
}

/** Run `task` over `items`, `concurrency` at a time. */
async function mapLimit(items, concurrency, task) {
  const results = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Ask the Gladys core to broadcast the discovery request. Never throws: an
 * older core, a refused scan or a rate limit only means fewer candidates.
 */
async function broadcastScan(gladys) {
  try {
    const replies = await gladys.scanNetwork('udp-active-broadcast', {
      port: ECHONET_PORT,
      payload: buildDiscoveryRequest(),
      timeoutSeconds: SCAN_TIMEOUT_SECONDS,
    });
    return parseScanReplies(replies);
  } catch (err) {
    logger.warn(`Broadcast discovery unavailable: ${err.message}`);
    return [];
  }
}

/**
 * Find and describe the ECHONET Lite nodes.
 * @param {object} context
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} context.gladys
 * @param {import('./echonet/client.js').EchonetClient} context.client
 * @param {object} context.config - normalized config
 * @param {string[]} [context.knownIps] - IPs of the devices already in Gladys
 * @returns {Promise<Array<{ip: string, uid: string|null, objects: object[]}>>}
 */
export async function discoverNodes({ gladys, client, config, knownIps = [] }) {
  const candidates = new Set([...parseHosts(config.hosts), ...knownIps]);
  if (config.broadcast_discovery) {
    for (const ip of await broadcastScan(gladys)) {
      candidates.add(ip);
    }
  }

  // The subnet sweep only keeps the addresses that answer, with a short
  // timeout and no retry: most addresses of a subnet are silent.
  const sweep = expandSubnet(config.subnet).filter((ip) => !candidates.has(ip));
  if (sweep.length > 0) {
    logger.info(`Querying ${sweep.length} addresses of ${config.subnet}`);
    const answered = await mapLimit(sweep, SUBNET_CONCURRENCY, async (ip) => {
      try {
        await client.getInstances(ip, { timeoutMs: SUBNET_TIMEOUT_MS, retries: 0 });
        return ip;
      } catch {
        return null;
      }
    });
    for (const ip of answered.filter(Boolean)) {
      candidates.add(ip);
    }
  }

  logger.info(`Describing ${candidates.size} candidate node(s)`);
  const nodes = await mapLimit([...candidates], 8, (ip) => describeNode(client, ip));
  return nodes.filter((node) => node !== null);
}
