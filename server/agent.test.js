import express from 'express';
import { createDashboardHandlers } from './dashboard-routes.js';
import { createCorsPolicy, parseCorsAllowedOrigins } from './cors-policy.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
  AgentRunError,
  createAgentRouteHandler,
  createAgentRunner,
  registerInternalAgentRoute
} from './agent.js';

function makeDatabase() {
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
  return db;
}

function toolCall(name, args = '{}', id = 'tool-call-1') {
  return {
    choices: [{
      finish_reason: 'tool_calls',
      message: {
        tool_calls: [{ id, type: 'function', function: { name, arguments: args } }]
      }
    }]
  };
}

function finalAnswer(content = 'Done.', reasoning = 'private reasoning') {
  return {
    choices: [{
      finish_reason: 'stop',
      message: { content, reasoning }
    }]
  };
}

function fakeGroq(responses) {
  const calls = [];
  return {
    calls,
    client: {
      chat: {
        completions: {
          create: async (request, options) => {
            calls.push({ request, options });
            const response = responses.shift();
            if (typeof response === 'function') return response(request, options);
            if (response instanceof Error) throw response;
            return response;
          }
        }
      }
    }
  };
}

function createRunner(db, responses, options = {}) {
  const fake = fakeGroq(responses);
  const runner = createAgentRunner({
    groq: fake.client,
    db,
    createRunId: () => 'test-run-id',
    ...options
  });
  return { runner, calls: fake.calls };
}

test('executes count_form_submissions and returns only the final answer and tool trace', async () => {
  const db = makeDatabase();
  db.prepare('INSERT INTO form_submissions (form_data) VALUES (?)').run('{"private":"do-not-return"}');
  db.prepare('INSERT INTO form_submissions (form_data) VALUES (?)').run('{"other":"secret"}');
  const { runner, calls } = createRunner(db, [
    toolCall('count_form_submissions'),
    finalAnswer('There are 2 submissions.')
  ]);

  const result = await runner('Count the submitted forms.');

  assert.equal(result.status, 'completed');
  assert.equal(result.runId, 'test-run-id');
  assert.equal(result.answer, 'There are 2 submissions.');
  assert.deepEqual(result.trace, [{
    step: 1,
    tool: 'count_form_submissions',
    status: 'completed',
    result: { count: 2 }
  }]);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(JSON.stringify(result).includes('private reasoning'), false);
  assert.deepEqual(calls[0].request.tools.map(tool => tool.function.name), [
    'count_form_submissions',
    'get_dashboard_history'
  ]);
  assert.equal(calls[0].request.model, 'openai/gpt-oss-120b');
  assert.equal(calls[0].request.parallel_tool_calls, false);
  assert.equal(calls[0].request.reasoning_format, 'hidden');
  assert.equal(calls[0].options.maxRetries, 0);
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  db.close();
});

test('history tool returns only bounded metadata and uses the requested limit', async () => {
  const db = makeDatabase();
  db.prepare('INSERT INTO form_submissions (form_data, created_at) VALUES (?, ?)')
    .run('{"sensitive":"form-value"}', '2026-10-13T12:00:00.000Z');
  db.prepare(`
    INSERT INTO documents_history (filename, file_type, character_count, chunks_count, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('confidential.pdf', 'PDF', 50, 2, 'Success', '2026-10-14T12:00:00.000Z');
  const { runner } = createRunner(db, [
    toolCall('get_dashboard_history', '{"limit":1}'),
    finalAnswer('One recent item.')
  ]);

  const result = await runner('Show one recent item.');
  const history = result.trace[0].result;

  assert.equal(history.returned, 1);
  assert.deepEqual(history.items, [{
    sourceId: 1,
    type: 'document',
    createdAt: '2026-10-14T12:00:00.000Z',
    status: 'completed'
  }]);
  assert.equal(JSON.stringify(history).includes('confidential.pdf'), false);
  assert.equal(JSON.stringify(history).includes('form-value'), false);
  assert.deepEqual(Object.keys(history.items[0]).sort(), ['createdAt', 'sourceId', 'status', 'type']);
  db.close();
});

test('rejects invalid goals before contacting Groq', async () => {
  const db = makeDatabase();
  const { runner, calls } = createRunner(db, []);

  await assert.rejects(runner('  '), error => {
    assert.equal(error.code, 'INVALID_GOAL');
    assert.equal(error.statusCode, 400);
    return true;
  });
  await assert.rejects(runner('x'.repeat(2001)), { code: 'INVALID_GOAL' });
  assert.equal(calls.length, 0);
  db.close();
});

test('rejects arbitrary tool names without invoking a database tool', async () => {
  const db = makeDatabase();
  const { runner } = createRunner(db, [toolCall('run_sql', '{"query":"DROP TABLE form_submissions"}')]);

  await assert.rejects(runner('Run the requested operation.'), error => {
    assert.equal(error.code, 'AGENT_TOOL_REJECTED');
    assert.deepEqual(error.trace, [{
      step: 1,
      tool: 'unrecognized_tool',
      status: 'rejected',
      result: { code: 'TOOL_NOT_ALLOWED' }
    }]);
    assert.equal(JSON.stringify(error.toResponse()).includes('DROP TABLE'), false);
    return true;
  });
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'form_submissions'").get().name, 'form_submissions');
  db.close();
});

test('rejects extra and out-of-range tool arguments', async () => {
  for (const args of ['{"limit":26}', '{"limit":null}', '{"limit":1,"sql":"SELECT 1"}', '{invalid']) {
    const db = makeDatabase();
    const { runner } = createRunner(db, [toolCall('get_dashboard_history', args)]);
    await assert.rejects(runner('Inspect history.'), error => {
      assert.equal(error.code, 'AGENT_TOOL_REJECTED');
      assert.equal(error.trace[0].status, 'rejected');
      assert.deepEqual(error.trace[0].result, { code: 'INVALID_TOOL_ARGUMENTS' });
      return true;
    });
    db.close();
  }
});

test('rejects a malformed model tool-call ID before executing a tool', async () => {
  const db = makeDatabase();
  const malformedCall = toolCall('count_form_submissions');
  malformedCall.choices[0].message.tool_calls[0].id = '';
  const { runner } = createRunner(db, [malformedCall]);

  await assert.rejects(runner('Count submissions.'), error => {
    assert.equal(error.code, 'AGENT_TOOL_REJECTED');
    assert.deepEqual(error.trace[0].result, { code: 'INVALID_TOOL_CALL' });
    return true;
  });
  db.close();
});

test('rejects extra arguments to count_form_submissions', async () => {
  const db = makeDatabase();
  const { runner } = createRunner(db, [toolCall('count_form_submissions', '{"url":"https://example.com"}')]);

  await assert.rejects(runner('Use a URL.'), error => {
    assert.equal(error.trace[0].status, 'rejected');
    assert.deepEqual(error.trace[0].result, { code: 'INVALID_TOOL_ARGUMENTS' });
    assert.equal(JSON.stringify(error.toResponse()).includes('https://'), false);
    return true;
  });
  db.close();
});

test('fails closed when the model exceeds the tool-call limit', async () => {
  const db = makeDatabase();
  const { runner } = createRunner(db, [
    toolCall('count_form_submissions', '{}', 'first'),
    toolCall('count_form_submissions', '{}', 'second')
  ], { maxToolCalls: 1 });

  await assert.rejects(runner('Count submissions.'), error => {
    assert.equal(error.code, 'AGENT_TOOL_LIMIT');
    assert.equal(error.trace.length, 2);
    assert.equal(error.trace[1].status, 'rejected');
    assert.deepEqual(error.trace[1].result, { code: 'TOOL_LIMIT_REACHED' });
    return true;
  });
  db.close();
});

test('enforces the model iteration limit', async () => {
  const db = makeDatabase();
  const { runner } = createRunner(db, [
    toolCall('count_form_submissions', '{}', 'first'),
    toolCall('count_form_submissions', '{}', 'second')
  ], { maxIterations: 2 });

  await assert.rejects(runner('Count submissions.'), error => {
    assert.equal(error.code, 'AGENT_ITERATION_LIMIT');
    assert.equal(error.trace.length, 2);
    return true;
  });
  db.close();
});

test('aborts a pending Groq request at the overall deadline', async () => {
  const db = makeDatabase();
  const { runner, calls } = createRunner(db, [(_request, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  })], { timeoutMs: 20 });

  await assert.rejects(runner('Wait for the result.'), error => {
    assert.equal(error.code, 'AGENT_TIMEOUT');
    assert.equal(error.statusCode, 504);
    return true;
  });
  assert.equal(calls[0].options.timeout <= 20, true);
  db.close();
});

test('maps provider failures to a safe response with the completed trace', async () => {
  const db = makeDatabase();
  const { runner } = createRunner(db, [
    toolCall('count_form_submissions'),
    new Error('provider details must not be returned')
  ]);

  await assert.rejects(runner('Count submissions.'), error => {
    assert.equal(error.code, 'AGENT_UPSTREAM_ERROR');
    assert.equal(error.message.includes('provider details'), false);
    assert.equal(error.trace[0].status, 'completed');
    return true;
  });
  db.close();
});

test('route handler returns validation and run failures as structured JSON', async () => {
  const responses = [];
  const res = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      responses.push({ statusCode: this.statusCode ?? 200, body });
      return body;
    }
  };
  const handler = createAgentRouteHandler(async goal => {
    if (goal === 'bad') throw new AgentRunError('INVALID_GOAL', 'Goal must be valid.', 400);
    throw new AgentRunError('AGENT_TIMEOUT', 'Agent execution exceeded its time limit.', 504, 'run-id', []);
  });

  await handler({ body: { goal: 'bad' } }, res);
  await handler({ body: { goal: 'wait' } }, res);

  assert.deepEqual(responses, [
    { statusCode: 400, body: { error: { code: 'INVALID_GOAL', message: 'Goal must be valid.' } } },
    {
      statusCode: 504,
      body: {
        runId: 'run-id',
        status: 'failed',
        answer: null,
        trace: [],
        error: { code: 'AGENT_TIMEOUT', message: 'Agent execution exceeded its time limit.' }
      }
    }
  ]);
});

test('retained internal route requires explicit local opt-in and never runs for denied origins', async t => {
  const app = express();app.use(createCorsPolicy(parseCorsAllowedOrigins()));app.use(express.json());
  let enabled = false;let calls = 0;
  const run = async goal => { calls++;return { status: 'completed', answer: goal, trace: [] }; };
  const guard = (req, res, next) => createDashboardHandlers({}, { localOnlyEnabled: enabled }).middleware(req, res, next);
  registerInternalAgentRoute(app, run, guard);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const invoke = origin => fetch(`http://127.0.0.1:${server.address().port}/api/agent/run`, { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ goal: 'test goal' }) });
  assert.equal((await invoke('http://localhost:4200')).status, 403);assert.equal(calls, 0);
  enabled = true;assert.equal((await invoke('https://untrusted.example')).status, 403);assert.equal(calls, 0);
  const allowed = await invoke('http://localhost:4200');assert.equal(allowed.status, 200);assert.equal(calls, 1);
  assert.equal((await allowed.json()).answer, 'test goal');
  let reached = false;
  guard({ socket: { remoteAddress: '203.0.113.2' } }, { status(code) { assert.equal(code, 403);return this; }, json() {} }, () => { reached = true; });
  assert.equal(reached, false);
});

test('internal route cannot be mounted accidentally without a local guard', () => {
  assert.throws(() => registerInternalAgentRoute(express(), async () => ({})), /explicit local guard/);
});
