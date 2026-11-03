import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from './migration-runner.js';
import { persistInferenceTrace } from './inference-history-store.js';
import { initializeDocumentStore } from './document-store.js';

function initializeLegacyDatabase(filename = ':memory:') {
  const db = new Database(filename);
  db.exec(`
    CREATE TABLE form_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE documents_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      character_count INTEGER,
      chunks_count INTEGER,
      status TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  initializeDocumentStore(db);
  return db;
}

const trace = (traceId, status = 'success') => ({
  traceId,
  timestamp: '2026-10-27T12:00:00.000Z',
  modelIdentifier: 'openai/gpt-oss-120b',
  status,
  totalDurationMs: 42.5,
  steps: [
    { name: 'request-validation', status: 'success', durationMs: 0.1 },
    { name: 'sqlite-fts5-retrieval', status: 'success', durationMs: 1.2 },
    { name: 'groq-inference', status: status === 'error' ? 'error' : 'success', durationMs: 40 }
  ],
  retrieval: { strategy: 'sqlite-fts5', retrievedChunkCount: 2, scope: 'all', documentId: null }
});

const providerUsage = { inputTokens: 10, outputTokens: 5, totalTokens: 15, source: 'provider' };
const pricedCost = {
  estimatedCostUsd: 0.00001,
  pricingModelId: 'openai/gpt-oss-120b',
  pricingSource: 'configured'
};

test('additive idempotent migration preserves legacy submissions and documents', () => {
  const db = initializeLegacyDatabase();
  db.prepare('INSERT INTO form_submissions (form_data) VALUES (?)').run('{"private":"keep"}');
  db.prepare(`INSERT INTO documents_history (filename, file_type, status) VALUES (?, ?, ?)`)
    .run('legacy.pdf', 'pdf', 'Success');

  runMigrations(db);
  runMigrations(db);

  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM form_submissions').get().count, 1);
  assert.equal(db.prepare('SELECT filename FROM documents_history').get().filename, 'legacy.pdf');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 4);
  assert.ok(db.prepare("SELECT version FROM schema_migrations WHERE version = '003_support_agents.sql'").get());
  assert.equal(db.prepare('SELECT count(*) AS count FROM support_agents').get().count, 0);
  assert.equal(db.prepare('SELECT count(*) AS count FROM support_agent_documents').get().count, 0);
  assert.ok(db.prepare("SELECT version FROM schema_migrations WHERE version = '002_finops_budget.sql'").get());
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM inference_history').get().count, 0);
  db.close();
});

test('persists metadata and ordered steps across reopen without storing request content', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'inference-history-'));
  const databaseFile = path.join(directory, 'history.db');
  let db = initializeLegacyDatabase(databaseFile);
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  const document = db.prepare(`
    INSERT INTO documents_history (filename, file_type, status) VALUES (?, ?, ?)
  `).run('private-name.pdf', 'pdf', 'Success');
  const requestTrace = trace('trace-persistent');
  requestTrace.retrieval.documentId = Number(document.lastInsertRowid);
  persistInferenceTrace(db, { trace: requestTrace, usage: providerUsage, cost: pricedCost });
  db.close();

  db = new Database(databaseFile);
  db.pragma('foreign_keys = ON');
  const stored = db.prepare('SELECT * FROM inference_history WHERE trace_id = ?').get('trace-persistent');
  const steps = db.prepare('SELECT * FROM inference_steps WHERE trace_id = ? ORDER BY step_index').all('trace-persistent');
  assert.equal(stored.total_tokens, 15);
  assert.equal(stored.estimated_cost_usd, 0.00001);
  assert.equal(stored.retrieved_chunk_count, 2);
  assert.deepEqual(steps.map(step => step.name), ['request-validation', 'sqlite-fts5-retrieval', 'groq-inference']);
  assert.equal(JSON.stringify({ stored, steps }).includes('private-name.pdf'), false);
  assert.equal(JSON.stringify({ stored, steps }).includes('private'), false);
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

test('persists no_match and error outcomes with nullable usage and estimated cost', () => {
  const db = initializeLegacyDatabase();
  runMigrations(db);
  const unavailable = { inputTokens: null, outputTokens: null, totalTokens: null, source: 'unavailable' };
  const noMatch = trace('trace-no-match', 'no_match');
  noMatch.retrieval.scope = 'all';
  noMatch.retrieval.documentId = null;
  noMatch.retrieval.retrievedChunkCount = 0;
  persistInferenceTrace(db, { trace: noMatch, usage: unavailable, cost: { estimatedCostUsd: null } });
  persistInferenceTrace(db, { trace: trace('trace-error', 'error'), usage: unavailable, cost: { estimatedCostUsd: null } });

  const rows = db.prepare('SELECT trace_id, status, input_tokens, estimated_cost_usd FROM inference_history ORDER BY trace_id').all();
  assert.deepEqual(rows, [
    { trace_id: 'trace-error', status: 'error', input_tokens: null, estimated_cost_usd: null },
    { trace_id: 'trace-no-match', status: 'no_match', input_tokens: null, estimated_cost_usd: null }
  ]);
  db.close();
});

test('foreign key cascade removes ordered steps with their parent trace', () => {
  const db = initializeLegacyDatabase();
  runMigrations(db);
  persistInferenceTrace(db, { trace: trace('trace-cascade'), usage: providerUsage, cost: pricedCost });
  db.prepare('DELETE FROM inference_history WHERE trace_id = ?').run('trace-cascade');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM inference_steps WHERE trace_id = ?').get('trace-cascade').count, 0);
  db.close();
});

test('returns false for a missing trace ID and writes no history', () => {
  const db = initializeLegacyDatabase();
  runMigrations(db);
  assert.equal(persistInferenceTrace(db, { trace: null, usage: providerUsage, cost: pricedCost }), false);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM inference_history').get().count, 0);
  db.close();
});
