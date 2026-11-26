// -----------------------------------------------------------------------------
// ECHONET Lite UDP client.
//
// One UDP socket, bound to port 3610 when it is free (ECHONET Lite nodes
// answer on port 3610 whatever the source port of the request, so this is the
// port that receives the most answers through the Docker NAT), otherwise to an
// ephemeral port. Requests are unicast to the node IP; answers are matched on
// the node IP and the transaction id (TID).
//
// Requests to the same node are serialized: ECHONET Lite adapters (Wi-Fi
// modules of air conditioners, HEMS gateways) are small microcontrollers that
// drop concurrent requests.
//
// The socket factory is injectable: the tests plug an in-memory simulator in
// place of the network (see test/helpers/simulator.js).
// -----------------------------------------------------------------------------

import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { createLogger } from '@gladysassistant/integration-sdk';
import {
  CONTROLLER_EOJ,
  ECHONET_PORT,
  EPC,
  ESV,
  NODE_PROFILE_EOJ,
  RESPONSES_OF,
  decodeFrame,
  decodeInstanceList,
  encodeFrame,
  normalizeEoj,
} from './frame.js';

const logger = createLogger({ name: 'echonet-client' });

// Many adapters refuse a Get carrying too many properties at once.
const MAX_PROPERTIES_PER_REQUEST = 8;

export class EchonetTimeoutError extends Error {
  constructor(ip, deoj) {
    super(`No answer from ${ip} (${deoj})`);
    this.name = 'EchonetTimeoutError';
    this.ip = ip;
  }
}

export class EchonetClient extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {() => import('node:dgram').Socket} [options.createSocket]
   * @param {number} [options.timeoutMs] - per attempt
   * @param {number} [options.retries] - extra attempts after a timeout
   */
  constructor({ createSocket, timeoutMs = 3000, retries = 1 } = {}) {
    super();
    this.createSocket =
      createSocket ?? (() => dgram.createSocket({ type: 'udp4', reuseAddr: true }));
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.socket = null;
    this.tid = Math.floor(Math.random() * 0xffff);
    this.pending = new Map();
    this.queues = new Map();
  }

  /** Bind the socket: port 3610 when free, an ephemeral one otherwise. */
  async start() {
    if (this.socket) {
      return;
    }
    this.socket = await this.#bind(ECHONET_PORT).catch((err) => {
      logger.warn(
        `Port ${ECHONET_PORT} unavailable (${err.code ?? err.message}), using a random port`,
      );
      return this.#bind(0);
    });
    this.socket.on('message', (msg, rinfo) => this.#onMessage(msg, rinfo));
    this.socket.on('error', (err) => logger.error('UDP socket error', err));
  }

  #bind(port) {
    return new Promise((resolve, reject) => {
      const socket = this.createSocket();
      const onError = (err) => {
        socket.close?.();
        reject(err);
      };
      socket.once('error', onError);
      socket.bind(port, () => {
        socket.off('error', onError);
        resolve(socket);
      });
    });
  }

  /** Close the socket and fail every pending request. */
  stop() {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error('ECHONET Lite client stopped'));
    }
    this.pending.clear();
    this.queues.clear();
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // already closed
      }
      this.socket = null;
    }
  }

  #nextTid() {
    this.tid = (this.tid + 1) & 0xffff;
    return this.tid;
  }

  #onMessage(msg, rinfo) {
    let frame;
    try {
      frame = decodeFrame(msg);
    } catch (err) {
      logger.debug(`Dropped a datagram from ${rinfo.address}: ${err.message}`);
      return;
    }
    const key = `${rinfo.address}|${frame.tid}`;
    const waiting = this.pending.get(key);
    if (waiting && waiting.accept.includes(frame.esv)) {
      clearTimeout(waiting.timer);
      this.pending.delete(key);
      waiting.resolve(frame);
      return;
    }
    if (frame.esv === ESV.INF || frame.esv === ESV.INFC) {
      // Spontaneous status change notification (most often multicast, so it
      // only reaches the container when the node also sends it unicast).
      this.emit('notification', { ip: rinfo.address, frame });
    }
  }

  // Serialize the requests to the same node.
  #enqueue(ip, task) {
    const previous = this.queues.get(ip) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(task);
    const tail = run.catch(() => {});
    this.queues.set(ip, tail);
    tail.then(() => {
      if (this.queues.get(ip) === tail) {
        this.queues.delete(ip);
      }
    });
    return run;
  }

  #sendOnce(ip, deoj, esv, properties, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('ECHONET Lite client not started'));
        return;
      }
      const tid = this.#nextTid();
      const key = `${ip}|${tid}`;
      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(new EchonetTimeoutError(ip, deoj));
      }, timeoutMs);
      this.pending.set(key, { resolve, reject, timer, accept: RESPONSES_OF[esv] ?? [] });
      const datagram = encodeFrame({ tid, seoj: CONTROLLER_EOJ, deoj, esv, properties });
      this.socket.send(datagram, ECHONET_PORT, ip, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(key);
          reject(err);
        }
      });
    });
  }

  /**
   * Send a request and wait for its answer, retrying after a timeout.
   * @param {object} [options] - `{ timeoutMs, retries }` overriding the client's
   * @returns {Promise<ReturnType<typeof decodeFrame>>}
   */
  request(ip, deoj, esv, properties, { timeoutMs = this.timeoutMs, retries = this.retries } = {}) {
    const target = normalizeEoj(deoj);
    return this.#enqueue(ip, async () => {
      let lastError;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          return await this.#sendOnce(ip, target, esv, properties, timeoutMs);
        } catch (err) {
          lastError = err;
          if (!(err instanceof EchonetTimeoutError)) {
            throw err;
          }
        }
      }
      throw lastError;
    });
  }

  /**
   * Read properties. Unsupported ones (Get_SNA, PDC 0) are left out.
   * @param {string} ip
   * @param {string} eoj
   * @param {number[]} epcs
   * @param {object} [options] - see request()
   * @returns {Promise<Map<number, Buffer>>}
   */
  async get(ip, eoj, epcs, options) {
    const values = new Map();
    const unique = [...new Set(epcs)];
    for (let i = 0; i < unique.length; i += MAX_PROPERTIES_PER_REQUEST) {
      const chunk = unique.slice(i, i + MAX_PROPERTIES_PER_REQUEST);
      const frame = await this.request(
        ip,
        eoj,
        ESV.GET,
        chunk.map((epc) => ({ epc })),
        options,
      );
      for (const { epc, edt } of frame.properties) {
        if (edt.length > 0) {
          values.set(epc, Buffer.from(edt));
        }
      }
    }
    return values;
  }

  /**
   * Write properties with SetC (the node confirms).
   * @param {string} ip
   * @param {string} eoj
   * @param {Array<{epc: number, edt: Buffer}>} properties
   * @returns {Promise<{ok: boolean, rejected: number[]}>}
   */
  async set(ip, eoj, properties) {
    const frame = await this.request(ip, eoj, ESV.SETC, properties);
    // In a Set_Res every accepted property comes back with PDC 0; in a
    // SetC_SNA the refused ones come back with their EDT.
    const rejected =
      frame.esv === ESV.SET_RES
        ? []
        : frame.properties.filter(({ edt }) => edt.length > 0).map(({ epc }) => epc);
    return { ok: frame.esv === ESV.SET_RES, rejected };
  }

  /**
   * Ask a node which device objects it hosts (node profile, EPC 0xD6).
   * @param {string} ip
   * @param {object} [options] - see request()
   * @returns {Promise<string[]>} EOJs
   */
  async getInstances(ip, options) {
    const values = await this.get(ip, NODE_PROFILE_EOJ, [EPC.SELF_NODE_INSTANCE_LIST_S], options);
    return decodeInstanceList(values.get(EPC.SELF_NODE_INSTANCE_LIST_S));
  }
}
