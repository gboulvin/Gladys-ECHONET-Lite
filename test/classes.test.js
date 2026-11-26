import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AC_FAN_SPEED,
  AC_MODE,
  DEVICE_CLASSES,
  epcsToRead,
  getDeviceClass,
  supportedFeatures,
} from '../src/echonet/classes.js';
import { LANGUAGES } from '../src/i18n.js';

const values = (entries) =>
  new Map(Object.entries(entries).map(([epc, hex]) => [Number(epc), Buffer.from(hex, 'hex')]));
const feature = (classCode, key) => DEVICE_CLASSES[classCode].features.find((f) => f.key === key);

test('every class has a name in the four languages and unique feature keys', () => {
  for (const [code, deviceClass] of Object.entries(DEVICE_CLASSES)) {
    for (const lang of LANGUAGES) {
      assert.ok(deviceClass.name[lang], `class ${code}: missing ${lang} name`);
    }
    const keys = deviceClass.features.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, `class ${code}: duplicated feature key`);
    for (const f of deviceClass.features) {
      assert.ok(f.min <= f.max, `class ${code} / ${f.key}: min <= max`);
      if (f.setEpc !== undefined) {
        assert.equal(typeof f.encode, 'function', `class ${code} / ${f.key}: encode`);
      }
    }
  }
});

test('operation status: 0x30 is on, 0x31 is off, and back', () => {
  const power = feature('0130', 'power');
  assert.equal(power.decode(values({ 0x80: '30' })), 1);
  assert.equal(power.decode(values({ 0x80: '31' })), 0);
  assert.equal(power.decode(values({ 0x80: '00' })), null);
  assert.equal(power.encode(1).toString('hex'), '30');
  assert.equal(power.encode(0).toString('hex'), '31');
});

test('air conditioner modes map to the Gladys AC_MODE values and back', () => {
  const mode = feature('0130', 'mode');
  const pairs = [
    ['41', AC_MODE.AUTO],
    ['42', AC_MODE.COOLING],
    ['43', AC_MODE.HEATING],
    ['44', AC_MODE.DRYING],
    ['45', AC_MODE.FAN],
  ];
  for (const [raw, gladys] of pairs) {
    assert.equal(mode.decode(values({ 0xb0: raw })), gladys);
    assert.equal(mode.encode(gladys).toString('hex'), raw);
  }
  assert.equal(mode.decode(values({ 0xb0: '40' })), null, '"other" has no Gladys value');
  assert.throws(() => mode.encode(9), /Unsupported/);
});

test('fan speeds round-trip through the eight ECHONET levels', () => {
  const fan = feature('0130', 'fan-speed');
  for (const speed of Object.values(AC_FAN_SPEED)) {
    assert.equal(fan.decode(new Map([[0xa0, fan.encode(speed)]])), speed);
  }
  assert.equal(fan.decode(values({ 0xa0: '32' })), AC_FAN_SPEED.LOW);
  assert.equal(fan.decode(values({ 0xa0: '37' })), AC_FAN_SPEED.MID_HIGH);
});

test('temperatures: signed bytes, and the "unmeasurable" codes carry no value', () => {
  const outdoor = feature('0130', 'outdoor-temperature');
  assert.equal(outdoor.decode(values({ 0xbe: 'fb' })), -5);
  assert.equal(outdoor.decode(values({ 0xbe: '7e' })), null);
  const target = feature('0130', 'target-temperature');
  assert.equal(target.decode(values({ 0xb3: '1a' })), 26);
  assert.equal(target.decode(values({ 0xb3: 'fd' })), null, '0xFD is "undefined"');
  assert.equal(target.encode(80).toString('hex'), '32', 'clamped to 50 °C');
  const sensor = feature('0011', 'temperature');
  assert.equal(sensor.decode(values({ 0xe0: '00e1' })), 22.5);
  assert.equal(sensor.decode(values({ 0xe0: 'ff9c' })), -10);
  assert.equal(sensor.decode(values({ 0xe0: '7ffe' })), null);
});

test('smart meter: cumulative energy uses the coefficient and the unit', () => {
  const imported = feature('0288', 'input-index');
  assert.deepEqual(imported.reads, [0xe0, 0xe1, 0xd3]);
  assert.equal(imported.decode(values({ 0xe0: '00003039', 0xe1: '01', 0xd3: '00000001' })), 1234.5);
  assert.equal(imported.decode(values({ 0xe0: '00000064', 0xe1: '0a', 0xd3: '00000002' })), 2000);
  assert.equal(imported.decode(values({ 0xe0: '00000064' })), 100, 'kWh by default');
  assert.equal(imported.decode(values({ 0xe0: 'fffffffe' })), null);
  const power = feature('0288', 'grid-power');
  assert.equal(power.decode(values({ 0xe7: 'fffffc18' })), -1000, 'exporting');
  assert.equal(power.decode(values({ 0xe7: '7ffffffe' })), null);
});

test('storage battery splits the signed power into charge and discharge', () => {
  const charge = feature('027d', 'charge-power');
  const discharge = feature('027d', 'discharge-power');
  const discharging = values({ 0xd3: 'fffffe0c' });
  assert.equal(charge.decode(discharging), 0);
  assert.equal(discharge.decode(discharging), 500);
  const charging = values({ 0xd3: '000001f4' });
  assert.equal(charge.decode(charging), 500);
  assert.equal(discharge.decode(charging), 0);
});

test('shutters: open, close and stop map to the Gladys cover states', () => {
  const state = feature('0263', 'state');
  assert.equal(state.decode(values({ 0xe0: '41' })), 1);
  assert.equal(state.decode(values({ 0xe0: '42' })), -1);
  assert.equal(state.decode(values({ 0xe0: '43' })), 0);
  assert.equal(state.encode(1).toString('hex'), '41');
  assert.equal(state.encode(-1).toString('hex'), '42');
  assert.equal(state.encode(0).toString('hex'), '43');
});

test('an unknown class falls back to a power switch, the node profile is ignored', () => {
  const generic = getDeviceClass('03b7');
  assert.equal(generic.generic, true);
  assert.deepEqual(
    generic.features.map((f) => f.key),
    ['power'],
  );
  assert.equal(getDeviceClass('0ef0'), null);
  assert.equal(getDeviceClass('05ff'), null);
});

test('supportedFeatures keeps the features whose property the device can read', () => {
  const keys = (list) => list.map((f) => f.key);
  assert.deepEqual(keys(supportedFeatures('0130', [0x80, 0xb3])), ['power', 'target-temperature']);
  assert.equal(supportedFeatures('0130', []).length, DEVICE_CLASSES['0130'].features.length);
  assert.deepEqual(supportedFeatures('0ef0', [0x80]), []);
});

test('epcsToRead covers the helper properties of a computed value', () => {
  assert.deepEqual(
    epcsToRead(DEVICE_CLASSES['0288'].features).sort(),
    [0xd3, 0xe0, 0xe1, 0xe3, 0xe7],
  );
});
