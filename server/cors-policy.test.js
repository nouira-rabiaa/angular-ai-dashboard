import assert from 'node:assert/strict';
import test from 'node:test';
import { createCorsPolicy, parseCorsAllowedOrigins } from './cors-policy.js';

test('defaults to the Angular development origins and accepts explicit exact origins', () => {
  assert.deepEqual([...parseCorsAllowedOrigins(undefined)], [
    'http://localhost:4200',
    'http://127.0.0.1:4200'
  ]);
  assert.deepEqual([...parseCorsAllowedOrigins('https://dashboard.example, http://localhost:4300')], [
    'https://dashboard.example',
    'http://localhost:4300'
  ]);
});

test('rejects wildcard, malformed, credentialed and path-bearing origins', () => {
  for (const value of ['*', '', 'https://dashboard.example/path', 'https://user:pass@dashboard.example', 'not-an-origin']) {
    assert.throws(() => parseCorsAllowedOrigins(value), /valid HTTP\(S\) origins/);
  }
});

test('requires a Set of exact HTTP(S) origins for middleware creation', () => {
  assert.throws(() => createCorsPolicy(['http://localhost:4200']), /set of exact HTTP\(S\) origins/);
  assert.throws(() => createCorsPolicy(new Set(['*'])), /set of exact HTTP\(S\) origins/);
});