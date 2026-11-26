// -----------------------------------------------------------------------------
// In-memory ECHONET Lite network for the tests: a fake UDP socket factory
// (plugged into EchonetClient) answering like real nodes would. Tests never
// touch the network.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import {
  ECHONET_PORT,
  EPC,
  ESV,
  NODE_PROFILE_EOJ,
  decodeFrame,
  encodeFrame,
  encodePropertyMap,
} from '../../src/echonet/frame.js';

const hex = (text) => Buffer.from(text.replace(/\s/g, ''), 'hex');

/**
 * Build one simulated node.
 * @param {object} options
 * @param {string} [options.uid] - identification number (32 hex chars, without FE)
 * @param {string} [options.manufacturer] - 3-byte code, hex
 * @param {Record<string, {props: Record<number, string>, settable?: number[], product?: string}>} options.objects
 */
export function createNode({ uid, manufacturer = '000008', objects }) {
  const eojs = Object.keys(objects);
  const profile = new Map([
    [
      EPC.SELF_NODE_INSTANCE_LIST_S,
      Buffer.concat([Buffer.from([eojs.length]), ...eojs.map((eoj) => hex(eoj))]),
    ],
    [EPC.MANUFACTURER_CODE, hex(manufacturer)],
  ]);
  if (uid) {
    profile.set(EPC.IDENTIFICATION_NUMBER, Buffer.concat([Buffer.from([0xfe]), hex(uid)]));
  }
  const node = { objects: new Map([[NODE_PROFILE_EOJ, { props: profile, settable: [] }]]) };
  for (const [eoj, { props, settable = [], product }] of Object.entries(objects)) {
    const values = new Map(Object.entries(props).map(([epc, value]) => [Number(epc), hex(value)]));
    values.set(EPC.MANUFACTURER_CODE, hex(manufacturer));
    if (product) {
      values.set(EPC.PRODUCT_CODE, Buffer.from(product.padEnd(12, ' '), 'latin1'));
    }
    values.set(EPC.SET_PROPERTY_MAP, encodePropertyMap(settable));
    values.set(
      EPC.GET_PROPERTY_MAP,
      encodePropertyMap([...values.keys(), EPC.GET_PROPERTY_MAP, EPC.SET_PROPERTY_MAP]),
    );
    node.objects.set(eoj, { props: values, settable });
  }
  return node;
}

/** Answer one request frame like a node does, or null (unknown object). */
function answer(node, request) {
  const object = node.objects.get(request.deoj);
  if (!object) {
    return null;
  }
  const reply = { tid: request.tid, seoj: request.deoj, deoj: request.seoj };
  if (request.esv === ESV.GET) {
    let complete = true;
    const properties = request.properties.map(({ epc }) => {
      const edt = object.props.get(epc);
      if (!edt) complete = false;
      return { epc, edt: edt ?? Buffer.alloc(0) };
    });
    return { ...reply, esv: complete ? ESV.GET_RES : ESV.GET_SNA, properties };
  }
  if (request.esv === ESV.SETC) {
    let complete = true;
    const properties = request.properties.map(({ epc, edt }) => {
      if (object.settable.includes(epc)) {
        object.props.set(epc, Buffer.from(edt));
        return { epc, edt: Buffer.alloc(0) };
      }
      complete = false;
      return { epc, edt };
    });
    return { ...reply, esv: complete ? ESV.SET_RES : ESV.SETC_SNA, properties };
  }
  return null;
}

/**
 * A simulated network: `nodes` maps an IP to a node (createNode). A node with
 * `silent: true` never answers.
 */
export function createNetwork(nodes = {}) {
  const sent = [];
  const sockets = [];
  return {
    nodes,
    sent,
    sockets,
    createSocket() {
      const socket = new EventEmitter();
      socket.bind = (port, callback) => {
        socket.port = port;
        setImmediate(callback);
      };
      socket.send = (datagram, port, ip, callback) => {
        sent.push({ ip, port, datagram });
        setImmediate(() => callback?.(null));
        const node = nodes[ip];
        if (!node || node.silent || port !== ECHONET_PORT) {
          return;
        }
        const reply = answer(node, decodeFrame(datagram));
        if (reply) {
          setImmediate(() =>
            socket.emit('message', encodeFrame(reply), { address: ip, port: ECHONET_PORT }),
          );
        }
      };
      socket.close = () => {};
      sockets.push(socket);
      return socket;
    },
    /** Push a spontaneous INF from a node object to every socket. */
    notify(ip, eoj, properties) {
      const frame = encodeFrame({
        tid: 0,
        seoj: eoj,
        deoj: '05ff01',
        esv: ESV.INF,
        properties: Object.entries(properties).map(([epc, value]) => ({
          epc: Number(epc),
          edt: hex(value),
        })),
      });
      for (const socket of sockets) {
        socket.emit('message', frame, { address: ip, port: ECHONET_PORT });
      }
    },
  };
}

// --- Ready-made nodes ---------------------------------------------------------

export const AIR_CONDITIONER_IP = '192.168.1.20';
export const HEMS_IP = '192.168.1.30';
export const SENSOR_IP = '192.168.1.40';

export function airConditionerNode() {
  return createNode({
    uid: '00000801020304050607080910111213',
    manufacturer: '000008',
    objects: {
      '013001': {
        product: 'AN22ZRS',
        props: {
          0x80: '31', // off
          0x88: '42', // no fault
          0xb0: '42', // cooling
          0xb3: '1a', // 26 °C
          0xa0: '41', // fan auto
          0xbb: '1c', // 28 °C
          0xba: '37', // 55 %
          0xbe: 'fb', // -5 °C
        },
        settable: [0x80, 0xb0, 0xb3, 0xa0],
      },
    },
  });
}

export function hemsNode() {
  return createNode({
    uid: '00000b0a0b0c0d0e0f10111213141516',
    manufacturer: '00000b',
    objects: {
      '028801': {
        props: {
          0xe7: '000003e8', // 1000 W imported
          0xe0: '00003039', // 12345
          0xe1: '01', // x 0.1 kWh
          0xd3: '00000001',
          0xe3: '0000000a', // 10 -> 1 kWh exported
        },
      },
      '027901': { props: { 0xe0: '0960', 0xe1: '000f4240' } }, // 2400 W, 1000 kWh
      '027d01': { props: { 0xe4: '50', 0xd3: 'fffffe0c' } }, // 80 %, -500 W
    },
  });
}

export function sensorNode() {
  return createNode({
    manufacturer: '000005',
    objects: {
      '000701': { props: { 0xb1: '42', 0x88: '42' } },
      '001101': { props: { 0xe0: '00e1' } }, // 22.5 °C
    },
  });
}
