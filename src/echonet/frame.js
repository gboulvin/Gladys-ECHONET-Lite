// -----------------------------------------------------------------------------
// ECHONET Lite frames (specification "ECHONET Lite", part II, chapter 3).
//
// One UDP datagram, port 3610, format 1 (specified message format):
//
//   EHD1 EHD2 TID(2) SEOJ(3) DEOJ(3) ESV OPC [EPC PDC EDT(PDC)] * OPC
//   0x10 0x81
//
// This module is pure: it encodes and decodes buffers, it never touches the
// network, so the whole protocol is unit-tested without a device.
// -----------------------------------------------------------------------------

export const ECHONET_PORT = 3610;
export const ECHONET_MULTICAST_ADDRESS = '224.0.23.0';

const EHD1 = 0x10;
const EHD2_FORMAT_1 = 0x81;
const HEADER_LENGTH = 12;

// ECHONET Lite service codes (ESV).
export const ESV = {
  SETI_SNA: 0x50, // SetI not available
  SETC_SNA: 0x51, // SetC not available
  GET_SNA: 0x52, // Get not available (partial answer: unsupported EPC with PDC 0)
  INF_SNA: 0x53,
  SETGET_SNA: 0x5e,
  SETI: 0x60, // set, no answer expected
  SETC: 0x61, // set, answer expected
  GET: 0x62,
  INF_REQ: 0x63,
  SETGET: 0x6e,
  SET_RES: 0x71,
  GET_RES: 0x72,
  INF: 0x73, // spontaneous notification
  INFC: 0x74, // notification asking for a confirmation
  INFC_RES: 0x7a,
  SETGET_RES: 0x7e,
};

// The answers a request waits for, success or "not available" alike.
export const RESPONSES_OF = {
  [ESV.GET]: [ESV.GET_RES, ESV.GET_SNA],
  [ESV.SETC]: [ESV.SET_RES, ESV.SETC_SNA],
  [ESV.INF_REQ]: [ESV.INF, ESV.INF_SNA],
};

// Well-known objects.
export const NODE_PROFILE_EOJ = '0ef001';
export const CONTROLLER_EOJ = '05ff01';

// Common properties of every device object (APPENDIX "Device objects", 2.x).
export const EPC = {
  OPERATION_STATUS: 0x80,
  INSTALLATION_LOCATION: 0x81,
  IDENTIFICATION_NUMBER: 0x83,
  FAULT_STATUS: 0x88,
  MANUFACTURER_CODE: 0x8a,
  PRODUCT_CODE: 0x8c,
  SERIAL_NUMBER: 0x8d,
  STATUS_CHANGE_ANNOUNCEMENT_MAP: 0x9d,
  SET_PROPERTY_MAP: 0x9e,
  GET_PROPERTY_MAP: 0x9f,
  // Node profile only.
  SELF_NODE_INSTANCE_LIST_S: 0xd6,
};

/**
 * Normalize an ECHONET object (EOJ) to its 6-character lowercase hex form.
 * Accepts a hex string ("013001", "0x013001") or a 3-byte buffer.
 * @param {string|Buffer} eoj
 * @returns {string}
 */
export function normalizeEoj(eoj) {
  const hex = Buffer.isBuffer(eoj) ? eoj.toString('hex') : String(eoj).replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`Invalid ECHONET object: ${eoj}`);
  }
  return hex.toLowerCase();
}

/**
 * Class of an EOJ (group code + class code), e.g. "0130" for "013001".
 * @param {string} eoj
 */
export function classOf(eoj) {
  return normalizeEoj(eoj).slice(0, 4);
}

/**
 * Instance number of an EOJ, e.g. 1 for "013001".
 * @param {string} eoj
 */
export function instanceOf(eoj) {
  return parseInt(normalizeEoj(eoj).slice(4, 6), 16);
}

/**
 * Encode a frame.
 * @param {object} frame
 * @param {number} frame.tid - transaction id, 0..65535
 * @param {string} frame.seoj - source object
 * @param {string} frame.deoj - destination object
 * @param {number} frame.esv - service code
 * @param {Array<{epc: number, edt?: Buffer}>} frame.properties
 * @returns {Buffer}
 */
export function encodeFrame({ tid, seoj, deoj, esv, properties = [] }) {
  if (properties.length > 255) {
    throw new Error('An ECHONET Lite frame carries at most 255 properties');
  }
  const header = Buffer.alloc(HEADER_LENGTH);
  header[0] = EHD1;
  header[1] = EHD2_FORMAT_1;
  header.writeUInt16BE(tid & 0xffff, 2);
  Buffer.from(normalizeEoj(seoj), 'hex').copy(header, 4);
  Buffer.from(normalizeEoj(deoj), 'hex').copy(header, 7);
  header[10] = esv;
  header[11] = properties.length;
  const chunks = [header];
  for (const { epc, edt } of properties) {
    const data = edt ?? Buffer.alloc(0);
    if (data.length > 255) {
      throw new Error(`EDT of EPC 0x${epc.toString(16)} is longer than 255 bytes`);
    }
    chunks.push(Buffer.from([epc, data.length]), data);
  }
  return Buffer.concat(chunks);
}

/**
 * Decode a frame. Throws on anything that is not a well-formed ECHONET Lite
 * format 1 message: the caller drops it.
 * @param {Buffer} buffer
 * @returns {{tid: number, seoj: string, deoj: string, esv: number,
 *   properties: Array<{epc: number, edt: Buffer}>}}
 */
export function decodeFrame(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < HEADER_LENGTH) {
    throw new Error('Frame too short');
  }
  if (buffer[0] !== EHD1 || buffer[1] !== EHD2_FORMAT_1) {
    throw new Error('Not an ECHONET Lite format 1 frame');
  }
  const opc = buffer[11];
  const properties = [];
  let offset = HEADER_LENGTH;
  for (let i = 0; i < opc; i += 1) {
    if (offset + 2 > buffer.length) {
      throw new Error('Truncated property header');
    }
    const epc = buffer[offset];
    const pdc = buffer[offset + 1];
    offset += 2;
    if (offset + pdc > buffer.length) {
      throw new Error(`Truncated EDT for EPC 0x${epc.toString(16)}`);
    }
    properties.push({ epc, edt: buffer.subarray(offset, offset + pdc) });
    offset += pdc;
  }
  return {
    tid: buffer.readUInt16BE(2),
    seoj: buffer.subarray(4, 7).toString('hex'),
    deoj: buffer.subarray(7, 10).toString('hex'),
    esv: buffer[10],
    properties,
  };
}

/**
 * Decode a property map (0x9D, 0x9E, 0x9F). Below 16 properties the EDT lists
 * them; from 16 on it is a 16-byte bitmap where bit j of byte i stands for
 * EPC 0x80 + i + 0x10 * j.
 * @param {Buffer} edt
 * @returns {number[]} sorted EPCs
 */
export function decodePropertyMap(edt) {
  if (!edt || edt.length === 0) {
    return [];
  }
  const count = edt[0];
  const epcs = [];
  if (count < 16) {
    for (let i = 1; i <= count && i < edt.length; i += 1) {
      epcs.push(edt[i]);
    }
  } else {
    for (let i = 0; i < 16 && i + 1 < edt.length; i += 1) {
      for (let j = 0; j < 8; j += 1) {
        if (edt[i + 1] & (1 << j)) {
          epcs.push(0x80 + i + 0x10 * j);
        }
      }
    }
  }
  return [...new Set(epcs)].sort((a, b) => a - b);
}

/**
 * Encode a property map, the inverse of decodePropertyMap (used by the tests
 * and the device simulator).
 * @param {number[]} epcs
 * @returns {Buffer}
 */
export function encodePropertyMap(epcs) {
  const unique = [...new Set(epcs)].sort((a, b) => a - b);
  if (unique.length < 16) {
    return Buffer.from([unique.length, ...unique]);
  }
  const bitmap = Buffer.alloc(17);
  bitmap[0] = unique.length;
  for (const epc of unique) {
    const i = (epc - 0x80) & 0x0f;
    const j = (epc - 0x80) >> 4;
    bitmap[i + 1] |= 1 << j;
  }
  return bitmap;
}

/**
 * Decode the self-node instance list S (node profile EPC 0xD6): the device
 * objects a node hosts. First byte: count; then 3 bytes per object.
 * @param {Buffer} edt
 * @returns {string[]} EOJs
 */
export function decodeInstanceList(edt) {
  if (!edt || edt.length === 0) {
    return [];
  }
  const count = edt[0];
  const eojs = [];
  for (let i = 0; i < count && 1 + i * 3 + 3 <= edt.length; i += 1) {
    eojs.push(edt.subarray(1 + i * 3, 4 + i * 3).toString('hex'));
  }
  return eojs;
}

/** Parse a hex string typed by a user ("30", "0x30", "30 31") into bytes. */
export function parseHex(text) {
  const clean = String(text ?? '')
    .trim()
    .replace(/^0x/i, '')
    .replace(/[\s:-]/g, '');
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`Invalid hexadecimal value: "${text}"`);
  }
  return Buffer.from(clean, 'hex');
}

/** Parse a single EPC typed by a user ("80", "0x80") into a number. */
export function parseEpc(text) {
  const bytes = parseHex(text);
  if (bytes.length !== 1 || bytes[0] < 0x80) {
    throw new Error(`Invalid EPC: "${text}" (expected one byte from 80 to FF)`);
  }
  return bytes[0];
}
