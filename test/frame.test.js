import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESV,
  classOf,
  decodeFrame,
  decodeInstanceList,
  decodePropertyMap,
  encodeFrame,
  encodePropertyMap,
  instanceOf,
  normalizeEoj,
  parseEpc,
  parseHex,
} from '../src/echonet/frame.js';

test('a Get frame is encoded byte for byte like the specification', () => {
  const frame = encodeFrame({
    tid: 0x0102,
    seoj: '05ff01',
    deoj: '013001',
    esv: ESV.GET,
    properties: [{ epc: 0x80 }, { epc: 0xb3 }],
  });
  assert.equal(
    frame.toString('hex'),
    '1081' + '0102' + '05ff01' + '013001' + '62' + '02' + '8000b300',
  );
});

test('decodeFrame reads back what encodeFrame wrote', () => {
  const encoded = encodeFrame({
    tid: 65535,
    seoj: '013001',
    deoj: '05ff01',
    esv: ESV.GET_RES,
    properties: [
      { epc: 0x80, edt: Buffer.from([0x30]) },
      { epc: 0xe7, edt: Buffer.from([0, 0, 3, 0xe8]) },
    ],
  });
  const decoded = decodeFrame(encoded);
  assert.equal(decoded.tid, 65535);
  assert.equal(decoded.seoj, '013001');
  assert.equal(decoded.deoj, '05ff01');
  assert.equal(decoded.esv, ESV.GET_RES);
  assert.deepEqual(
    decoded.properties.map(({ epc, edt }) => [epc, edt.toString('hex')]),
    [
      [0x80, '30'],
      [0xe7, '000003e8'],
    ],
  );
});

test('decodeFrame rejects what is not a well-formed ECHONET Lite frame', () => {
  assert.throws(() => decodeFrame(Buffer.from('1081', 'hex')), /too short/);
  assert.throws(() => decodeFrame(Buffer.from('108200010ef0010ef00162018000', 'hex')), /format 1/);
  // OPC says 2 properties, only one is there.
  assert.throws(() => decodeFrame(Buffer.from('108100010ef00105ff0172028001', 'hex')), /Truncated/);
});

test('property maps below 16 entries are lists', () => {
  const edt = Buffer.from([3, 0x80, 0xb0, 0xb3]);
  assert.deepEqual(decodePropertyMap(edt), [0x80, 0xb0, 0xb3]);
  assert.deepEqual(encodePropertyMap([0xb3, 0x80, 0xb0]), edt);
});

test('property maps from 16 entries are bitmaps', () => {
  const epcs = [
    0x80, 0x81, 0x82, 0x83, 0x88, 0x8a, 0x8c, 0x8d, 0x9d, 0x9e, 0x9f, 0xa0, 0xb0, 0xb3, 0xba, 0xbb,
    0xbe, 0xff,
  ];
  const encoded = encodePropertyMap(epcs);
  assert.equal(encoded.length, 17);
  assert.equal(encoded[0], epcs.length);
  assert.deepEqual(decodePropertyMap(encoded), epcs);
  // Spot check of the layout: bit j of byte i is EPC 0x80 + i + 0x10 * j.
  assert.ok(encoded[1 + 0x00] & (1 << 0), '0x80');
  assert.ok(encoded[1 + 0x0f] & (1 << 7), '0xff');
});

test('decodeInstanceList returns the hosted device objects', () => {
  const edt = Buffer.from('02013001028801', 'hex');
  assert.deepEqual(decodeInstanceList(edt), ['013001', '028801']);
  assert.deepEqual(decodeInstanceList(undefined), []);
});

test('EOJ helpers normalize, split class and instance', () => {
  assert.equal(normalizeEoj('0x01300A'), '01300a');
  assert.equal(normalizeEoj(Buffer.from([0x02, 0x88, 0x01])), '028801');
  assert.throws(() => normalizeEoj('0130'), /Invalid ECHONET object/);
  assert.equal(classOf('013002'), '0130');
  assert.equal(instanceOf('013002'), 2);
});

test('parseHex and parseEpc accept what a user types and refuse the rest', () => {
  assert.deepEqual(parseHex('0x30'), Buffer.from([0x30]));
  assert.deepEqual(parseHex('00 00 03 e8'), Buffer.from([0, 0, 3, 0xe8]));
  assert.throws(() => parseHex('3'), /Invalid hexadecimal/);
  assert.throws(() => parseHex('zz'), /Invalid hexadecimal/);
  assert.equal(parseEpc('B3'), 0xb3);
  assert.throws(() => parseEpc('30'), /Invalid EPC/);
  assert.throws(() => parseEpc('8080'), /Invalid EPC/);
});
