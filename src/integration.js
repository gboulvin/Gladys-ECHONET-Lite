// -----------------------------------------------------------------------------
// The ECHONET Lite integration at runtime: discovery, polling, commands,
// scene events and the per-device health. index.js only wires the SDK
// handlers to the methods of this class.
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_POLL_FREQUENCIES,
  DEVICE_TRANSPORTS,
} from '@gladysassistant/integration-sdk';
import { EchonetClient } from './echonet/client.js';
import { EPC, normalizeEoj, parseEpc, parseHex } from './echonet/frame.js';
import {
  AC_EPC,
  AC_FAN_SPEED,
  AC_MODE,
  MOTION_EPC,
  encodeAcMode,
  encodeFanSpeed,
  encodeTargetTemperature,
  epcsToRead,
  getDeviceClass,
} from './echonet/classes.js';
import { buildDevice, featuresOf, paramOf, PARAMS, targetOf } from './devices.js';
import { describeNode, discoverNodes } from './discovery.js';
import { normalizeConfig } from './config.js';

const logger = createLogger({ name: 'echonet' });

// Scene trigger keys, as declared in the manifest `scene_triggers`. Keys are
// forever: scenes store them.
export const TRIGGERS = {
  MOTION_DETECTED: 'motion_detected',
  FAULT_DETECTED: 'fault_detected',
  DEVICE_UNREACHABLE: 'device_unreachable',
};

// Option values of the scene action / widget selects -> Gladys values.
export const AC_MODE_OPTIONS = {
  auto: AC_MODE.AUTO,
  cool: AC_MODE.COOLING,
  heat: AC_MODE.HEATING,
  dry: AC_MODE.DRYING,
  fan: AC_MODE.FAN,
};
export const FAN_SPEED_OPTIONS = {
  auto: AC_FAN_SPEED.AUTO,
  low: AC_FAN_SPEED.LOW,
  low_mid: AC_FAN_SPEED.LOW_MID,
  mid: AC_FAN_SPEED.MID,
  mid_high: AC_FAN_SPEED.MID_HIGH,
  high: AC_FAN_SPEED.HIGH,
};

const HEARTBEAT_MS = 30 * 60 * 1000;
// Gladys' poll ticks drift by a few milliseconds: a read due within the next
// half-minute runs now, so a 300 s interval does not slip to 360 s.
const POLL_TOLERANCE_MS = DEVICE_POLL_FREQUENCIES.EVERY_MINUTES / 2;

const decodeYesNo = (edt) => {
  if (!edt || edt.length === 0) return null;
  if (edt[0] === 0x41) return 1;
  if (edt[0] === 0x42) return 0;
  return null;
};

export class EchonetIntegration {
  /**
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
   * @param {object} [options]
   * @param {EchonetClient} [options.client] - injected by the tests
   */
  constructor(gladys, { client } = {}) {
    this.gladys = gladys;
    this.client = client ?? new EchonetClient();
    this.config = normalizeConfig();
    // external_id -> discovery payload of the last discovery.
    this.discovered = new Map();
    // Number of nodes that answered the last discovery.
    this.lastNodeCount = 0;
    // external_id -> { reachable, fault }
    this.health = new Map();
    // external_id -> last motion state (0/1)
    this.motion = new Map();
    // external_id -> timestamp of the last read
    this.lastReads = new Map();
    // Called when a device starts or stops answering, or enters or leaves a
    // fault (index.js nudges the dashboard widgets).
    this.onHealthChange = () => {};
    this.client.on('notification', (notification) =>
      this.handleNotification(notification).catch((err) =>
        logger.error('Notification handling failed', err),
      ),
    );
  }

  /** Apply a (new) configuration. */
  setConfig(rawConfig) {
    this.config = normalizeConfig(rawConfig);
    this.client.timeoutMs = this.config.request_timeout * 1000;
  }

  async start() {
    await this.client.start();
  }

  stop() {
    this.client.stop();
  }

  // --- Devices ----------------------------------------------------------------

  /** The devices the user added to Gladys. */
  createdDevices() {
    return this.gladys.devices ?? [];
  }

  /** A device by external id: an added one first, else a discovered one. */
  findDevice(externalId) {
    return (
      this.createdDevices().find((device) => device.external_id === externalId) ??
      this.discovered.get(externalId)
    );
  }

  /** The added devices of a class (e.g. "0130"). */
  devicesOfClass(classCode) {
    return this.createdDevices().filter((device) => targetOf(device)?.classCode === classCode);
  }

  /**
   * Find the nodes and publish their devices in the Discovery tab.
   * @returns {Promise<{nodes: number, devices: number}>}
   */
  async discover() {
    const knownIps = this.createdDevices()
      .map((device) => paramOf(device, PARAMS.IP_ADDRESS))
      .filter(Boolean);
    const nodes = await discoverNodes({
      gladys: this.gladys,
      client: this.client,
      config: this.config,
      knownIps,
    });
    this.discovered.clear();
    for (const node of nodes) {
      for (const object of node.objects) {
        const device = buildDevice(this.gladys, node, object);
        if (device) {
          this.discovered.set(device.external_id, device);
        }
      }
    }
    this.lastNodeCount = nodes.length;
    await this.publishDiscovered();
    logger.info(`Discovery: ${this.discovered.size} device(s) on ${nodes.length} node(s)`);
    return { nodes: nodes.length, devices: this.discovered.size };
  }

  /** (Re)publish the result of the last discovery. */
  async publishDiscovered() {
    await this.gladys.publishDiscoveredDevices([...this.discovered.values()]);
  }

  /**
   * Probe a single IP address (the `test_host` action).
   * @returns {Promise<object|null>} the node, or null without answer
   */
  async probe(ip) {
    return describeNode(this.client, ip);
  }

  // --- Polling ----------------------------------------------------------------

  /**
   * Gladys' poll of a device: read it when due (motion sensors at every poll,
   * the others at the configured refresh interval).
   * @returns {Promise<boolean>} true when the device was read
   */
  async onPoll(device, { force = false } = {}) {
    const target = targetOf(device);
    if (!target) {
      return false;
    }
    const fast = getDeviceClass(target.classCode)?.fast === true;
    const now = Date.now();
    const lastRead = this.lastReads.get(device.external_id);
    if (
      !force &&
      !fast &&
      lastRead !== undefined &&
      now - lastRead < this.config.poll_frequency * 1000 - POLL_TOLERANCE_MS
    ) {
      return false;
    }
    await this.readDevice(device);
    this.lastReads.set(device.external_id, now);
    return true;
  }

  /** Read every feature of a device and publish what changed. */
  async readDevice(device) {
    const target = targetOf(device);
    const features = featuresOf(device);
    const epcs = epcsToRead(features.map(({ definition }) => definition));
    const watchFault = target.getMap.length === 0 || target.getMap.includes(EPC.FAULT_STATUS);
    if (watchFault) {
      epcs.push(EPC.FAULT_STATUS);
    }
    if (epcs.length === 0) {
      return new Map();
    }
    let values;
    try {
      values = await this.client.get(target.ip, target.eoj, epcs);
    } catch (err) {
      await this.setReachable(device, false);
      throw err;
    }
    await this.setReachable(device, true);
    await this.publishValues(device, features, values);
    if (watchFault) {
      await this.updateFault(device, decodeYesNo(values.get(EPC.FAULT_STATUS)));
    }
    return values;
  }

  async publishValues(device, features, values) {
    const states = [];
    for (const { definition, externalId } of features) {
      const reads = definition.reads ?? [definition.epc];
      if (!values.has(reads[0])) {
        continue;
      }
      const state = definition.decode(values);
      if (state !== null && Number.isFinite(state)) {
        states.push({ device_feature_external_id: externalId, state });
      }
    }
    if (states.length > 0) {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    }
    if (values.has(MOTION_EPC) && targetOf(device).classCode === '0007') {
      await this.updateMotion(device, decodeYesNo(values.get(MOTION_EPC)));
    }
  }

  // --- Scene triggers ---------------------------------------------------------
  // One event per TRANSITION, from a known previous state: a restart while a
  // sensor reports motion (or a device a fault) fires nothing.

  async updateMotion(device, motion) {
    if (motion === null) return;
    const previous = this.motion.get(device.external_id);
    this.motion.set(device.external_id, motion);
    if (previous === 0 && motion === 1) {
      await this.gladys.publishSceneEvent(TRIGGERS.MOTION_DETECTED, {
        device: device.external_id,
        device_name: device.name,
      });
    }
  }

  async updateFault(device, fault) {
    if (fault === null) return;
    const health = this.healthOf(device.external_id);
    const previous = health.fault;
    health.fault = fault;
    if (previous !== fault) {
      this.onHealthChange(device);
    }
    if (previous === 0 && fault === 1) {
      await this.gladys.publishSceneEvent(TRIGGERS.FAULT_DETECTED, {
        device: device.external_id,
        device_name: device.name,
      });
    }
  }

  healthOf(externalId) {
    if (!this.health.has(externalId)) {
      this.health.set(externalId, { reachable: null, fault: null });
    }
    return this.health.get(externalId);
  }

  /**
   * Record whether a device answers; on a change, update its transport badge
   * and, when it stops answering, fire the `device_unreachable` trigger.
   */
  async setReachable(device, reachable) {
    const health = this.healthOf(device.external_id);
    const previous = health.reachable;
    health.reachable = reachable;
    if (previous === reachable) {
      return;
    }
    this.onHealthChange(device);
    await this.gladys
      .publishTransports([
        {
          external_id: device.external_id,
          transport: reachable ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE,
        },
      ])
      .catch((err) => logger.warn(`publishTransports failed: ${err.message}`));
    if (previous === true && reachable === false) {
      await this.gladys.publishSceneEvent(TRIGGERS.DEVICE_UNREACHABLE, {
        device: device.external_id,
        device_name: device.name,
        ip_address: paramOf(device, PARAMS.IP_ADDRESS) ?? '',
      });
    }
  }

  /** A spontaneous notification (INF) of a node: publish what it carries. */
  async handleNotification({ ip, frame }) {
    const seoj = normalizeEoj(frame.seoj);
    const device = this.createdDevices().find((candidate) => {
      const target = targetOf(candidate);
      return target?.ip === ip && target.eoj === seoj;
    });
    if (!device) {
      return;
    }
    const values = new Map(
      frame.properties.filter(({ edt }) => edt.length > 0).map(({ epc, edt }) => [epc, edt]),
    );
    await this.publishValues(device, featuresOf(device), values);
    if (values.has(EPC.FAULT_STATUS)) {
      await this.updateFault(device, decodeYesNo(values.get(EPC.FAULT_STATUS)));
    }
  }

  // --- Commands -----------------------------------------------------------------

  /** The user acts on a feature in Gladys. */
  async onSetValue(device, feature, value) {
    const target = targetOf(device);
    const entry = featuresOf(device).find(({ externalId }) => externalId === feature.external_id);
    if (!target || !entry) {
      throw new Error(`Unknown ECHONET Lite feature ${feature.external_id}`);
    }
    const { definition } = entry;
    if (definition.setEpc === undefined) {
      throw new Error(`${definition.name} is read-only`);
    }
    const edt = definition.encode(value);
    logger.info(
      `Set ${target.ip} ${target.eoj} EPC 0x${definition.setEpc.toString(16)} = ${edt.toString('hex')}`,
    );
    await this.write(device, [{ epc: definition.setEpc, edt }]);
    // has_feedback: publish what the device reports after the command.
    let state = Number(value);
    try {
      const values = await this.client.get(
        target.ip,
        target.eoj,
        definition.reads ?? [definition.epc],
      );
      state = definition.decode(values) ?? state;
    } catch (err) {
      logger.warn(`Read-back failed after a command: ${err.message}`);
    }
    await this.gladys.publishState(feature.external_id, state);
  }

  /** SetC some properties of a device; throws when the device refuses. */
  async write(device, properties) {
    const target = targetOf(device);
    let result;
    try {
      result = await this.client.set(target.ip, target.eoj, properties);
    } catch (err) {
      await this.setReachable(device, false);
      throw err;
    }
    await this.setReachable(device, true);
    if (!result.ok) {
      const refused = result.rejected.map((epc) => `0x${epc.toString(16)}`).join(', ');
      throw new Error(`The device refused the command${refused ? ` (EPC ${refused})` : ''}`);
    }
  }

  requireDevice(externalId) {
    const device = this.findDevice(externalId);
    if (!device || !targetOf(device)) {
      throw new Error(`Unknown ECHONET Lite device: ${externalId}`);
    }
    return device;
  }

  /**
   * Set several air conditioner settings at once (scene action / widget).
   * @param {string} externalId
   * @param {{power?: string, mode?: string, target_temperature?: number, fan_speed?: string}} settings
   */
  async setAirConditioner(externalId, settings) {
    const device = this.requireDevice(externalId);
    if (targetOf(device).classCode !== '0130') {
      throw new Error(`${device.name} is not an air conditioner`);
    }
    const properties = [];
    if (settings.mode && AC_MODE_OPTIONS[settings.mode] !== undefined) {
      properties.push({ epc: AC_EPC.MODE, edt: encodeAcMode(AC_MODE_OPTIONS[settings.mode]) });
    }
    const temperature = Number(settings.target_temperature);
    if (
      settings.target_temperature !== undefined &&
      settings.target_temperature !== null &&
      settings.target_temperature !== '' &&
      Number.isFinite(temperature)
    ) {
      properties.push({
        epc: AC_EPC.TARGET_TEMPERATURE,
        edt: encodeTargetTemperature(temperature),
      });
    }
    if (settings.fan_speed && FAN_SPEED_OPTIONS[settings.fan_speed] !== undefined) {
      properties.push({
        epc: AC_EPC.FAN_SPEED,
        edt: encodeFanSpeed(FAN_SPEED_OPTIONS[settings.fan_speed]),
      });
    }
    if (settings.power === 'on' || settings.power === 'off') {
      properties.push({
        epc: EPC.OPERATION_STATUS,
        edt: Buffer.from([settings.power === 'on' ? 0x30 : 0x31]),
      });
    }
    if (properties.length === 0) {
      return false;
    }
    await this.write(device, properties);
    await this.refresh(device);
    return true;
  }

  /** Read a device now and publish its states; resolves whether it answered. */
  async refresh(deviceOrId) {
    const device = typeof deviceOrId === 'string' ? this.requireDevice(deviceOrId) : deviceOrId;
    try {
      await this.readDevice(device);
      this.lastReads.set(device.external_id, Date.now());
      return true;
    } catch (err) {
      logger.warn(`Refresh of ${device.external_id} failed: ${err.message}`);
      return false;
    }
  }

  /**
   * Read one raw property (advanced scene action).
   * @returns {Promise<{hex: string, number: number|null}|null>} null when unsupported
   */
  async readProperty(externalId, epcText) {
    const device = this.requireDevice(externalId);
    const target = targetOf(device);
    const epc = parseEpc(epcText);
    const values = await this.client.get(target.ip, target.eoj, [epc]);
    const edt = values.get(epc);
    if (!edt) {
      return null;
    }
    return {
      hex: edt.toString('hex'),
      number: edt.length > 0 && edt.length <= 6 ? edt.readUIntBE(0, edt.length) : null,
    };
  }

  /** Write one raw property (advanced scene action). */
  async writeProperty(externalId, epcText, edtText) {
    const device = this.requireDevice(externalId);
    await this.write(device, [{ epc: parseEpc(epcText), edt: parseHex(edtText) }]);
    await this.refresh(device);
  }
}
