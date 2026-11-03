import { randomUUID } from 'node:crypto';
import { AGENT_MODEL } from './agent.js';

const fields = ['name', 'description', 'role', 'systemInstructions', 'tone', 'language', 'model',
  'temperature', 'maxOutputTokens', 'fallbackMessage', 'escalationEnabled', 'status'];
const columns = ['name', 'description', 'role', 'system_instructions', 'tone', 'language', 'model',
  'temperature', 'max_output_tokens', 'fallback_message', 'escalation_enabled', 'status'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validVersion = value => Number.isSafeInteger(value) && value > 0;

export function validateSupportAgent(body, update = false) {
  if (!object(body) || Object.keys(body).some(key => !fields.includes(key) && !(update && key === 'version'))) return null;
  if (update && !validVersion(body.version)) return null;
  const data = {};
  for (const [key, min, max] of [['name', 1, 100], ['description', 0, 500], ['role', 1, 200],
    ['systemInstructions', 1, 12000], ['fallbackMessage', 1, 2000]]) {
    if (typeof body[key] !== 'string') return null;
    const value = body[key].trim();
    if (value.length < min || value.length > max || value.includes('\0')) return null;
    data[key] = value;
  }
  if (!['professional', 'friendly', 'concise'].includes(body.tone) || !['fr', 'en', 'ar'].includes(body.language) ||
    body.model !== AGENT_MODEL || typeof body.temperature !== 'number' || !Number.isFinite(body.temperature) ||
    body.temperature < 0 || body.temperature > 2 || !Number.isInteger(body.maxOutputTokens) ||
    body.maxOutputTokens < 1 || body.maxOutputTokens > 4096 || typeof body.escalationEnabled !== 'boolean' ||
    !['active', 'inactive'].includes(body.status)) return null;
  for (const key of ['tone', 'language', 'model', 'temperature', 'maxOutputTokens', 'escalationEnabled', 'status']) data[key] = body[key];
  return data;
}

function serialize(row) {
  if (!row) return null;
  return { id: row.id, ...Object.fromEntries(fields.map((field, index) =>
    [field, field === 'escalationEnabled' ? Boolean(row[columns[index]]) : row[columns[index]]])),
  version: row.version, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function registerSupportAgentRoutes(app, db, localGuard) {
  const base = '/api/agents';
  const read = id => db.prepare('SELECT * FROM support_agents WHERE id = ?').get(id);
  const invalid = res => res.status(400).json({ error: 'Invalid agent configuration.' });
  const wrap = handler => (req, res) => {
    try {
      if (req.params.id !== undefined && !uuid.test(req.params.id)) return invalid(res);
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) return invalid(res);
      return handler(req, res);
    } catch {
      return res.status(500).json({ error: 'Agent configuration storage unavailable.' });
    }
  };
  app.get(base, localGuard, wrap((req, res) => {
    const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1_000_000) return invalid(res);
    const items = db.prepare('SELECT * FROM support_agents ORDER BY updated_at DESC, id LIMIT ? OFFSET ?').all(limit, offset).map(serialize);
    return res.json({ items, total: db.prepare('SELECT count(*) AS total FROM support_agents').get().total, limit, offset });
  }));
  app.get(`${base}/:id`, localGuard, wrap((req, res) => {
    const agent = serialize(read(req.params.id));
    return agent ? res.json(agent) : res.status(404).json({ error: 'Agent not found.' });
  }));
  app.post(base, localGuard, wrap((req, res) => {
    const data = validateSupportAgent(req.body);
    if (!data) return invalid(res);
    const id = randomUUID(); const now = new Date().toISOString();
    const values = fields.map(field => field === 'escalationEnabled' ? Number(data[field]) : data[field]);
    db.prepare(`INSERT INTO support_agents (id, ${columns.join(',')}, created_at, updated_at) VALUES (${Array(15).fill('?').join(',')})`).run(id, ...values, now, now);
    return res.status(201).json(serialize(read(id)));
  }));
  const update = statusOnly => wrap((req, res) => {
    let data;
    if (statusOnly) {
      if (!object(req.body) || Object.keys(req.body).some(key => !['status', 'version'].includes(key)) ||
        !['active', 'inactive'].includes(req.body.status) || !validVersion(req.body.version)) return invalid(res);
      data = { status: req.body.status };
    } else {
      data = validateSupportAgent(req.body, true);
      if (!data) return invalid(res);
    }
    const keys = statusOnly ? ['status'] : fields;
    const sqlColumns = statusOnly ? ['status'] : columns;
    const values = keys.map(field => field === 'escalationEnabled' ? Number(data[field]) : data[field]);
    const changed = db.prepare(`UPDATE support_agents SET ${sqlColumns.map(column => `${column} = ?`).join(',')}, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?`)
      .run(...values, new Date().toISOString(), req.params.id, req.body.version);
    if (!changed.changes) return res.status(read(req.params.id) ? 409 : 404).json({ error: 'Agent missing or modified. Reload before saving.' });
    return res.json(serialize(read(req.params.id)));
  });
  app.put(`${base}/:id`, localGuard, update(false));
  app.patch(`${base}/:id/status`, localGuard, update(true));
}
