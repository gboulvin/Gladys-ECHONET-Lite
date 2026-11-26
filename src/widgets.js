// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+).
//
// Each entry of WIDGETS is keyed by the widget `key` and exposes:
//   - get(integration, { settings }): the declarative content, registered by
//     index.js with `gladys.onWidgetGet(key, ...)`;
//   - action(integration, { actionKey, params, values, settings }) (optional):
//     a tapped `button` carrying an `action`, registered with
//     `gladys.onWidgetAction`.
//
// Device-bound tiles (`device_feature`) are LIVE: they follow the published
// states without any refresh. The computed parts (connection status) are
// cached by the core until their TTL, or until requestWidgetRefresh.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { featureIdOf, targetOf } from './devices.js';
import { discoverAndReport } from './actions.js';
import { AC_MODE_LABELS, MESSAGES } from './i18n.js';

const logger = createLogger({ name: 'widgets' });

export const WIDGET_KEYS = {
  DEVICES_STATUS: 'devices_status',
  AIR_CONDITIONER: 'air_conditioner',
  ENERGY: 'energy',
};

const ACTIONS = {
  DISCOVER: 'discover',
  SET_TEMPERATURE: 'set_temperature',
  SET_MODE: 'set_mode',
};

const MAX_STATUS_ITEMS = 10;
const MAX_TILES = 6;

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Status row of one device: online, unreachable, fault or not polled yet. */
function healthItem(integration, device) {
  const { reachable, fault } = integration.healthOf(device.external_id);
  let value = MESSAGES.waiting;
  let color = WIDGET_COLORS.NEUTRAL;
  if (reachable === false) {
    value = MESSAGES.unreachable;
    color = WIDGET_COLORS.DANGER;
  } else if (fault === 1) {
    value = MESSAGES.fault;
    color = WIDGET_COLORS.WARNING;
  } else if (reachable === true) {
    value = MESSAGES.online;
    color = WIDGET_COLORS.SUCCESS;
  }
  return { label: truncate(device.name, 40), icon: 'cpu', value, color };
}

const searchButton = {
  type: 'button',
  label: MESSAGES.searchDevices,
  icon: 'search',
  style: 'secondary',
  action: { key: ACTIONS.DISCOVER },
};

/** A live tile per feature key the device has, in order. */
function tiles(device, entries) {
  return entries
    .map(([key, label, icon]) => {
      const externalId = featureIdOf(device, key);
      return externalId ? { type: 'value', label, icon, device_feature: externalId } : null;
    })
    .filter(Boolean);
}

export const WIDGETS = {
  // --- Every ECHONET Lite device and whether it answers ----------------------
  [WIDGET_KEYS.DEVICES_STATUS]: {
    async get(integration) {
      const devices = integration.createdDevices().filter((device) => targetOf(device));
      if (devices.length === 0) {
        return {
          ttl_seconds: 300,
          components: [{ type: 'text', variant: 'body', text: MESSAGES.noDevice }, searchButton],
        };
      }
      return {
        // The health changes with the polls: index.js nudges the widget on
        // every change, the TTL is a safety net.
        ttl_seconds: 120,
        components: [
          {
            type: 'status',
            items: devices
              .slice(0, MAX_STATUS_ITEMS)
              .map((device) => healthItem(integration, device)),
          },
          searchButton,
        ],
      };
    },

    async action(integration, { actionKey }) {
      logger.info(`onWidgetAction <- ${WIDGET_KEYS.DEVICES_STATUS}.${actionKey}`);
      if (actionKey === ACTIONS.DISCOVER) {
        return discoverAndReport(integration);
      }
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  },

  // --- One air conditioner: live readings and quick controls -----------------
  [WIDGET_KEYS.AIR_CONDITIONER]: {
    async get(integration, { settings }) {
      const device = settings?.device ? integration.findDevice(settings.device) : undefined;
      if (!device || targetOf(device)?.classCode !== '0130') {
        return {
          ttl_seconds: 300,
          components: [{ type: 'text', variant: 'body', text: MESSAGES.notAirConditioner }],
        };
      }
      const params = { device: device.external_id };
      const components = [
        ...tiles(device, [
          ['room-temperature', MESSAGES.roomTemperature, 'thermometer'],
          ['target-temperature', MESSAGES.targetTemperature, 'target'],
          ['room-humidity', MESSAGES.humidity, 'droplet'],
        ]),
        { type: 'status', items: [healthItem(integration, device)] },
      ];
      const powerId = featureIdOf(device, 'power');
      if (powerId) {
        components.push(
          {
            type: 'button',
            label: MESSAGES.turnOn,
            icon: 'power',
            style: 'primary',
            device_feature: powerId,
            value: 1,
          },
          {
            type: 'button',
            label: MESSAGES.turnOff,
            icon: 'power',
            style: 'secondary',
            device_feature: powerId,
            value: 0,
          },
        );
      }
      if (featureIdOf(device, 'target-temperature')) {
        components.push({
          type: 'button',
          label: MESSAGES.setTemperature,
          icon: 'thermometer',
          style: 'secondary',
          action: {
            key: ACTIONS.SET_TEMPERATURE,
            params,
            fields: [
              {
                key: 'temperature',
                type: 'number',
                label: MESSAGES.targetTemperature,
                min: 16,
                max: 32,
                required: true,
                default: 24,
              },
            ],
          },
        });
      }
      if (featureIdOf(device, 'mode')) {
        components.push({
          type: 'button',
          label: MESSAGES.setMode,
          icon: 'sliders',
          style: 'secondary',
          action: {
            key: ACTIONS.SET_MODE,
            params,
            fields: [
              {
                key: 'mode',
                type: 'select',
                label: MESSAGES.setMode,
                required: true,
                options: Object.entries(AC_MODE_LABELS).map(([value, label]) => ({
                  value,
                  label,
                })),
              },
            ],
          },
        });
      }
      return { ttl_seconds: 120, components };
    },

    async action(integration, { actionKey, params, values }) {
      logger.info(`onWidgetAction <- ${WIDGET_KEYS.AIR_CONDITIONER}.${actionKey}`);
      let settings;
      if (actionKey === ACTIONS.SET_TEMPERATURE) {
        settings = { target_temperature: values?.temperature };
      } else if (actionKey === ACTIONS.SET_MODE) {
        settings = { mode: values?.mode };
      } else {
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      try {
        await integration.setAirConditioner(params.device, settings);
      } catch (err) {
        logger.warn(`Widget command failed: ${err.message}`);
        throw new Error(MESSAGES.commandRejected.en, { cause: err });
      }
      return MESSAGES.commandSent;
    },
  },

  // --- Energy: smart meter, solar, storage battery ---------------------------
  [WIDGET_KEYS.ENERGY]: {
    async get(integration) {
      const meters = integration.devicesOfClass('0288');
      const boards = integration.devicesOfClass('0287');
      const solars = integration.devicesOfClass('0279');
      const batteries = integration.devicesOfClass('027d');
      const components = [
        ...meters.flatMap((device) => tiles(device, [['grid-power', MESSAGES.gridPower, 'zap']])),
        ...boards.flatMap((device) => tiles(device, [['power', MESSAGES.homePower, 'home']])),
        ...solars.flatMap((device) =>
          tiles(device, [['production-power', MESSAGES.solarPower, 'sun']]),
        ),
        ...batteries.flatMap((device) =>
          tiles(device, [
            ['battery-level', MESSAGES.batteryLevel, 'battery'],
            ['charge-power', MESSAGES.charge, 'battery-charging'],
            ['discharge-power', MESSAGES.discharge, 'arrow-down'],
          ]),
        ),
      ].slice(0, MAX_TILES);
      const devices = [...meters, ...boards, ...solars, ...batteries];
      if (components.length === 0) {
        return {
          ttl_seconds: 300,
          components: [{ type: 'text', variant: 'body', text: MESSAGES.noEnergyDevice }],
        };
      }
      components.push({
        type: 'status',
        items: devices.slice(0, MAX_STATUS_ITEMS).map((device) => healthItem(integration, device)),
      });
      return { ttl_seconds: 300, components };
    },
  },
};

/**
 * Freshness nudge: ask the core to re-pull every widget now (after a
 * (re)connection, a discovery or a change of a device's health). Rate-limited
 * core-side to 1 per 10 s per widget, dropped silently while disconnected.
 */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
