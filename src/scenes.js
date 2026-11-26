// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// Each entry is keyed by the action `key` declared in the manifest and
// registered by index.js with `gladys.onSceneAction(key, ...)`. The handler
// receives the RESOLVED fields (a `"source": "devices"` field is the chosen
// device external_id) and resolves the declared scalar `outputs`.
//
// A device that does not answer is an output (`success: false`), not a
// failure: a scene action is never a condition, the scene author gates the
// following actions on its outputs. Only a misuse (unknown device, invalid
// hexadecimal) throws, which fails this action and lets the scene continue.
//
// Scene TRIGGERS are fired by the integration itself, see
// src/integration.js (motion_detected, fault_detected, device_unreachable).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'scenes' });

export const SCENE_ACTIONS = {
  async set_air_conditioner(integration, { fields }) {
    logger.info(`Scene action set_air_conditioner <- ${fields.device}`);
    try {
      const success = await integration.setAirConditioner(fields.device, {
        power: fields.power,
        mode: fields.mode,
        target_temperature: fields.target_temperature,
        fan_speed: fields.fan_speed,
      });
      return { success };
    } catch (err) {
      if (/Unknown ECHONET Lite device|not an air conditioner/.test(err.message)) {
        throw err;
      }
      logger.warn(`set_air_conditioner failed: ${err.message}`);
      return { success: false };
    }
  },

  async refresh_device(integration, { fields }) {
    logger.info(`Scene action refresh_device <- ${fields.device}`);
    const reachable = await integration.refresh(fields.device);
    return { reachable };
  },

  async read_property(integration, { fields }) {
    logger.info(`Scene action read_property <- ${fields.device} EPC ${fields.epc}`);
    let result;
    try {
      result = await integration.readProperty(fields.device, fields.epc);
    } catch (err) {
      if (/Invalid|Unknown ECHONET Lite device/.test(err.message)) {
        throw err;
      }
      logger.warn(`read_property failed: ${err.message}`);
      return { success: false, value_hex: '', value_number: 0 };
    }
    if (!result) {
      return { success: false, value_hex: '', value_number: 0 };
    }
    return { success: true, value_hex: result.hex, value_number: result.number ?? 0 };
  },

  async write_property(integration, { fields }) {
    logger.info(`Scene action write_property <- ${fields.device} EPC ${fields.epc}`);
    try {
      await integration.writeProperty(fields.device, fields.epc, fields.value);
      return { success: true };
    } catch (err) {
      if (/Invalid|Unknown ECHONET Lite device/.test(err.message)) {
        throw err;
      }
      logger.warn(`write_property failed: ${err.message}`);
      return { success: false };
    }
  },
};
