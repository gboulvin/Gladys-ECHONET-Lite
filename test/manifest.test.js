// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json`, the code
// and the documentation. The manifest is validated by the store indexer, but
// nothing there can know which handlers the code registers.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/actions.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { WIDGETS } from '../src/widgets.js';
import { TRIGGERS } from '../src/integration.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { LANGUAGES, MESSAGES, AC_MODE_LABELS } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

/** Every multi-language object of the manifest, with its path. */
function multiLanguageTexts(value, path = 'manifest') {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => multiLanguageTexts(item, `${path}[${i}]`));
  }
  if (value && typeof value === 'object') {
    if (typeof value.en === 'string') {
      return [{ path, text: value }];
    }
    return Object.entries(value).flatMap(([key, item]) =>
      multiLanguageTexts(item, `${path}.${key}`),
    );
  }
  return [];
}

test('every manifest text is translated in English, French, German and Spanish', () => {
  const texts = multiLanguageTexts(manifest);
  assert.ok(texts.length > 50);
  for (const { path, text } of texts) {
    for (const lang of LANGUAGES) {
      assert.ok(text[lang]?.length > 0, `${path} misses its ${lang} text`);
    }
  }
});

test('every message of the code is translated in the four languages', () => {
  const sample = { en: 'a', fr: 'a', de: 'a', es: 'a' };
  const objects = [
    ...Object.values(MESSAGES).filter((message) => typeof message !== 'function'),
    MESSAGES.discoveryResult(2, 3),
    MESSAGES.hostNoAnswer('192.168.1.2'),
    MESSAGES.hostAnswer('192.168.1.2', [sample]),
    ...Object.values(AC_MODE_LABELS),
  ].filter((message) => typeof message.en === 'string');
  for (const message of objects) {
    for (const lang of LANGUAGES) {
      assert.ok(message[lang], `"${message.en}" misses its ${lang} text`);
    }
  }
});

test('the integration is local only: no cloud transport', () => {
  assert.deepEqual(manifest.transports, ['local']);
});

test('the catalog fields match the Gladys version they require', () => {
  // categories: 4.86.0; widgets and scene capabilities: 5.1.0; keywords and
  // countries: 5.3.0. Older cores reject unknown manifest fields.
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(manifest.countries.every((code) => /^[A-Z]{2}$/.test(code)));
  assert.ok(manifest.keywords.length <= 10);
  assert.ok(manifest.keywords.every((keyword) => keyword.length >= 2 && keyword.length <= 30));
  assert.ok(
    isAtLeast(minGladysVersion(), [5, 3, 0]),
    `countries and keywords require gladys_version >= 5.3.0, got "${manifest.gladys_version}"`,
  );
});

test('discovery declares the ECHONET Lite port', () => {
  assert.deepEqual(manifest.network_discovery, [{ type: 'udp-active-broadcast', ports: [3610] }]);
});

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), Object.keys(ACTIONS).sort());
});

test('every scene_actions key has an onSceneAction handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every widgets key has an onWidgetGet handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  for (const widget of manifest.widgets) {
    for (const [lang, label] of Object.entries(widget.label)) {
      assert.ok(label.length >= 3 && label.length <= 30, `${widget.key} label ${lang}`);
    }
    for (const [lang, text] of Object.entries(widget.description ?? {})) {
      assert.ok(text.length <= 100, `${widget.key} description ${lang}`);
    }
  }
});

test('every scene trigger the code fires is declared, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(TRIGGERS).sort());
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      assert.ok(!(field.key in DEFAULT_CONFIG), `section "${field.key}" stores no value`);
      for (const link of field.links ?? []) {
        assert.match(link.url, /^https:\/\//, 'section links must be https');
      }
      continue;
    }
    assert.ok(field.key in DEFAULT_CONFIG, `DEFAULT_CONFIG misses "${field.key}"`);
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `default of "${field.key}"`);
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  for (const field of allFields.filter((f) => f.source !== undefined)) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, `field "${field.key}": source and options together`);
    assert.equal(field.default, undefined, `field "${field.key}": no default with a source`);
  }
});

test('field placeholders are multi-language objects', () => {
  for (const field of allFields.filter((f) => f.placeholder !== undefined)) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
    assert.ok(field.placeholder.en, `field "${field.key}": placeholder needs an English text`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('the user documentation exists in the four languages', async () => {
  // docs/en.md and docs/fr.md (300 characters minimum) are mandatory for the
  // store; German and Spanish are offered on top.
  for (const lang of LANGUAGES) {
    const doc = await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8');
    assert.ok(doc.length >= 300, `docs/${lang}.md is too short`);
  }
});
