import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { createChatHandler } from './chat-handler.js';
import { indexDocument, initializeDocumentStore } from './document-store.js';
import { persistInferenceTrace } from './inference-history-store.js';
import { runMigrations } from './migration-runner.js';
import { loadModelPricing } from './observability.js';

const MODEL = 'openai/gpt-oss-120b';
const PRICING = {
  [MODEL]: { inputUsdPerMillion: 0.25, outputUsdPerMillion: 1.0 }
};

function makeDatabase(withDocument = true) {
  const db = new Database(':memory:');
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
  runMigrations(db);
  let documentId = null;
  if (withDocument) {
    documentId = indexDocument(db, {
      filename: 'observability.txt',
      fileType: 'txt',
      sourceBuffer: Buffer.from('The measured answer is forty-two.'),
      text: 'The measured answer is forty-two.'
    }).documentId;
  }
  return { db, documentId };
}

function makeGroq({ usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }, omitUsage = false, error = null, delay = false } = {}) {
  const calls = [];
  return {
    calls,
    client: {
      chat: { completions: { create: async request => {
        calls.push(request);
        if (delay) await new Promise(resolve => setImmediate(resolve));
        if (error) throw error;
        return {
          choices: [{ message: { content: 'The answer is forty-two [S1].' } }],
          ...(omitUsage ? {} : { usage })
        };
      } } }
    }
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function makeHandler(db, groq, options = {}) {
  return createChatHandler({ groq: groq.client, db, pricing: PRICING, ...options });
}

async function call(handler, body = { prompt: 'What is the measured answer?' }) {
  const response = responseRecorder();
  await handler({ body }, response);
  return response;
}

function assertValidDurations(trace) {
  assert.ok(Number.isFinite(trace.totalDurationMs));
  assert.ok(trace.totalDurationMs >= 0);
  for (const step of trace.steps) {
    assert.ok(Number.isFinite(step.durationMs), `${step.name} duration should be finite`);
    assert.ok(step.durationMs >= 0, `${step.name} duration should be non-negative`);
  }
}

test('returns measured trace and exact provider token usage with configured estimated cost', async () => {
  const { db, documentId } = makeDatabase();
  const groq = makeGroq();
  const handler = makeHandler(db, groq);

  const response = await call(handler, { prompt: 'What is the measured answer?', documentId });
  const { executionTrace, usage } = response.body;

  assert.equal(response.statusCode, 200);
  assert.equal(executionTrace.status, 'success');
  assert.equal(executionTrace.retrieval.strategy, 'sqlite-fts5');
  assert.equal(executionTrace.retrieval.retrievedChunkCount, 1);
  assert.equal(executionTrace.retrieval.scope, 'document');
  assert.equal(executionTrace.retrieval.documentId, documentId);
  assert.equal(executionTrace.modelIdentifier, MODEL);
  assert.deepEqual(executionTrace.steps.map(step => step.name), [
    'request-validation',
    'sqlite-fts5-retrieval',
    'context-preparation',
    'groq-inference'
  ]);
  assert.deepEqual(usage, {
    inputTokens: 100,
    outputTokens: 20,
    totalTokens: 120,
    source: 'provider'
  });
  assert.equal(response.body.tokens, 120);
  assert.equal(response.body.estimatedCostUsd, 0.000045);
  assert.equal(response.body.currency, 'USD');
  assert.equal(response.body.pricingModelId, MODEL);
  assert.equal(response.body.pricingSource, 'configured');
  assert.equal(response.body.isEstimate, true);
  assert.equal(response.body.unavailableReason, null);
  assert.equal(response.body.sources[0].documentId, documentId);
  assert.equal(response.body.sources[0].cited, true);
  assert.equal(executionTrace.traceId.length > 0, true);
  assertValidDurations(executionTrace);
  db.close();
});

test('returns null usage and cost when Groq omits usage without estimating tokens', async () => {
  const { db } = makeDatabase();
  const groq = makeGroq({ omitUsage: true });
  const response = await call(makeHandler(db, groq));

  assert.deepEqual(response.body.usage, {
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    source: 'unavailable'
  });
  assert.equal(response.body.tokens, null);
  assert.equal(response.body.estimatedCostUsd, null);
  assert.equal(response.body.unavailableReason, 'provider_usage_unavailable');
  assert.equal(response.body.isEstimate, true);
  db.close();
});

test('returns a clear unavailable cost when the used model has no configured pricing', async () => {
  const { db } = makeDatabase();
  const groq = makeGroq();
  const response = await call(makeHandler(db, groq, { pricing: {} }));

  assert.equal(response.body.executionTrace.modelIdentifier, MODEL);
  assert.equal(response.body.estimatedCostUsd, null);
  assert.equal(response.body.pricingModelId, MODEL);
  assert.equal(response.body.pricingSource, null);
  assert.equal(response.body.unavailableReason, 'model_pricing_not_configured');
  db.close();
});

test('loads only positive finite per-million rates from pricing configuration', () => {
  assert.deepEqual(loadModelPricing(JSON.stringify({
    [MODEL]: { inputUsdPerMillion: 0.25, outputUsdPerMillion: 1.0 },
    invalid: { inputUsdPerMillion: 0, outputUsdPerMillion: 1.0 },
    malformed: { inputUsdPerMillion: 'unknown', outputUsdPerMillion: 1.0 }
  })), {
    [MODEL]: { inputUsdPerMillion: 0.25, outputUsdPerMillion: 1.0 }
  });
  assert.deepEqual(loadModelPricing('not-json'), {});
});

test('identifies the successful fallback model actually used', async () => {
  const { db } = makeDatabase();
  const calls = [];
  const groq = {
    client: {
      chat: { completions: { create: async request => {
        calls.push(request.model);
        if (calls.length === 1) throw new Error('model unavailable');
        return {
          choices: [{ message: { content: 'The answer is forty-two [S1].' } }],
          usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }
        };
      } } }
    }
  };
  const response = await call(makeHandler(db, groq));

  assert.equal(response.body.executionTrace.modelIdentifier, 'groq/compound');
  assert.deepEqual(calls, ['openai/gpt-oss-120b', 'groq/compound']);
  db.close();
});

test('marks an empty retrieval as no_match and returns the general-answer trace', async () => {
  const { db } = makeDatabase(false);
  const groq = makeGroq();
  const response = await call(makeHandler(db, groq), { prompt: 'Question with no matches.' });

  assert.equal(response.body.executionTrace.status, 'no_match');
  assert.equal(response.body.executionTrace.retrieval.retrievedChunkCount, 0);
  assert.equal(response.body.executionTrace.retrieval.scope, 'all');
  assert.equal(response.body.retrievalMeta.resultCount, 0);
  assert.deepEqual(response.body.sources, []);
  assert.equal(response.body.citationValidation.factualEntailmentValidated, false);
  assert.equal(response.body.executionTrace.steps[1].status, 'no_match');
  assertValidDurations(response.body.executionTrace);
  db.close();
});

test('returns a safe partial trace when all Groq attempts fail', async () => {
  const { db } = makeDatabase();
  const groq = makeGroq({ error: new Error('private upstream details') });
  const response = await call(makeHandler(db, groq));

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, 'Erreur génération LLM');
  assert.equal(JSON.stringify(response.body).includes('private upstream details'), false);
  assert.equal(response.body.executionTrace.status, 'error');
  assert.equal(response.body.executionTrace.steps.at(-1).name, 'groq-inference');
  assert.equal(response.body.executionTrace.steps.at(-1).status, 'error');
  assert.equal(response.body.executionTrace.retrieval.retrievedChunkCount, 1);
  assert.equal(db.prepare('SELECT status FROM inference_history WHERE trace_id = ?').get(response.body.executionTrace.traceId).status, 'error');
  assertValidDurations(response.body.executionTrace);
  db.close();
});

test('invalid document IDs return a validation trace without retrieval', async () => {
  const { db } = makeDatabase();
  const groq = makeGroq();
  const response = await call(makeHandler(db, groq), { prompt: 'Question', documentId: -1 });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.executionTrace.status, 'error');
  assert.deepEqual(response.body.executionTrace.steps.map(step => step.name), ['request-validation']);
  assert.equal(response.body.executionTrace.retrieval.documentId, null);
  assert.equal(groq.calls.length, 0);
  assertValidDurations(response.body.executionTrace);
  db.close();
});

test('concurrent requests receive independent trace IDs and measured results', async () => {
  const { db } = makeDatabase();
  const groq = makeGroq({ delay: true });
  const handler = makeHandler(db, groq);

  const [first, second] = await Promise.all([
    call(handler, { prompt: 'First measured question' }),
    call(handler, { prompt: 'Second measured question' })
  ]);

  assert.notEqual(first.body.executionTrace.traceId, second.body.executionTrace.traceId);
  assert.equal(first.body.executionTrace.status, 'success');
  assert.equal(second.body.executionTrace.status, 'success');
  assertValidDurations(first.body.executionTrace);
  assertValidDurations(second.body.executionTrace);
  db.close();
});

test('telemetry persistence failure does not break an otherwise successful chat response', async () => {
  const { db } = makeDatabase();
  const groq = makeGroq();
  const handler = makeHandler(db, groq, {
    persistTrace: () => { throw new Error('sensitive database failure'); }
  });
  const response = await call(handler);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.reply, 'The answer is forty-two [S1].');
  assert.equal(response.body.executionTrace.status, 'success');
  assert.equal(JSON.stringify(response.body).includes('sensitive database failure'), false);
  db.close();
});

test('does not persist dangling document references if a document vanishes before telemetry write', async () => {
  const { db, documentId } = makeDatabase();
  const groq = makeGroq();
  const handler = makeHandler(db, groq, {
    persistTrace: (database, input) => {
      database.prepare('DELETE FROM documents_history WHERE id = ?').run(documentId);
      return persistInferenceTrace(database, input);
    }
  });
  const response = await call(handler, { prompt: 'What is the measured answer?', documentId });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.executionTrace.status, 'success');
  const persisted = db.prepare('SELECT document_id, status FROM inference_history').get();
  assert.deepEqual(persisted, { document_id: null, status: 'success' });
  db.close();
});
