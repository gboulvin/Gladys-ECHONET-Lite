// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`; fetched with `gladys.getConfig()` and
// pushed again through `gladys.onConfigUpdated()`. This module provides the
// defaults and normalizes the received object, so the rest of the code never
// deals with `undefined` or a number typed as a string.
// -----------------------------------------------------------------------------

import { isIPv4 } from 'node:net';

// Defaults: they MUST stay consistent with the `default` values declared in
// the `config_schema` of the manifest (checked by test/manifest.test.js).
export const DEFAULT_CONFIG = {
  // Ask the Gladys core to broadcast an ECHONET Lite discovery request on the
  // LAN (the container cannot broadcast from its bridge network).
  broadcast_discovery: true,
  // Comma-separated IPv4 addresses of nodes to query directly.
  hosts: '',
  // Optional subnet (CIDR, /22 to /32) whose addresses are queried one by one.
  subnet: '',
  // Seconds between two reads of a device (Gladys polls at most once a
  // minute; motion sensors are read every 10 seconds whatever this value).
  poll_frequency: 60,
  // Seconds to wait for a node's answer before giving up.
  request_timeout: 3,
};

export const MIN_POLL_FREQUENCY = 60;
export const MAX_POLL_FREQUENCY = 3600;
const MIN_SUBNET_PREFIX = 22;

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
};

/**
 * Parse the `hosts` field: IPv4 addresses separated by commas, semicolons,
 * spaces or new lines. Invalid entries are dropped.
 * @param {string} text
 * @returns {string[]}
 */
export function parseHosts(text) {
  return [
    ...new Set(
      String(text ?? '')
        .split(/[\s,;]+/)
        .map((entry) => entry.trim())
        .filter((entry) => isIPv4(entry)),
    ),
  ];
}

const ipToInt = (ip) => ip.split('.').reduce((acc, part) => acc * 256 + Number(part), 0);
const intToIp = (value) =>
  [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.');

/**
 * Expand a CIDR subnet ("192.168.1.0/24") into its host addresses (network
 * and broadcast addresses excluded). Anything wider than /22 (1022 hosts) or
 * malformed resolves to an empty list.
 * @param {string} cidr
 * @returns {string[]}
 */
export function expandSubnet(cidr) {
  const match = /^\s*(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})\s*$/.exec(String(cidr ?? ''));
  if (!match || !isIPv4(match[1])) {
    return [];
  }
  const prefix = Number(match[2]);
  if (prefix < MIN_SUBNET_PREFIX || prefix > 32) {
    return [];
  }
  const size = 2 ** (32 - prefix);
  const network = Math.floor(ipToInt(match[1]) / size) * size;
  if (size <= 2) {
    return Array.from({ length: size }, (_, i) => intToIp(network + i));
  }
  return Array.from({ length: size - 2 }, (_, i) => intToIp(network + i + 1));
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    broadcast_discovery: raw.broadcast_discovery !== false && raw.broadcast_discovery !== 'false',
    hosts: typeof raw.hosts === 'string' ? raw.hosts : DEFAULT_CONFIG.hosts,
    subnet: typeof raw.subnet === 'string' ? raw.subnet.trim() : DEFAULT_CONFIG.subnet,
    poll_frequency: clamp(
      raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency,
      MIN_POLL_FREQUENCY,
      MAX_POLL_FREQUENCY,
      DEFAULT_CONFIG.poll_frequency,
    ),
    request_timeout: clamp(
      raw.request_timeout ?? DEFAULT_CONFIG.request_timeout,
      1,
      10,
      DEFAULT_CONFIG.request_timeout,
    ),
  };
}
