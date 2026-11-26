// -----------------------------------------------------------------------------
// Entry point of the ECHONET Lite integration for Gladys Assistant.
//
// Role of this file: wire the SDK to the integration (src/integration.js). It
// holds NO protocol logic. It only:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. connects, then discovers the ECHONET Lite nodes of the LAN.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { EchonetIntegration } from './src/integration.js';
import { ACTIONS } from './src/actions.js';
import { SCENE_ACTIONS } from './src/scenes.js';
import { WIDGETS, refreshWidgets } from './src/widgets.js';
import { MESSAGES } from './src/i18n.js';

const gladys = new GladysIntegration();
const integration = new EchonetIntegration(gladys);
integration.onHealthChange = () => refreshWidgets(gladys);

// --- Discovery: the user opens the Discovery tab or clicks "Scan" -----------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> discovering the ECHONET Lite nodes');
  await integration.discover();
  refreshWidgets(gladys);
});

// --- Command: the user acts on a controllable feature ------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  await integration.onSetValue(device, feature, value);
});

// --- Polling: Gladys asks to refresh a device --------------------------------
gladys.onPoll(async (device) => {
  if (!(await integration.onPoll(device))) {
    logger.debug(`onPoll skipped (not due) for ${device.external_id}`);
  }
});

// --- Manifest actions: buttons in the Configuration screen -------------------
for (const [actionKey, handler] of Object.entries(ACTIONS)) {
  gladys.onAction(actionKey, (fields) => handler(integration, { fields }));
}

// --- Scene actions -------------------------------------------------------------
// Scene TRIGGERS need no handler: the integration fires them with
// publishSceneEvent (see src/integration.js).
for (const [actionKey, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(actionKey, (fields) => handler(integration, { fields }));
}

// --- Dashboard widgets -------------------------------------------------------
for (const [widgetKey, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(widgetKey, (request) => widget.get(integration, request));
  if (typeof widget.action === 'function') {
    gladys.onWidgetAction(widgetKey, (actionKey, params, { settings, values }) =>
      widget.action(integration, { actionKey, params, settings, values }),
    );
  }
}

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  integration.setConfig(newConfig);
  // New hosts or subnet: look for the devices again.
  discoverInBackground();
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    integration.setConfig(await gladys.getConfig());
    await integration.start();
    await gladys.setConnectionStatus(true);
    refreshWidgets(gladys);
    // The discovery can take a while (broadcast, subnet sweep): never block
    // the connection on it.
    discoverInBackground();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys.setConnectionStatus(false, MESSAGES.initFailed).catch(() => {});
  }
});

function discoverInBackground() {
  integration
    .discover()
    .then(() => refreshWidgets(gladys))
    .catch((err) => logger.error('Discovery failed', err));
}

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  integration.stop();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the ECHONET Lite integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
