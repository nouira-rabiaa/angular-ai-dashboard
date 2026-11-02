export function validateLocalDemoBinding({ host, nodeEnv, telemetryLocalOnly }) {
  const bindHost = host || '127.0.0.1';
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);

  if (!loopbackHosts.has(bindHost)) {
    throw new Error('This unauthenticated demo server must bind to loopback only.');
  }
  if (nodeEnv === 'production' && telemetryLocalOnly !== 'true') {
    throw new Error('Production local demo requires DASHBOARD_TELEMETRY_LOCAL_ONLY=true until dashboard authentication is implemented.');
  }

  return bindHost;
}
