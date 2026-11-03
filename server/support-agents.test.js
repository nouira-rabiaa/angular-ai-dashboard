import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import express from 'express';
import { runMigrations } from './migration-runner.js';
import { createDashboardHandlers } from './dashboard-routes.js';
import { createCorsPolicy, parseCorsAllowedOrigins } from './cors-policy.js';
import { registerSupportAgentRoutes, validateSupportAgent } from './support-agents.js';

const config = (overrides = {}) => ({ name: 'Support boutique', description: 'Configuration de test', role: 'Support client',
  systemInstructions: 'Répondre uniquement avec les connaissances autorisées.', tone: 'professional', language: 'fr',
  model: 'openai/gpt-oss-120b', temperature: 0.6, maxOutputTokens: 1024,
  fallbackMessage: 'Information indisponible, contactez un conseiller.', escalationEnabled: true, status: 'inactive', ...overrides });
async function fixture(t, options = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'support-agent-test-'));
  const filename = path.join(directory, 'isolated.db');
  const db = new Database(filename);
  db.exec('CREATE TABLE documents_history (id INTEGER PRIMARY KEY, created_at TEXT); CREATE TABLE document_chunks (id INTEGER PRIMARY KEY, document_id INTEGER); CREATE TABLE form_submissions (id INTEGER PRIMARY KEY, created_at TEXT);');
  runMigrations(db);runMigrations(db);
  const app = express();app.use(createCorsPolicy(parseCorsAllowedOrigins()));app.use(express.json());
  registerSupportAgentRoutes(app, db, createDashboardHandlers(db, { localOnlyEnabled: options.enabled ?? true }).middleware);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve));if (db.open) db.close();rmSync(directory, { recursive: true }); });
  const request = async (url = '', method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/agents${url}`, { method,
      headers: { Origin: 'http://localhost:4200', 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text() };
  };
  return { db, filename, server, request };
}

test('configuration CRUD, pagination, status and reopening SQLite preserve exact values', async t => {
  const { request, filename, db } = await fixture(t);
  assert.deepEqual((await request()).data.items, []);
  const created = await request('', 'POST', config());assert.equal(created.status, 201);
  const agent = created.data;assert.equal(agent.version, 1);assert.equal(agent.escalationEnabled, true);
  assert.equal((await request(`/${agent.id}`)).data.systemInstructions, config().systemInstructions);
  const updated = await request(`/${agent.id}`, 'PUT', { ...config({ name: "L'agent <script>texte</script>" }), version: 1 });
  assert.equal(updated.status, 200);assert.equal(updated.data.version, 2);assert.equal(updated.data.createdAt, agent.createdAt);
  const active = await request(`/${agent.id}/status`, 'PATCH', { status: 'active', version: 2 });
  assert.equal(active.status, 200);assert.equal(active.data.status, 'active');
  const inactive = await request(`/${agent.id}/status`, 'PATCH', { status: 'inactive', version: 3 });
  assert.equal(inactive.data.status, 'inactive');
  assert.equal((await request('?limit=1&offset=1')).data.items.length, 0);
  assert.equal((await request()).data.total, 1);
  // Close the original connection, then reopen the same isolated file as after a restart.
  db.close();
  const reopened = new Database(filename);runMigrations(reopened);
  assert.equal(reopened.prepare('SELECT name FROM support_agents').get().name, "L'agent <script>texte</script>");
  assert.equal(reopened.prepare('SELECT version FROM support_agents').get().version, 4);reopened.close();
});

test('strict validation rejects invalid fields, model settings, types and SQL-like identifiers', async t => {
  const { request } = await fixture(t);
  for (const override of [ { name: ' ' }, { name: 'x'.repeat(101) }, { description: 'x'.repeat(501) },
    { role: '' }, { systemInstructions: 'x'.repeat(12001) }, { fallbackMessage: '' },
    { tone: 'unknown' }, { language: 'xx' }, { model: 'invented-model' }, { temperature: 2.1 },
    { temperature: '0.5' }, { maxOutputTokens: 4097 }, { maxOutputTokens: 1.5 },
    { escalationEnabled: 1 }, { status: 'deleted' }, { apiKey: 'not-a-credential' }, { owner_id: 'fake-owner' } ]) {
    assert.equal((await request('', 'POST', config(override))).status, 400);
  }
  assert.equal(validateSupportAgent(config({ temperature: NaN })), null);
  assert.equal(validateSupportAgent(config({ temperature: Infinity })), null);
  assert.equal((await request('', 'POST', [])).status, 400);
  assert.equal((await request('/1%20OR%201=1')).status, 400);
  assert.equal((await request('?limit=101')).status, 400);
  assert.equal((await request('?offset=-1')).status, 400);
  assert.equal((await request()).data.total, 0);
});

test('missing agents, concurrent edits and status validation never overwrite saved configuration', async t => {
  const { request } = await fixture(t);
  const missing = '/00000000-0000-4000-8000-000000000000';
  assert.equal((await request(missing)).status, 404);
  assert.equal((await request(missing, 'PUT', { ...config(), version: 1 })).status, 404);
  const agent = (await request('', 'POST', config())).data;
  assert.equal((await request(`/${agent.id}`, 'PUT', { ...config(), version: 1 })).status, 200);
  assert.equal((await request(`/${agent.id}`, 'PUT', { ...config({ name: 'stale' }), version: 1 })).status, 409);
  assert.equal((await request(`/${agent.id}/status`, 'PATCH', { status: 'active', version: 1 })).status, 409);
  assert.equal((await request(`/${agent.id}/status`, 'PATCH', { status: 'active' })).status, 400);
  assert.equal((await request(`/${agent.id}/status`, 'PATCH', { status: 'deleted', version: 2 })).status, 400);
  assert.equal((await request(`/${agent.id}`)).data.name, config().name);
  assert.equal((await request(`/${agent.id}`, 'DELETE')).status, 404);
});

test('local-only guards deny disabled or non-loopback clients and storage errors stay generic', async t => {
  const disabled = await fixture(t, { enabled: false });
  assert.equal((await disabled.request()).status, 403);
  assert.equal((await disabled.request('', 'POST', config())).status, 403);
  let code;
  createDashboardHandlers(disabled.db, { localOnlyEnabled: true }).middleware(
    { socket: { remoteAddress: '203.0.113.1' } }, { status(value) { code = value; return this; }, json() {} }, () => assert.fail('must deny'));
  assert.equal(code, 403);
  const enabled = await fixture(t);enabled.db.close();
  const error = await enabled.request();assert.equal(error.status, 500);
  assert.deepEqual(error.data, { error: 'Agent configuration storage unavailable.' });
});

test('CORS permits configuration writes only on the new resource and rejects hostile origins', async t => {
  const { server } = await fixture(t);const base = `http://127.0.0.1:${server.address().port}`;
  for (const method of ['PUT', 'PATCH']) {
    const good = await fetch(`${base}/api/agents/00000000-0000-4000-8000-000000000000/status`, { method: 'OPTIONS',
      headers: { Origin: 'http://localhost:4200', 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'content-type' } });
    assert.equal(good.status, 204);
    const legacy = await fetch(`${base}/api/chat`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:4200', 'Access-Control-Request-Method': method } });
    assert.equal(legacy.status, 403);
  }
  const denied = await fetch(`${base}/api/agents`, { headers: { Origin: 'https://untrusted.example' } });assert.equal(denied.status, 403);
});
