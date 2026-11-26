// -----------------------------------------------------------------------------
// ECHONET Lite device classes supported by the integration, and how each of
// their properties maps to a Gladys feature.
//
// Reference: "APPENDIX Detailed Requirements for ECHONET Device objects"
// (ECHONET Consortium). A class is identified by its group code + class code
// (e.g. 0x0130 home air conditioner); a property by its EPC.
//
// Every feature definition:
//   key        stable feature key (part of the external id: never renamed)
//   name       feature name shown in Gladys
//   epc        the property that gates the feature: it must be in the Get
//              property map of the device (0x9F) for the feature to exist
//   reads      the EPCs to read to decode the value (default: [epc])
//   decode     (values: Map<epc, Buffer>) => number | null
//   setEpc     the property written by a command (writable only when it is in
//              the Set property map 0x9E of the device)
//   encode     (value: number) => Buffer
//   category, type, unit, min, max: the Gladys feature columns
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
} from '@gladysassistant/integration-sdk';
import { EPC } from './frame.js';

// --- Gladys value enums (server/utils/constants.js of Gladys) --------------
export const AC_MODE = { AUTO: 0, COOLING: 1, HEATING: 2, DRYING: 3, FAN: 4 };
export const AC_FAN_SPEED = { AUTO: 0, LOW: 1, LOW_MID: 2, MID: 3, MID_HIGH: 4, HIGH: 5 };
export const COVER_STATE = { STOP: 0, OPEN: 1, CLOSE: -1 };
export const WATER_HEATER_MODE = { OFF: 0, AUTO: 1, BOOST: 3 };

// --- Raw decoders -----------------------------------------------------------
const u8 = (b) => (b && b.length >= 1 ? b.readUInt8(0) : null);
const s8 = (b) => (b && b.length >= 1 ? b.readInt8(0) : null);
const u16 = (b) => (b && b.length >= 2 ? b.readUInt16BE(0) : null);
const s16 = (b) => (b && b.length >= 2 ? b.readInt16BE(0) : null);
const u32 = (b) => (b && b.length >= 4 ? b.readUInt32BE(0) : null);
const s32 = (b) => (b && b.length >= 4 ? b.readInt32BE(0) : null);
const byte = (value) => Buffer.from([value & 0xff]);

/** Swap the keys and values of a small lookup table. */
const invert = (table) =>
  Object.fromEntries(Object.entries(table).map(([key, value]) => [value, Number(key)]));

const round = (value, decimals = 3) => Math.round(value * 10 ** decimals) / 10 ** decimals;

// Operation status 0x80: 0x30 ON, 0x31 OFF.
const decodeOnOff = (values) => {
  const raw = u8(values.get(EPC.OPERATION_STATUS));
  if (raw === 0x30) return 1;
  if (raw === 0x31) return 0;
  return null;
};
const encodeOnOff = (value) => byte(Number(value) ? 0x30 : 0x31);

// "0x41 yes / 0x42 no" properties (heating status, motion detected...).
const decodeYesNo = (epc) => (values) => {
  const raw = u8(values.get(epc));
  if (raw === 0x41) return 1;
  if (raw === 0x42) return 0;
  return null;
};

// Cumulative energy unit (EPC 0xC2 of the distribution board, 0xE1 of the
// smart meter): multiplier to kWh.
const ENERGY_UNITS = {
  0x00: 1,
  0x01: 0.1,
  0x02: 0.01,
  0x03: 0.001,
  0x04: 0.0001,
  0x0a: 10,
  0x0b: 100,
  0x0c: 1000,
  0x0d: 10000,
};

/** Cumulative energy in kWh = raw x coefficient x unit; null when unknown. */
const cumulativeEnergy = (rawEpc, unitEpc, coefficientEpc) => (values) => {
  const raw = u32(values.get(rawEpc));
  if (raw === null || raw >= 0xfffffffe) return null;
  const unit = ENERGY_UNITS[u8(values.get(unitEpc)) ?? 0x00] ?? 1;
  const coefficient = coefficientEpc ? (u32(values.get(coefficientEpc)) ?? 1) : 1;
  return round(raw * coefficient * unit);
};

/** Signed 32-bit power in W; the overflow/underflow codes mean "no data". */
const signedPower = (epc) => (values) => {
  const raw = s32(values.get(epc));
  if (raw === null || raw === 0x7fffffff || raw === -0x80000000 || raw === 0x7ffffffe) return null;
  return raw;
};

// --- Feature factories ------------------------------------------------------
const power = (category, type) => ({
  key: 'power',
  name: 'Power',
  epc: EPC.OPERATION_STATUS,
  decode: decodeOnOff,
  setEpc: EPC.OPERATION_STATUS,
  encode: encodeOnOff,
  category,
  type,
  min: 0,
  max: 1,
});

const temperatureSensor = (key, name, epc, decode) => ({
  key,
  name,
  epc,
  decode,
  category: CAT.TEMPERATURE_SENSOR,
  type: TYPE.SENSOR.DECIMAL,
  unit: UNIT.CELSIUS,
  min: -50,
  max: 100,
});

// Signed 1-byte temperature: 0x7E (unmeasurable), 0x7F (overflow) and 0x80
// (underflow) carry no reading.
const signedTemperature = (epc) => (values) => {
  const raw = s8(values.get(epc));
  if (raw === null || raw === 0x7e || raw === 0x7f || raw === -0x80) return null;
  return raw;
};

// Unsigned 1-byte value with 0xFD ("undefined") and above meaning no data.
const unsignedLevel = (epc, max) => (values) => {
  const raw = u8(values.get(epc));
  if (raw === null || raw > max) return null;
  return raw;
};

// --- Home air conditioner (0x0130) -----------------------------------------
const AC_MODE_TO_ECHONET = {
  [AC_MODE.AUTO]: 0x41,
  [AC_MODE.COOLING]: 0x42,
  [AC_MODE.HEATING]: 0x43,
  [AC_MODE.DRYING]: 0x44,
  [AC_MODE.FAN]: 0x45,
};
const ECHONET_TO_AC_MODE = invert(AC_MODE_TO_ECHONET);

// ECHONET air flow rate: 0x41 auto, 0x31..0x38 levels 1 to 8.
const FAN_SPEED_TO_ECHONET = {
  [AC_FAN_SPEED.AUTO]: 0x41,
  [AC_FAN_SPEED.LOW]: 0x31,
  [AC_FAN_SPEED.LOW_MID]: 0x33,
  [AC_FAN_SPEED.MID]: 0x35,
  [AC_FAN_SPEED.MID_HIGH]: 0x36,
  [AC_FAN_SPEED.HIGH]: 0x38,
};
const ECHONET_TO_FAN_SPEED = {
  0x41: AC_FAN_SPEED.AUTO,
  0x31: AC_FAN_SPEED.LOW,
  0x32: AC_FAN_SPEED.LOW,
  0x33: AC_FAN_SPEED.LOW_MID,
  0x34: AC_FAN_SPEED.LOW_MID,
  0x35: AC_FAN_SPEED.MID,
  0x36: AC_FAN_SPEED.MID_HIGH,
  0x37: AC_FAN_SPEED.MID_HIGH,
  0x38: AC_FAN_SPEED.HIGH,
};

export const AC_EPC = {
  MODE: 0xb0,
  TARGET_TEMPERATURE: 0xb3,
  ROOM_HUMIDITY: 0xba,
  ROOM_TEMPERATURE: 0xbb,
  OUTDOOR_TEMPERATURE: 0xbe,
  FAN_SPEED: 0xa0,
};

export function encodeAcMode(mode) {
  const raw = AC_MODE_TO_ECHONET[Number(mode)];
  if (raw === undefined) throw new Error(`Unsupported air conditioner mode: ${mode}`);
  return byte(raw);
}

export function encodeFanSpeed(speed) {
  const raw = FAN_SPEED_TO_ECHONET[Number(speed)];
  if (raw === undefined) throw new Error(`Unsupported fan speed: ${speed}`);
  return byte(raw);
}

export function encodeTargetTemperature(value) {
  return byte(Math.max(0, Math.min(50, Math.round(Number(value)))));
}

const airConditioner = [
  power(CAT.AIR_CONDITIONING, TYPE.AIR_CONDITIONING.BINARY),
  {
    key: 'mode',
    name: 'Mode',
    epc: AC_EPC.MODE,
    decode: (values) => ECHONET_TO_AC_MODE[u8(values.get(AC_EPC.MODE))] ?? null,
    setEpc: AC_EPC.MODE,
    encode: encodeAcMode,
    category: CAT.AIR_CONDITIONING,
    type: TYPE.AIR_CONDITIONING.MODE,
    min: 0,
    max: 4,
  },
  {
    key: 'target-temperature',
    name: 'Target temperature',
    epc: AC_EPC.TARGET_TEMPERATURE,
    decode: unsignedLevel(AC_EPC.TARGET_TEMPERATURE, 50),
    setEpc: AC_EPC.TARGET_TEMPERATURE,
    encode: encodeTargetTemperature,
    category: CAT.AIR_CONDITIONING,
    type: TYPE.AIR_CONDITIONING.TARGET_TEMPERATURE,
    unit: UNIT.CELSIUS,
    min: 16,
    max: 32,
  },
  {
    key: 'fan-speed',
    name: 'Fan speed',
    epc: AC_EPC.FAN_SPEED,
    decode: (values) => ECHONET_TO_FAN_SPEED[u8(values.get(AC_EPC.FAN_SPEED))] ?? null,
    setEpc: AC_EPC.FAN_SPEED,
    encode: encodeFanSpeed,
    category: CAT.AIR_CONDITIONING,
    type: TYPE.AIR_CONDITIONING.FAN_SPEED,
    min: 0,
    max: 5,
  },
  temperatureSensor(
    'room-temperature',
    'Room temperature',
    AC_EPC.ROOM_TEMPERATURE,
    signedTemperature(AC_EPC.ROOM_TEMPERATURE),
  ),
  temperatureSensor(
    'outdoor-temperature',
    'Outdoor temperature',
    AC_EPC.OUTDOOR_TEMPERATURE,
    signedTemperature(AC_EPC.OUTDOOR_TEMPERATURE),
  ),
  {
    key: 'room-humidity',
    name: 'Room humidity',
    epc: AC_EPC.ROOM_HUMIDITY,
    decode: unsignedLevel(AC_EPC.ROOM_HUMIDITY, 100),
    category: CAT.HUMIDITY_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.PERCENT,
    min: 0,
    max: 100,
  },
];

// --- Lighting (0x0290 general, 0x0291 mono-functional) ---------------------
const BRIGHTNESS_EPC = 0xb0;
const lighting = [
  power(CAT.LIGHT, TYPE.LIGHT.BINARY),
  {
    key: 'brightness',
    name: 'Brightness',
    epc: BRIGHTNESS_EPC,
    decode: unsignedLevel(BRIGHTNESS_EPC, 100),
    setEpc: BRIGHTNESS_EPC,
    encode: (value) => byte(Math.max(0, Math.min(100, Math.round(Number(value))))),
    category: CAT.LIGHT,
    type: TYPE.LIGHT.BRIGHTNESS,
    unit: UNIT.PERCENT,
    min: 0,
    max: 100,
  },
];

// --- Blinds and shutters (0x0260, 0x0263) ----------------------------------
const OPEN_CLOSE_EPC = 0xe0;
const OPENING_LEVEL_EPC = 0xe1;
const COVER_TO_ECHONET = {
  [COVER_STATE.OPEN]: 0x41,
  [COVER_STATE.CLOSE]: 0x42,
  [COVER_STATE.STOP]: 0x43,
};
const cover = (category) => [
  {
    key: 'state',
    name: 'Open / close',
    epc: OPEN_CLOSE_EPC,
    decode: (values) => invert(COVER_TO_ECHONET)[u8(values.get(OPEN_CLOSE_EPC))] ?? null,
    setEpc: OPEN_CLOSE_EPC,
    encode: (value) => {
      const raw = COVER_TO_ECHONET[Math.sign(Number(value))];
      return byte(raw);
    },
    category,
    type: TYPE.SHUTTER.STATE,
    min: -1,
    max: 1,
  },
  {
    key: 'position',
    name: 'Position',
    epc: OPENING_LEVEL_EPC,
    decode: unsignedLevel(OPENING_LEVEL_EPC, 100),
    setEpc: OPENING_LEVEL_EPC,
    encode: (value) => byte(Math.max(0, Math.min(100, Math.round(Number(value))))),
    category,
    type: TYPE.SHUTTER.POSITION,
    unit: UNIT.PERCENT,
    min: 0,
    max: 100,
  },
];

// --- Electric lock (0x026F) -------------------------------------------------
const LOCK_EPC = 0xe0;
const electricLock = [
  {
    key: 'lock',
    name: 'Lock',
    epc: LOCK_EPC,
    decode: decodeYesNo(LOCK_EPC),
    setEpc: LOCK_EPC,
    encode: (value) => byte(Number(value) ? 0x41 : 0x42),
    category: CAT.LOCK,
    type: TYPE.LOCK.BINARY,
    min: 0,
    max: 1,
  },
];

// --- Electric water heater / EcoCute (0x026B) -------------------------------
const WH_EPC = {
  AUTO_SETTING: 0xb0,
  HEATING_STATUS: 0xb2,
  SUPPLY_TEMPERATURE: 0xd1,
  REMAINING_WATER: 0xe1,
};
const WATER_HEATER_TO_ECHONET = {
  [WATER_HEATER_MODE.AUTO]: 0x41,
  [WATER_HEATER_MODE.BOOST]: 0x42,
  [WATER_HEATER_MODE.OFF]: 0x43,
};
const waterHeaterTarget = (epc) => ({
  key: 'target-temperature',
  name: 'Hot water temperature',
  epc,
  decode: unsignedLevel(epc, 100),
  setEpc: epc,
  encode: (value) => byte(Math.max(0, Math.min(100, Math.round(Number(value))))),
  category: CAT.WATER_HEATER,
  type: TYPE.WATER_HEATER.TARGET_TEMPERATURE,
  unit: UNIT.CELSIUS,
  min: 30,
  max: 75,
});
const heatingStatus = (epc) => ({
  key: 'heating',
  name: 'Heating',
  epc,
  decode: decodeYesNo(epc),
  category: CAT.WATER_HEATER,
  type: TYPE.WATER_HEATER.HEATING,
  min: 0,
  max: 1,
});
const electricWaterHeater = [
  power(CAT.WATER_HEATER, TYPE.WATER_HEATER.BINARY),
  {
    key: 'mode',
    name: 'Heating mode',
    epc: WH_EPC.AUTO_SETTING,
    decode: (values) =>
      invert(WATER_HEATER_TO_ECHONET)[u8(values.get(WH_EPC.AUTO_SETTING))] ?? null,
    setEpc: WH_EPC.AUTO_SETTING,
    encode: (value) => {
      const raw = WATER_HEATER_TO_ECHONET[Number(value)];
      if (raw === undefined) throw new Error(`Unsupported water heater mode: ${value}`);
      return byte(raw);
    },
    category: CAT.WATER_HEATER,
    type: TYPE.WATER_HEATER.MODE,
    min: 0,
    max: 6,
  },
  heatingStatus(WH_EPC.HEATING_STATUS),
  waterHeaterTarget(WH_EPC.SUPPLY_TEMPERATURE),
  {
    key: 'remaining-hot-water',
    name: 'Remaining hot water',
    epc: WH_EPC.REMAINING_WATER,
    decode: (values) => u16(values.get(WH_EPC.REMAINING_WATER)),
    category: CAT.WATER_HEATER,
    type: TYPE.WATER_HEATER.REMAINING_HOT_WATER,
    unit: UNIT.LITER,
    min: 0,
    max: 1000,
  },
];

// --- Instantaneous (gas) water heater (0x0272) ------------------------------
const instantaneousWaterHeater = [
  power(CAT.WATER_HEATER, TYPE.WATER_HEATER.BINARY),
  heatingStatus(0xd0),
  waterHeaterTarget(0xd1),
];

// --- Floor heater (0x027B) --------------------------------------------------
const FLOOR_TEMPERATURE_EPC = 0xe0;
const floorHeater = [
  power(CAT.SWITCH, TYPE.SWITCH.BINARY),
  {
    key: 'target-temperature',
    name: 'Target temperature',
    epc: FLOOR_TEMPERATURE_EPC,
    decode: unsignedLevel(FLOOR_TEMPERATURE_EPC, 50),
    setEpc: FLOOR_TEMPERATURE_EPC,
    encode: encodeTargetTemperature,
    category: CAT.THERMOSTAT,
    type: TYPE.THERMOSTAT.TARGET_TEMPERATURE,
    unit: UNIT.CELSIUS,
    min: 10,
    max: 40,
  },
];

// --- Household solar power generation (0x0279) -----------------------------
const solar = [
  {
    key: 'production-power',
    name: 'Production power',
    epc: 0xe0,
    decode: (values) => u16(values.get(0xe0)),
    category: CAT.ENERGY_PRODUCTION_SENSOR,
    type: TYPE.ENERGY_PRODUCTION_SENSOR.POWER,
    unit: UNIT.WATT,
    min: 0,
    max: 65533,
  },
  {
    key: 'production-index',
    name: 'Production index',
    epc: 0xe1,
    decode: (values) => {
      const raw = u32(values.get(0xe1));
      return raw === null || raw >= 0xfffffffe ? null : round(raw * 0.001);
    },
    category: CAT.ENERGY_PRODUCTION_SENSOR,
    type: TYPE.ENERGY_PRODUCTION_SENSOR.INDEX,
    unit: UNIT.KILOWATT_HOUR,
    min: 0,
    max: 1000000,
  },
];

// --- Storage battery (0x027D) ------------------------------------------------
const BATTERY_EPC = { LEVEL: 0xe4, CHARGE_DISCHARGE_POWER: 0xd3 };
const chargeDischarge = (sign) => (values) => {
  const raw = signedPower(BATTERY_EPC.CHARGE_DISCHARGE_POWER)(values);
  return raw === null ? null : Math.max(0, sign * raw);
};
const storageBattery = [
  {
    key: 'battery-level',
    name: 'Battery level',
    epc: BATTERY_EPC.LEVEL,
    decode: unsignedLevel(BATTERY_EPC.LEVEL, 100),
    category: CAT.BATTERY_STORAGE,
    type: TYPE.BATTERY_STORAGE.BATTERY_LEVEL,
    unit: UNIT.PERCENT,
    min: 0,
    max: 100,
  },
  {
    key: 'charge-power',
    name: 'Charge power',
    epc: BATTERY_EPC.CHARGE_DISCHARGE_POWER,
    decode: chargeDischarge(1),
    category: CAT.BATTERY_STORAGE,
    type: TYPE.BATTERY_STORAGE.CHARGE_POWER,
    unit: UNIT.WATT,
    min: 0,
    max: 100000,
  },
  {
    key: 'discharge-power',
    name: 'Discharge power',
    epc: BATTERY_EPC.CHARGE_DISCHARGE_POWER,
    decode: chargeDischarge(-1),
    category: CAT.BATTERY_STORAGE,
    type: TYPE.BATTERY_STORAGE.DISCHARGE_POWER,
    unit: UNIT.WATT,
    min: 0,
    max: 100000,
  },
];

// --- Power distribution board metering (0x0287) ----------------------------
const distributionBoard = [
  {
    key: 'power',
    name: 'Instantaneous power',
    epc: 0xc6,
    decode: signedPower(0xc6),
    category: CAT.ENERGY_SENSOR,
    type: TYPE.ENERGY_SENSOR.POWER,
    unit: UNIT.WATT,
    min: -100000,
    max: 100000,
  },
  {
    key: 'index',
    name: 'Energy index',
    epc: 0xc0,
    reads: [0xc0, 0xc2],
    decode: cumulativeEnergy(0xc0, 0xc2),
    category: CAT.ENERGY_SENSOR,
    type: TYPE.ENERGY_SENSOR.INDEX,
    unit: UNIT.KILOWATT_HOUR,
    min: 0,
    max: 10000000,
  },
];

// --- Low-voltage smart electric energy meter (0x0288) ----------------------
const smartMeter = [
  {
    key: 'grid-power',
    name: 'Grid power',
    epc: 0xe7,
    decode: signedPower(0xe7),
    category: CAT.GRID_SENSOR,
    type: TYPE.GRID_SENSOR.POWER,
    unit: UNIT.WATT,
    min: -100000,
    max: 100000,
  },
  {
    key: 'input-index',
    name: 'Imported energy',
    epc: 0xe0,
    reads: [0xe0, 0xe1, 0xd3],
    decode: cumulativeEnergy(0xe0, 0xe1, 0xd3),
    category: CAT.GRID_SENSOR,
    type: TYPE.GRID_SENSOR.INPUT_INDEX,
    unit: UNIT.KILOWATT_HOUR,
    min: 0,
    max: 10000000,
  },
  {
    key: 'output-index',
    name: 'Exported energy',
    epc: 0xe3,
    reads: [0xe3, 0xe1, 0xd3],
    decode: cumulativeEnergy(0xe3, 0xe1, 0xd3),
    category: CAT.GRID_SENSOR,
    type: TYPE.GRID_SENSOR.OUTPUT_INDEX,
    unit: UNIT.KILOWATT_HOUR,
    min: 0,
    max: 10000000,
  },
];

// --- Sensors ----------------------------------------------------------------
const MEASURED_VALUE_EPC = 0xe0;
const temperatureSensorClass = [
  temperatureSensor('temperature', 'Temperature', MEASURED_VALUE_EPC, (values) => {
    const raw = s16(values.get(MEASURED_VALUE_EPC));
    // 0x7FFE unmeasurable, 0x7FFF overflow, 0x8000 underflow.
    if (raw === null || raw >= 0x7ffe || raw === -0x8000) return null;
    return round(raw / 10, 1);
  }),
];
const humiditySensorClass = [
  {
    key: 'humidity',
    name: 'Humidity',
    epc: MEASURED_VALUE_EPC,
    decode: unsignedLevel(MEASURED_VALUE_EPC, 100),
    category: CAT.HUMIDITY_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.PERCENT,
    min: 0,
    max: 100,
  },
];
export const MOTION_EPC = 0xb1;
const humanDetectionSensor = [
  {
    key: 'motion',
    name: 'Motion',
    epc: MOTION_EPC,
    decode: decodeYesNo(MOTION_EPC),
    category: CAT.MOTION_SENSOR,
    type: TYPE.SENSOR.BINARY,
    min: 0,
    max: 1,
  },
];

const simplePower = [power(CAT.SWITCH, TYPE.SWITCH.BINARY)];

// --- The catalog --------------------------------------------------------------
// `name` is shown in the Gladys UI (device name), `fast` asks for a 10-second
// poll (the motion sensor: its multicast notifications never reach the
// container).
export const DEVICE_CLASSES = {
  '0007': {
    name: {
      en: 'Human detection sensor',
      fr: 'Détecteur de présence',
      de: 'Anwesenheitssensor',
      es: 'Sensor de presencia',
    },
    features: humanDetectionSensor,
    fast: true,
  },
  '0011': {
    name: {
      en: 'Temperature sensor',
      fr: 'Capteur de température',
      de: 'Temperatursensor',
      es: 'Sensor de temperatura',
    },
    features: temperatureSensorClass,
  },
  '0012': {
    name: {
      en: 'Humidity sensor',
      fr: "Capteur d'humidité",
      de: 'Feuchtigkeitssensor',
      es: 'Sensor de humedad',
    },
    features: humiditySensorClass,
  },
  '0130': {
    name: {
      en: 'Air conditioner',
      fr: 'Climatiseur',
      de: 'Klimaanlage',
      es: 'Aire acondicionado',
    },
    features: airConditioner,
  },
  '0133': {
    name: {
      en: 'Ventilation fan',
      fr: 'Ventilateur',
      de: 'Lüfter',
      es: 'Ventilador',
    },
    features: simplePower,
  },
  '0135': {
    name: {
      en: 'Air cleaner',
      fr: "Purificateur d'air",
      de: 'Luftreiniger',
      es: 'Purificador de aire',
    },
    features: simplePower,
  },
  '0260': {
    name: {
      en: 'Electric blind',
      fr: 'Store électrique',
      de: 'Elektrische Jalousie',
      es: 'Persiana eléctrica',
    },
    features: cover(CAT.CURTAIN),
  },
  '0263': {
    name: {
      en: 'Electric shutter',
      fr: 'Volet roulant électrique',
      de: 'Elektrischer Rollladen',
      es: 'Persiana enrollable eléctrica',
    },
    features: cover(CAT.SHUTTER),
  },
  '026b': {
    name: {
      en: 'Electric water heater',
      fr: 'Chauffe-eau électrique',
      de: 'Elektrischer Warmwasserbereiter',
      es: 'Calentador de agua eléctrico',
    },
    features: electricWaterHeater,
  },
  '026f': {
    name: {
      en: 'Electric lock',
      fr: 'Serrure électrique',
      de: 'Elektrisches Schloss',
      es: 'Cerradura eléctrica',
    },
    features: electricLock,
  },
  '0272': {
    name: {
      en: 'Instantaneous water heater',
      fr: 'Chauffe-eau instantané',
      de: 'Durchlauferhitzer',
      es: 'Calentador de agua instantáneo',
    },
    features: instantaneousWaterHeater,
  },
  '0279': {
    name: {
      en: 'Solar power generation',
      fr: 'Production solaire',
      de: 'Solarstromerzeugung',
      es: 'Generación solar',
    },
    features: solar,
  },
  '027b': {
    name: {
      en: 'Floor heater',
      fr: 'Plancher chauffant',
      de: 'Fußbodenheizung',
      es: 'Suelo radiante',
    },
    features: floorHeater,
  },
  '027d': {
    name: {
      en: 'Storage battery',
      fr: 'Batterie de stockage',
      de: 'Batteriespeicher',
      es: 'Batería de almacenamiento',
    },
    features: storageBattery,
  },
  '0287': {
    name: {
      en: 'Distribution board meter',
      fr: 'Compteur du tableau électrique',
      de: 'Verteilerzähler',
      es: 'Medidor del cuadro eléctrico',
    },
    features: distributionBoard,
  },
  '0288': {
    name: {
      en: 'Smart electricity meter',
      fr: 'Compteur électrique communicant',
      de: 'Intelligenter Stromzähler',
      es: 'Contador eléctrico inteligente',
    },
    features: smartMeter,
  },
  '0290': {
    name: {
      en: 'Light',
      fr: 'Éclairage',
      de: 'Beleuchtung',
      es: 'Iluminación',
    },
    features: lighting,
  },
  '0291': {
    name: {
      en: 'Single-function light',
      fr: 'Éclairage simple',
      de: 'Einfache Beleuchtung',
      es: 'Iluminación simple',
    },
    features: lighting,
  },
  '05fd': {
    name: {
      en: 'Switch',
      fr: 'Interrupteur',
      de: 'Schalter',
      es: 'Interruptor',
    },
    features: simplePower,
  },
};

// Classes that are never published as Gladys devices: the node profile and
// the controllers (the integration itself is a controller).
const IGNORED_CLASSES = new Set(['0ef0', '05ff']);

/**
 * The catalog entry of a class, or a generic "power only" entry for a class
 * the integration does not know in detail. Returns null for an ignored class.
 * @param {string} classCode - 4 hex characters, e.g. "0130"
 */
export function getDeviceClass(classCode) {
  const code = classCode.toLowerCase();
  if (IGNORED_CLASSES.has(code)) {
    return null;
  }
  return (
    DEVICE_CLASSES[code] ?? {
      name: {
        en: `ECHONET device 0x${code}`,
        fr: `Appareil ECHONET 0x${code}`,
        de: `ECHONET-Gerät 0x${code}`,
        es: `Dispositivo ECHONET 0x${code}`,
      },
      features: simplePower,
      generic: true,
    }
  );
}

/**
 * The features a device really has: those whose gating EPC is in its Get
 * property map (all of them when the map is unknown).
 * @param {string} classCode
 * @param {number[]|null} getMap
 */
export function supportedFeatures(classCode, getMap) {
  const deviceClass = getDeviceClass(classCode);
  if (!deviceClass) {
    return [];
  }
  if (!getMap || getMap.length === 0) {
    return deviceClass.features;
  }
  return deviceClass.features.filter((feature) => getMap.includes(feature.epc));
}

/** Every EPC to read to decode a list of features. */
export function epcsToRead(features) {
  return [...new Set(features.flatMap((feature) => feature.reads ?? [feature.epc]))];
}
