// -----------------------------------------------------------------------------
// From an ECHONET Lite device object to a Gladys device, and back.
//
// A Gladys device is ONE device object (EOJ) of a node: an air conditioner
// adapter hosting a single 0x013001 object gives one device, a HEMS gateway
// exposing a smart meter, a solar inverter and a battery gives three.
//
// Everything needed to reach the object again is stored in the device params
// (IP address, EOJ, property maps), so polling and commands work after a
// restart without running a discovery first.
// -----------------------------------------------------------------------------

import { DEVICE_POLL_FREQUENCIES } from '@gladysassistant/integration-sdk';
import { classOf, instanceOf } from './echonet/frame.js';
import { getDeviceClass, supportedFeatures } from './echonet/classes.js';

export const DEVICE_TYPE = 'echonet';

export const PARAMS = {
  IP_ADDRESS: 'IP_ADDRESS',
  EOJ: 'ECHONET_EOJ',
  GET_MAP: 'ECHONET_GET_MAP',
  SET_MAP: 'ECHONET_SET_MAP',
  MANUFACTURER: 'ECHONET_MANUFACTURER',
};

/** "80,b0,b3" <-> [0x80, 0xb0, 0xb3] */
export const encodeMap = (epcs) => (epcs ?? []).map((epc) => epc.toString(16)).join(',');
export const decodeMap = (text) =>
  String(text ?? '')
    .split(',')
    .map((part) => parseInt(part, 16))
    .filter((epc) => Number.isInteger(epc) && epc >= 0x80 && epc <= 0xff);

/**
 * The stable platform id of a device object: the node identification number
 * (EPC 0x83) when the node has one, else its IP address — then the EOJ.
 * @param {{ip: string, uid: string|null}} node
 * @param {{eoj: string}} object
 */
export function platformIdOf(node, object) {
  const nodeId = node.uid ?? `ip-${node.ip.replace(/[.:]/g, '-')}`;
  return `${nodeId}-${object.eoj}`;
}

/**
 * Build the discovery payload of one device object.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} node - `{ ip, uid }`
 * @param {object} object - `{ eoj, manufacturer, product, getMap, setMap }`
 * @returns {object|null} null for an object Gladys has nothing to show for
 */
export function buildDevice(gladys, node, object) {
  const classCode = classOf(object.eoj);
  const deviceClass = getDeviceClass(classCode);
  const features = supportedFeatures(classCode, object.getMap);
  if (!deviceClass || features.length === 0) {
    return null;
  }
  const ids = gladys.externalIds(DEVICE_TYPE, platformIdOf(node, object));
  const instance = instanceOf(object.eoj);
  const brand = object.manufacturer ?? 'ECHONET Lite';
  const name = `${brand} ${deviceClass.name.en}${instance > 1 ? ` ${instance}` : ''}`;
  const settable = object.setMap ?? [];
  return {
    name,
    external_id: ids.device,
    model: object.product ?? deviceClass.name.en,
    // Gladys polls at most once a minute; the configured refresh interval is
    // applied by skipping polls (see Poller). Motion sensors are read faster:
    // their multicast notifications never reach the container.
    should_poll: true,
    poll_frequency: deviceClass.fast
      ? DEVICE_POLL_FREQUENCIES.EVERY_10_SECONDS
      : DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    params: [
      { name: PARAMS.IP_ADDRESS, value: node.ip },
      { name: PARAMS.EOJ, value: object.eoj },
      { name: PARAMS.GET_MAP, value: encodeMap(object.getMap) },
      { name: PARAMS.SET_MAP, value: encodeMap(object.setMap) },
      { name: PARAMS.MANUFACTURER, value: brand },
    ],
    features: features.map((feature) => ({
      name: feature.name,
      external_id: ids.feature(feature.key),
      category: feature.category,
      type: feature.type,
      ...(feature.unit ? { unit: feature.unit } : {}),
      min: feature.min,
      max: feature.max,
      // Writable only when the device lists the property in its Set map (an
      // empty map means "unknown": trust the class definition).
      read_only:
        feature.setEpc === undefined || (settable.length > 0 && !settable.includes(feature.setEpc)),
      has_feedback: true,
      keep_history: true,
    })),
  };
}

/** Value of a device param, or undefined. */
export function paramOf(device, name) {
  return device?.params?.find((param) => param.name === name)?.value;
}

/**
 * Where to reach a Gladys device, from its params.
 * @returns {{ip: string, eoj: string, classCode: string, getMap: number[], setMap: number[]}|null}
 */
export function targetOf(device) {
  const ip = paramOf(device, PARAMS.IP_ADDRESS);
  const eoj = paramOf(device, PARAMS.EOJ);
  if (!ip || !eoj) {
    return null;
  }
  return {
    ip,
    eoj,
    classCode: classOf(eoj),
    getMap: decodeMap(paramOf(device, PARAMS.GET_MAP)),
    setMap: decodeMap(paramOf(device, PARAMS.SET_MAP)),
  };
}

/**
 * The definitions of a device's features, paired with their Gladys external
 * ids. Only the features the device carries in Gladys are returned.
 * @returns {Array<{definition: object, externalId: string}>}
 */
export function featuresOf(device) {
  const target = targetOf(device);
  if (!target) {
    return [];
  }
  const definitions = getDeviceClass(target.classCode)?.features ?? [];
  const prefix = `${device.external_id}:`;
  return (device.features ?? [])
    .filter((feature) => feature.external_id?.startsWith(prefix))
    .map((feature) => ({
      externalId: feature.external_id,
      definition: definitions.find(
        (definition) => definition.key === feature.external_id.slice(prefix.length),
      ),
    }))
    .filter(({ definition }) => definition !== undefined);
}

/** Feature external id of a device for a feature key, or undefined. */
export function featureIdOf(device, key) {
  const externalId = `${device.external_id}:${key}`;
  return device.features?.some((feature) => feature.external_id === externalId)
    ? externalId
    : undefined;
}
