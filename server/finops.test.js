import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import Database from 'better-sqlite3';
import { projectCosts, budgetStatus, createFinopsHandlers, registerFinopsRoutes } from './finops.js';
import { estimateCost, loadModelPricing } from './observability.js';
import { createDashboardHandlers } from './dashboard-routes.js';
import { createCorsPolicy } from './cors-policy.js';
import { runMigrations } from './migration-runner.js';

const pricing = { model: { inputUsdPerMillion: 2, outputUsdPerMillion: 4 } };
const days = () => Array.from({ length: 10 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, requestCount: 2, pricedRequestCount: 2, estimatedCostUsd: 2 }));
const month = { requestCount: 22, pricedRequestCount: 22, estimatedCostUsd: 25, todayEstimatedCostUsd: 5 };

test('projects seven/thirty days and month end without double counting today', () => {
  const result = projectCosts(days(), '2026-10-11', month, 100);
  assert.equal(result.dailyRateUsd, 2);
  assert.equal(result.projected7DaysUsd, 14);
  assert.equal(result.projected30DaysUsd, 60);
  assert.equal(result.projectedMonthEndUsd, 65);
  assert.equal(result.sample.days, 10);
  assert.equal(result.sample.pricedRequestCount, 20);
  assert.equal(result.projected.length, 30);
  assert.equal(result.projected[0].date, '2026-10-11');
  assert.equal(result.isEstimate, true);
});

test('insufficient history, low request volume and too few active days suppress predictions', () => {
  for (const rows of [[], days().slice(4), days().map(row => ({ ...row, requestCount: 0, pricedRequestCount: 0 }))]) {
    const result = projectCosts(rows, '2026-10-11', month, null);
    assert.equal(result.status, 'insufficient_data'); assert.equal(result.projected30DaysUsd, null);
    assert.equal(result.projected7DaysUsd, null); assert.deepEqual(result.projected, []);
  }
  assert.equal(projectCosts([days()[0], days()[9]], '2026-10-11', month, null).status, 'insufficient_data');
});

test('unpriced requests remain unavailable; month partial coverage prevents end-month projection', () => {
  const rows = days(); rows[0].pricedRequestCount = 1;
  const result = projectCosts(rows, '2026-10-11', month, 100);
  assert.equal(result.status, 'unavailable');assert.equal(result.projected30DaysUsd, null);
  assert.equal(result.historical[0].estimatedCostUsd, null);
  const partial = projectCosts(days(), '2026-10-11', { ...month, pricedRequestCount: 21 }, 100);
  assert.equal(partial.projectedMonthEndUsd, null);assert.equal(partial.observedMonthUsd, 25);
  assert.equal(partial.monthCoverageComplete, false);assert.equal(partial.observedBudget.level, 'unavailable');
});

test('calendar gaps count as no recorded activity and month boundaries use UTC/leap years', () => {
  const rows = days().filter((_, i) => i !== 4);
  const result = projectCosts(rows, '2026-10-11', month, null);
  assert.equal(result.sample.days, 10);assert.equal(result.dailyRateUsd, 1.8);
  assert.deepEqual(result.historical[4], { date: '2026-10-05', estimatedCostUsd: 0 });
  const leap = projectCosts([], '2028-02-29', { requestCount: 0, pricedRequestCount: 0, estimatedCostUsd: null }, null);
  assert.equal(leap.monthDays, 29);assert.equal(leap.observedMonthUsd, null);
});

test('budget thresholds are inclusive, distinguish unknown/partial coverage and keep zero costs valid', () => {
  for (const [amount, level] of [[0, 'ok'], [79.99, 'ok'], [80, 'warning'], [99.99, 'warning'], [100, 'exceeded'], [120, 'exceeded']]) {
    assert.equal(budgetStatus(amount, 100).level, level);
  }
  assert.equal(budgetStatus(null, 100).level, 'unavailable');assert.equal(budgetStatus(20, null).level, 'unavailable');
  assert.equal(budgetStatus(79, 100, false).level, 'unavailable');assert.equal(budgetStatus(80, 100, false).level, 'warning');
  assert.equal(budgetStatus(100, 100, false).level, 'exceeded');
});

test('cost estimator handles missing tokens, zero tokens, inherited names and invalid prices', () => {
  for (const usage of [{ source: 'provider' }, { inputTokens: 1, outputTokens: null, source: 'provider' }, { inputTokens: -1, outputTokens: 1, source: 'provider' }]) {
    assert.equal(estimateCost('model', usage, pricing).estimatedCostUsd, null);
  }
  assert.equal(estimateCost('model', { inputTokens: 0, outputTokens: 0, source: 'provider' }, pricing).estimatedCostUsd, 0);
  assert.equal(estimateCost('constructor', { inputTokens: 1, outputTokens: 1, source: 'provider' }, pricing).estimatedCostUsd, null);
  assert.deepEqual(loadModelPricing('{"bad":{"inputUsdPerMillion":0,"outputUsdPerMillion":2}}'), {});
  const overflow = estimateCost('huge', { inputTokens: 10, outputTokens: 10, source: 'provider' }, { huge: { inputUsdPerMillion: 1e308, outputUsdPerMillion: 1e308 } });
  assert.equal(overflow.estimatedCostUsd, null);assert.equal(overflow.unavailableReason, 'numeric_overflow');
});

function database() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE documents_history (id INTEGER PRIMARY KEY, created_at TEXT);
    CREATE TABLE document_chunks (id INTEGER PRIMARY KEY, document_id INTEGER);
    CREATE TABLE form_submissions (id INTEGER PRIMARY KEY, created_at TEXT);`);
  runMigrations(db);return db;
}
async function withServer(run, { enabled = true, prices = pricing } = {}) {
  const db = database();const app = express();app.use(createCorsPolicy(new Set(['http://localhost:4200'])));app.use(express.json());
  registerFinopsRoutes(app, createFinopsHandlers(db, { pricing: prices, now: () => new Date('2026-10-11T12:00:00Z') }), createDashboardHandlers(db, { localOnlyEnabled: enabled }).middleware);
  const server = app.listen(0, '127.0.0.1');await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}/api/dashboard/finops`, db); }
  finally { await new Promise(resolve => server.close(resolve)); db.close(); }
}
const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const scenario = { model: 'model', requestsPerDay: 100, inputTokens: 1000, outputTokens: 500, monthlyBudgetUsd: 10 };

test('simulation uses only configured prices and actual calendar month length', async () => {
  await withServer(async url => {
    const res = await fetch(url + '/simulate', post(scenario));assert.equal(res.status, 200);
    const result = await res.json();assert.equal(result.costPerRequestUsd, 0.004);assert.equal(result.monthlyCostUsd, 12.4);
    assert.equal(result.monthDays, 31);assert.equal(result.budget.level, 'exceeded');
    const unknown = await (await fetch(url + '/simulate', post({ ...scenario, model: 'missing' }))).json();
    assert.equal(unknown.status, 'unavailable');assert.equal(unknown.monthlyCostUsd, null);
    const zero = await (await fetch(url + '/simulate', post({ ...scenario, requestsPerDay: 0 }))).json();assert.equal(zero.monthlyCostUsd, 0);
  });
});

test('invalid simulation and budget parameters return 400 without storing arbitrary settings', async () => {
  await withServer(async (url, db) => {
    for (const change of [{ requestsPerDay: -1 }, { requestsPerDay: 1.5 }, { inputTokens: null }, { outputTokens: '100' }, { model: '' }, { model: 'constructor', extra: 1 }, { monthlyBudgetUsd: 0 }, { requestsPerDay: 1000001 }]) {
      assert.equal((await fetch(url + '/simulate', post({ ...scenario, ...change }))).status, 400);
    }
    for (const body of [{}, { monthlyBudgetUsd: -1 }, { monthlyBudgetUsd: '10' }, { monthlyBudgetUsd: 10, unexpected: true }]) {
      assert.equal((await fetch(url + '/budget', { ...post(body) })).status, 400);
    }
    assert.equal(db.prepare('SELECT count(*) AS n FROM finops_settings').get().n, 0);
  });
});

test('budget persists in SQLite, supports disabling, and summary reports pricing and empty states', async () => {
  await withServer(async url => {
    const response = await fetch(url + '/budget', { ...post({ monthlyBudgetUsd: 100 }) });assert.equal(response.status, 200);
    let summary = await (await fetch(url)).json();assert.equal(summary.monthlyBudgetUsd, 100);
    assert.equal(summary.status, 'insufficient_data');assert.equal(summary.observedMonthUsd, null);assert.equal(summary.pricing[0].model, 'model');
    await fetch(url + '/budget', { ...post({ monthlyBudgetUsd: null }) });
    summary = await (await fetch(url)).json();assert.equal(summary.monthlyBudgetUsd, null);
  });
});

test('all FinOps endpoints retain local telemetry guard', async () => {
  await withServer(async url => {
    assert.equal((await fetch(url)).status, 403);
    assert.equal((await fetch(url + '/simulate', post(scenario))).status, 403);
    assert.equal((await fetch(url + '/budget', { ...post({ monthlyBudgetUsd: 10 }) })).status, 403);
  }, { enabled: false });
  const db = database();let denied = false;
  createDashboardHandlers(db, { localOnlyEnabled: true }).middleware({ socket: { remoteAddress: '203.0.113.1' } }, { status(code) { assert.equal(code, 403);return { json() { denied = true; } }; } }, () => assert.fail('remote request allowed'));
  assert(denied);db.close();
});

test('summary aggregates real stored daily/model costs, excludes today from sample and reports DB failures safely', async () => {
  await withServer(async (url, db) => {
    const insert = db.prepare(`INSERT INTO inference_history (trace_id, occurred_at, model_identifier, status, scope, usage_source, total_duration_ms, estimated_cost_usd)
      VALUES (?, ?, 'model', 'success', 'all', 'provider', 1, ?)`);
    for (let day = 1; day <= 10; day++) for (let request = 0; request < 2; request++) insert.run(`${day}-${request}`, `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`, 1);
    insert.run('today', '2026-10-11T10:00:00.000Z', 5);
    const summary = await (await fetch(url)).json();assert.equal(summary.projected30DaysUsd, 60);assert.equal(summary.projectedMonthEndUsd, 65);
    assert.equal(summary.models[0].estimatedCostUsd, 25);assert.equal(summary.sample.requestCount, 20);
    db.exec('DROP TABLE finops_settings');
    const error = await fetch(url);assert.equal(error.status, 500);assert.deepEqual(await error.json(), { error: 'FinOps data unavailable.' });
    assert.equal((await fetch(url + '/budget', { ...post({ monthlyBudgetUsd: 10 }) })).status, 500);
  });
});

test('fractional average tokens are supported for scenarios and leap-year month length is explicit', () => {
  const db = database();const handler = createFinopsHandlers(db, { pricing, now: () => new Date('2028-02-10T12:00:00Z') });
  let result;
  handler.simulate({ body: { ...scenario, inputTokens: 1000.5 } }, { json(body) { result = body; } });
  assert.equal(result.monthDays, 29);assert.equal(result.costPerRequestUsd, 0.004001);
  assert.ok(Math.abs(result.monthlyCostUsd - 11.6029) < 1e-10);db.close();
});

test('observed and projected thresholds are independent; zero recorded month is not missing pricing', () => {
  const projected = projectCosts(days(), '2026-10-11', month, 60);
  assert.equal(projected.observedBudget.level, 'ok');assert.equal(projected.projectedBudget.level, 'exceeded');
  const monthUnknown = projectCosts(days(), '2026-10-11', { requestCount: 1, pricedRequestCount: 0, estimatedCostUsd: null }, 100);
  assert.equal(monthUnknown.observedMonthUsd, null);assert.equal(monthUnknown.projectedMonthEndUsd, null);
  const zero = projectCosts(days(), '2026-10-11', { requestCount: 0, pricedRequestCount: 0, estimatedCostUsd: null }, 100);
  assert.equal(zero.observedMonthUsd, 0);assert.equal(zero.observedBudget.level, 'ok');
  const todayOnly = projectCosts([], '2026-10-11', { requestCount: 1, pricedRequestCount: 1, estimatedCostUsd: 100 }, 100);
  assert.equal(todayOnly.observedBudget.level, 'exceeded');assert.equal(todayOnly.projectedMonthEndUsd, null);
});

test('configured budget survives closing/reopening an in-memory database image and idempotent migrations', () => {
  const db = database();const { saveBudget } = createFinopsHandlers(db);let result;
  saveBudget({ body: { monthlyBudgetUsd: 125 } }, { json(body) { result = body; } });assert.equal(result.monthlyBudgetUsd, 125);
  const image = db.serialize();db.close();
  const reopened = new Database(image);runMigrations(reopened);
  assert.equal(reopened.prepare('SELECT monthly_budget_usd AS amount FROM finops_settings WHERE id=1').get().amount, 125);reopened.close();
});

test('existing CORS policy permits browser POST budget/simulation and rejects unapproved origins', async () => {
  await withServer(async url => {
    for (const path of ['/budget', '/simulate']) {
      const preflight = await fetch(url + path, { method: 'OPTIONS', headers: { Origin: 'http://localhost:4200', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
      assert.equal(preflight.status, 204);assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:4200');
      const bad = await fetch(url + path, { ...post(path === '/budget' ? { monthlyBudgetUsd: 100 } : scenario), headers: { 'Content-Type': 'application/json', Origin: 'https://unapproved.example' } });
      assert.equal(bad.status, 403);
    }
    const allowed = await fetch(url + '/budget', { ...post({ monthlyBudgetUsd: 100 }), headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:4200' } });assert.equal(allowed.status, 200);
  });
});

test('minimum sufficient sample and fully priced zero-cost usage remain calculable', () => {
  const rows = days().slice(0, 7).map(row => ({ ...row, estimatedCostUsd: 0 }));
  const result = projectCosts(rows, '2026-10-08', { requestCount: 14, pricedRequestCount: 14, estimatedCostUsd: 0, todayEstimatedCostUsd: 0 }, 100);
  assert.equal(result.status, 'ready');assert.equal(result.projected7DaysUsd, 0);assert.equal(result.projected30DaysUsd, 0);assert.equal(result.projectedMonthEndUsd, 0);
  const twoActive = [ { ...days()[0], requestCount: 10, pricedRequestCount: 10 }, { ...days()[9], requestCount: 10, pricedRequestCount: 10 } ];
  assert.equal(projectCosts(twoActive, '2026-10-11', month, 100).status, 'insufficient_data');
});

test('numeric overflow cannot become a ready forecast with silently missing amounts', () => {
  const rows = days().map(row => ({ ...row, estimatedCostUsd: 1e308 }));
  const result = projectCosts(rows, '2026-10-11', month, 100);
  assert.equal(result.status, 'unavailable');assert.equal(result.reason, 'numeric_overflow');assert.equal(result.projected7DaysUsd, null);
});
