const DEFAULT_DEVELOPMENT_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200'
];

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST']);
const ALLOWED_HEADERS = new Set(['content-type']);

export function parseCorsAllowedOrigins(serializedOrigins = process.env.CORS_ALLOWED_ORIGINS) {
  const origins = serializedOrigins === undefined
    ? DEFAULT_DEVELOPMENT_ORIGINS
    : serializedOrigins.split(',').map(origin => origin.trim());

  if (!origins.length || origins.some(origin => !origin)) {
    throw new Error('CORS_ALLOWED_ORIGINS must contain valid HTTP(S) origins.');
  }

  const allowedOrigins = new Set();
  for (const origin of origins) {
    let parsedOrigin;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error('CORS_ALLOWED_ORIGINS must contain valid HTTP(S) origins.');
    }

    if (
      !['http:', 'https:'].includes(parsedOrigin.protocol) ||
      parsedOrigin.origin !== origin ||
      parsedOrigin.username ||
      parsedOrigin.password
    ) {
      throw new Error('CORS_ALLOWED_ORIGINS must contain valid HTTP(S) origins.');
    }

    allowedOrigins.add(origin);
  }

  return allowedOrigins;
}

function rejectOrigin(res) {
  return res.status(403).json({ error: 'Origin not allowed.' });
}

export function createCorsPolicy(allowedOrigins) {
  if (!(allowedOrigins instanceof Set) || [...allowedOrigins].some(origin => {
    try {
      const parsedOrigin = new URL(origin);
      return !['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin;
    } catch {
      return true;
    }
  })) {
    throw new TypeError('CORS policy requires a set of exact HTTP(S) origins.');
  }

  return (req, res, next) => {
    const origin = req.get('Origin');
    if (origin === undefined) return next();
    if (!allowedOrigins.has(origin)) return rejectOrigin(res);

    res.vary('Origin');
    res.set('Access-Control-Allow-Origin', origin);

    if (req.method !== 'OPTIONS') return next();

    res.vary('Access-Control-Request-Method');
    res.vary('Access-Control-Request-Headers');

    // Only configuration resources gain write verbs; legacy routes retain their policy.
    let methods = /^\/api\/agents(?:\/[0-9a-f-]+(?:\/(?:status|documents))?)?$/.test(req.path)
      ? new Set([...ALLOWED_METHODS, 'PUT', 'PATCH']) : ALLOWED_METHODS;
    // Only a specific ticket resource gains PATCH, not arbitrary agent subroutes.
    if (/^\/api\/agents\/[0-9a-f-]+\/tickets\/[0-9a-f-]+$/.test(req.path)) methods = new Set([...ALLOWED_METHODS, 'PATCH']);
    // Deletion is granted only to a specific conversation resource, never legacy APIs.
    if (/^\/api\/agents\/[0-9a-f-]+\/conversations\/[0-9a-f-]+$/.test(req.path)) methods = new Set([...ALLOWED_METHODS, 'DELETE']);
    const requestedMethod = req.get('Access-Control-Request-Method');
    if (requestedMethod && !methods.has(requestedMethod.toUpperCase())) {
      return rejectOrigin(res);
    }

    const requestedHeaders = (req.get('Access-Control-Request-Headers') ?? '')
      .split(',')
      .map(header => header.trim().toLowerCase())
      .filter(Boolean);
    if (requestedHeaders.some(header => !ALLOWED_HEADERS.has(header))) {
      return rejectOrigin(res);
    }

    res.set('Access-Control-Allow-Methods', [...methods].join(', '));
    if (requestedHeaders.length) {
      res.set('Access-Control-Allow-Headers', requestedHeaders.join(', '));
    }
    res.set('Access-Control-Max-Age', '600');
    return res.status(204).end();
  };
}