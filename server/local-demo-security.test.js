import assert from 'node:assert/strict';
import test from 'node:test';
import { validateLocalDemoBinding } from './local-demo-security.js';

test('defaults to loopback in local development', () => {
  assert.equal(validateLocalDemoBinding({ host: undefined, nodeEnv: 'development', telemetryLocalOnly: 'false' }), '127.0.0.1');
  assert.equal(validateLocalDemoBinding({ host: 'localhost', nodeEnv: 'development', telemetryLocalOnly: 'false' }), 'localhost');
});

test('requires explicit telemetry opt-in for production local demo', () => {
  assert.throws(
    () => validateLocalDemoBinding({ host: '127.0.0.1', nodeEnv: 'production', telemetryLocalOnly: 'false' }),
    /DASHBOARD_TELEMETRY_LOCAL_ONLY=true/
  );
  assert.equal(validateLocalDemoBinding({ host: '127.0.0.1', nodeEnv: 'production', telemetryLocalOnly: 'true' }), '127.0.0.1');
});

test('refuses non-loopback binds even when local-only telemetry is enabled', () => {
  for (const host of ['0.0.0.0', '192.0.2.1', '::']) {
    assert.throws(
      () => validateLocalDemoBinding({ host, nodeEnv: 'development', telemetryLocalOnly: 'true' }),
      /must bind to loopback only/
    );
  }
});
