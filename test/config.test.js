import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, expandSubnet, normalizeConfig, parseHosts } from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig coerces the values coming from a form', () => {
  const config = normalizeConfig({
    poll_frequency: '300',
    request_timeout: '5',
    broadcast_discovery: false,
    hosts: '192.168.1.2',
    subnet: ' 192.168.1.0/24 ',
  });
  assert.equal(config.poll_frequency, 300);
  assert.equal(config.request_timeout, 5);
  assert.equal(config.broadcast_discovery, false);
  assert.equal(config.subnet, '192.168.1.0/24');
});

test('normalizeConfig keeps the refresh interval and the timeout in their bounds', () => {
  assert.equal(normalizeConfig({ poll_frequency: 5 }).poll_frequency, 60);
  assert.equal(normalizeConfig({ poll_frequency: 99999 }).poll_frequency, 3600);
  assert.equal(normalizeConfig({ poll_frequency: 'abc' }).poll_frequency, 60);
  assert.equal(normalizeConfig({ request_timeout: 0 }).request_timeout, 1);
  assert.equal(normalizeConfig({ request_timeout: null }).request_timeout, 3);
});

test('parseHosts keeps the valid IPv4 addresses, once', () => {
  assert.deepEqual(parseHosts('192.168.1.2, 192.168.1.3;10.0.0.1\n192.168.1.2 nope 300.1.1.1'), [
    '192.168.1.2',
    '192.168.1.3',
    '10.0.0.1',
  ]);
  assert.deepEqual(parseHosts(undefined), []);
});

test('expandSubnet lists the host addresses of a subnet', () => {
  const hosts = expandSubnet('192.168.1.77/24');
  assert.equal(hosts.length, 254);
  assert.equal(hosts[0], '192.168.1.1');
  assert.equal(hosts.at(-1), '192.168.1.254');
  assert.deepEqual(expandSubnet('10.0.0.5/32'), ['10.0.0.5']);
  assert.equal(expandSubnet('10.0.0.0/22').length, 1022);
});

test('expandSubnet refuses a malformed or too wide subnet', () => {
  assert.deepEqual(expandSubnet(''), []);
  assert.deepEqual(expandSubnet('10.0.0.0/16'), [], 'wider than /22');
  assert.deepEqual(expandSubnet('10.0.0/24'), []);
  assert.deepEqual(expandSubnet('999.0.0.0/24'), []);
});
