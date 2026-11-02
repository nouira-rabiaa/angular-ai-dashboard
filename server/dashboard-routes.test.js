import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import Database from 'better-sqlite3';
import express from 'express';
import { createDashboardHandlers, registerDashboardRoutes, validateDateRange } from './dashboard-routes.js';
import { createCorsPolicy } from './cors-policy.js';
import { runMigrations } from './migration-runner.js';
import { persistInferenceTrace } from './inference-history-store.js';

const trace = (traceId, occurredAt, cost = null, status = 'success') => ({
  traceId,
  timestamp: occurredAt,
  modelIdentifier: 'openai/gpt-oss-120b',
  status,
  totalDurationMs: 100,
  steps: [
    { name: 'sqlite-fts5-retrieval', status: 'success', durationMs: 2 },
    { name: 'groq-inference', status: 'success', durationMs: 90 }
  ],
  retrieval: { strategy: 'sqlite-fts5', retrievedChunkCount: 3, scope: 'all', documentId: null }
});

function makeDatabase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE documents_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL, file_type TEXT NOT NULL,
      character_count INTEGER, chunks_count INTEGER, status TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE document_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, document_id INTEGER NOT NULL REFERENCES documents_history(id),
      chunk_text TEXT NOT NULL
    );
    CREATE TABLE form_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, form_data TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  db.prepare('INSERT INTO documents_history (filename, file_type, character_count, chunks_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('confidential-title.pdf', 'pdf', 75, 2, 'Success', '2026-10-25T10:00:00.000Z');
  db.prepare('INSERT INTO document_chunks (document_id, chunk_text) VALUES (?, ?)').run(1, 'secret excerpt content');
  db.prepare('INSERT INTO form_submissions (form_data, created_at) VALUES (?, ?)')
    .run('{"email":"person@example.test","private":"sensitive"}', '2026-10-26T10:00:00.000Z');
  persistInferenceTrace(db, {
    trace: trace('trace-a', '2026-10-25T12:00:00.000Z'),
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, source: 'provider' },
    cost: { estimatedCostUsd: null, pricingModelId: 'openai/gpt-oss-120b', pricingSource: null }
  });
  persistInferenceTrace(db, {
    trace: trace('trace-b', '2026-10-26T12:00:00.000Z', null, 'no_match'),
    usage: { inputTokens: null, outputTokens: null, totalTokens: null, source: 'unavailable' },
    cost: { estimatedCostUsd: 0.00002, pricingModelId: 'openai/gpt-oss-120b', pricingSource: 'configured' }
  });
  return db;
}

async function withServer(db, {
  localOnlyEnabled = true,
  host = '127.0.0.1',
  allowedOrigins = new Set(['http://localhost:4200', 'http://127.0.0.1:4200'])
} = {}, run) {
  const app = express();
  app.use(createCorsPolicy(allowedOrigins));
  registerDashboardRoutes(app, createDashboardHandlers(db, { localOnlyEnabled }));
  const server = app.listen(0, host);
  await once(server, 'listening');
  const address = server.address();
  try {
    await run(`http://${address.address}:${address.port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('validates bounded date ranges', () => {
  assert.ok(validateDateRange({ from: '2026-10-01', to: '2026-10-27' }));
  assert.equal(validateDateRange({ from: '2026-02-30', to: '2026-03-01' }), null);
  assert.equal(validateDateRange({ from: '2026-10-28', to: '2026-10-27' }), null);
  assert.equal(validateDateRange({ from: '2025-01-01', to: '2026-10-27' }), null);
});

test('fails closed unless local telemetry is enabled and request is loopback', async () => {
  const db = makeDatabase();
  await withServer(db, { localOnlyEnabled: false }, async baseUrl => {
    const response = await fetch(`${baseUrl}/api/dashboard/metrics`, {
      headers: { Origin: 'http://localhost:4200' }
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:4200');
  });
  db.close();
});

test('allows only configured browser origins to read dashboard telemetry', async () => {
  const db = makeDatabase();
  await withServer(db, {}, async baseUrl => {
    const approved = await fetch(`${baseUrl}/api/dashboard/metrics`, {
      headers: { Origin: 'http://localhost:4200' }
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.headers.get('access-control-allow-origin'), 'http://localhost:4200');
    assert.match(approved.headers.get('vary'), /Origin/i);

    const unapproved = await fetch(`${baseUrl}/api/dashboard/documents`, {
      headers: { Origin: 'https://untrusted.example' }
    });
    assert.equal(unapproved.status, 403);
    assert.equal(unapproved.headers.get('access-control-allow-origin'), null);
    assert.deepEqual(await unapproved.json(), { error: 'Origin not allowed.' });

    const noOrigin = await fetch(`${baseUrl}/api/dashboard/metrics`);
    assert.equal(noOrigin.status, 200);
    assert.equal(noOrigin.headers.get('access-control-allow-origin'), null);
  });
  db.close();
});

test('handles approved and unapproved browser preflight requests explicitly', async () => {
  const db = makeDatabase();
  await withServer(db, {}, async baseUrl => {
    const approved = await fetch(`${baseUrl}/api/dashboard/metrics`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://127.0.0.1:4200',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'content-type'
      }
    });
    assert.equal(approved.status, 204);
    assert.equal(approved.headers.get('access-control-allow-origin'), 'http://127.0.0.1:4200');
    assert.match(approved.headers.get('access-control-allow-methods'), /GET/);
    assert.equal(approved.headers.get('access-control-allow-headers'), 'content-type');

    const unapproved = await fetch(`${baseUrl}/api/dashboard/metrics`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://untrusted.example',
        'Access-Control-Request-Method': 'GET'
      }
    });
    assert.equal(unapproved.status, 403);
    assert.equal(unapproved.headers.get('access-control-allow-origin'), null);
  });
  db.close();
});

test('serves metrics, daily series, paginated history, details, documents, and metadata-only submissions', async () => {
  const db = makeDatabase();
  await withServer(db, {}, async baseUrl => {
    const metricsResponse = await fetch(`${baseUrl}/api/dashboard/metrics?from=2026-10-25&to=2026-10-27`);
    assert.equal(metricsResponse.status, 200);
    const metrics = await metricsResponse.json();
    assert.equal(metrics.requestCount, 2);
    assert.equal(metrics.successCount, 1);
    assert.equal(metrics.noMatchCount, 1);
    assert.equal(metrics.errorCount, 0);
    assert.equal(metrics.averageLatencyMs, 100);
    assert.equal(metrics.estimatedCostUsd, 0.00002);
    assert.equal(metrics.pricedRequestCount, 1);
    assert.equal(metrics.unpricedRequestCount, 1);

    const daily = await (await fetch(`${baseUrl}/api/dashboard/timeseries?from=2026-10-25&to=2026-10-27`)).json();
    assert.deepEqual(daily.items.map(item => item.date), ['2026-10-25', '2026-10-26']);
    assert.equal(daily.items[0].estimatedCostUsd, null);

    const historyResponse = await fetch(`${baseUrl}/api/dashboard/inferences?from=2026-10-25&to=2026-10-27&limit=1&offset=0`);
    const history = await historyResponse.json();
    assert.equal(history.total, 2);
    assert.equal(history.items.length, 1);
    assert.equal(history.items[0].traceId, 'trace-b');
    assert.equal((await (await fetch(`${baseUrl}/api/dashboard/inferences?from=2026-10-25&to=2026-10-27&limit=1&offset=1`)).json()).items[0].traceId, 'trace-a');

    const detailResponse = await fetch(`${baseUrl}/api/dashboard/inferences/trace-a`);
    const detail = await detailResponse.json();
    assert.deepEqual(detail.steps.map(step => step.stepIndex), [0, 1]);
    assert.equal(JSON.stringify(detail).includes('secret excerpt content'), false);
    assert.equal(JSON.stringify(detail).includes('person@example.test'), false);

    const documents = await (await fetch(`${baseUrl}/api/dashboard/documents?limit=10&offset=0`)).json();
    assert.equal(documents.total, 1);
    assert.equal(documents.totalChunks, 1);
    assert.equal(documents.items[0].chunksCount, 1);

    const forms = await (await fetch(`${baseUrl}/api/dashboard/form-submissions?limit=10&offset=0`)).json();
    assert.equal(forms.total, 1);
    assert.equal(forms.items.length, 1);
    assert.equal(JSON.stringify(forms).includes('person@example.test'), false);
    assert.equal(JSON.stringify(forms).includes('sensitive'), false);
    assert.equal(JSON.stringify(forms).includes('form_data'), false);
  });
  db.close();
});

test('rejects invalid date, pagination, status, scope and trace ID inputs', async () => {
  const db = makeDatabase();
  await withServer(db, {}, async baseUrl => {
    for (const url of [
      '/api/dashboard/metrics?from=bad',
      '/api/dashboard/inferences?limit=1000',
      '/api/dashboard/inferences?status=unknown',
      '/api/dashboard/inferences?scope=private',
      '/api/dashboard/inferences/not-valid.trace'
    ]) {
      const response = await fetch(`${baseUrl}${url}`);
      assert.equal(response.status, 400, url);
    }
    assert.equal((await fetch(`${baseUrl}/api/dashboard/inferences/missing-trace`)).status, 404);
  });
  db.close();
});
