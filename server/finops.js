import { calculateTokenCost, loadModelPricing } from './observability.js';

const DAY = 86_400_000;
const isoDay = date => date.toISOString().slice(0, 10);
const addDays = (day, count) => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY));

export function budgetStatus(amount, budget, complete = true) {
  if (budget === null || amount === null) return { percent: null, level: 'unavailable' };
  const percent = amount / budget * 100;
  return { percent: Number.isFinite(percent) ? percent : null, level: percent >= 100 ? 'exceeded' : percent >= 80 ? 'warning' : complete ? 'ok' : 'unavailable' };
}

// Calendar-day average, excluding the current incomplete UTC day. No extrapolation of missing prices.
export function projectCosts(dailyRows, today, month, monthlyBudgetUsd) {
  const start = dailyRows[0]?.date ?? null;
  const sampleDays = start ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY) : 0;
  const requestCount = dailyRows.reduce((n, row) => n + row.requestCount, 0);
  const pricedRequestCount = dailyRows.reduce((n, row) => n + row.pricedRequestCount, 0);
  const unpricedRequestCount = requestCount - pricedRequestCount;
  const activeDays = dailyRows.filter(row => row.pricedRequestCount > 0).length;
  const knownCost = dailyRows.reduce((n, row) => n + (row.estimatedCostUsd ?? 0), 0);
  const overflow = !Number.isFinite(knownCost) || (sampleDays > 0 && !Number.isFinite(knownCost / sampleDays * 30));
  const reason = overflow ? 'numeric_overflow' : unpricedRequestCount > 0 ? 'incomplete_cost_coverage'
    : sampleDays < 7 || pricedRequestCount < 10 || activeDays < 3 ? 'insufficient_history' : null;
  const dailyRateUsd = reason ? null : knownCost / sampleDays;
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthDays = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  // Include today in the remaining interval; its already recorded cost is not counted twice.
  const remainingDays = monthDays - Number(today.slice(8)) + 1;
  const monthComplete = month.requestCount === month.pricedRequestCount;
  const observedUsd = month.pricedRequestCount > 0 ? Number.isFinite(month.estimatedCostUsd) ? month.estimatedCostUsd : null : month.requestCount === 0 && sampleDays > 0 ? 0 : null;
  const projectedMonthEnd = dailyRateUsd === null || !monthComplete || observedUsd === null ? null
    : (observedUsd ?? 0) + dailyRateUsd * (remainingDays - 1) + Math.max(0, dailyRateUsd - (month.todayEstimatedCostUsd ?? 0));
  const historical = [];
  if (start) {
    const rows = new Map(dailyRows.map(row => [row.date, row]));
    for (let day = start; day < today; day = addDays(day, 1)) {
      const row = rows.get(day);
      historical.push({ date: day, estimatedCostUsd: row ? row.pricedRequestCount === row.requestCount ? row.estimatedCostUsd : null : 0 });
    }
  }
  return {
    currency: 'USD', isEstimate: true, today, monthStart, monthDays,
    sample: { from: start, to: addDays(today, -1), days: sampleDays, activeDays, requestCount, pricedRequestCount, unpricedRequestCount },
    status: reason ? reason === 'insufficient_history' ? 'insufficient_data' : 'unavailable' : 'ready', reason,
    dailyRateUsd, projected7DaysUsd: dailyRateUsd === null ? null : dailyRateUsd * 7,
    projected30DaysUsd: dailyRateUsd === null ? null : dailyRateUsd * 30,
    observedMonthUsd: observedUsd, monthRequestCount: month.requestCount,
    monthPricedRequestCount: month.pricedRequestCount, monthCoverageComplete: monthComplete,
    projectedMonthEndUsd: Number.isFinite(projectedMonthEnd) ? projectedMonthEnd : null, monthlyBudgetUsd,
    observedBudget: budgetStatus(observedUsd, monthlyBudgetUsd, monthComplete),
    projectedBudget: budgetStatus(Number.isFinite(projectedMonthEnd) ? projectedMonthEnd : null, monthlyBudgetUsd),
    historical,
    projected: dailyRateUsd === null ? [] : Array.from({ length: 30 }, (_, index) => ({ date: addDays(today, index), estimatedCostUsd: dailyRateUsd }))
  };
}

export function createFinopsHandlers(db, { pricing = loadModelPricing(), now = () => new Date() } = {}) {
  const readBudget = () => db.prepare('SELECT monthly_budget_usd AS amount FROM finops_settings WHERE id = 1').get()?.amount ?? null;
  const summary = (_req, res) => {
    try {
      const asOf = now();
      const today = isoDay(asOf);
      const start = addDays(today, -30);
      const daily = db.prepare(`SELECT substr(occurred_at, 1, 10) AS date, COUNT(*) AS requestCount,
        COUNT(estimated_cost_usd) AS pricedRequestCount, SUM(estimated_cost_usd) AS estimatedCostUsd
        FROM inference_history WHERE occurred_at >= ? AND occurred_at < ?
        GROUP BY substr(occurred_at, 1, 10) ORDER BY date`).all(`${start}T00:00:00.000Z`, `${today}T00:00:00.000Z`);
      const monthStart = `${today.slice(0, 7)}-01T00:00:00.000Z`;
      const month = db.prepare(`SELECT COUNT(*) AS requestCount, COUNT(estimated_cost_usd) AS pricedRequestCount,
        SUM(estimated_cost_usd) AS estimatedCostUsd,
        SUM(CASE WHEN occurred_at >= ? THEN estimated_cost_usd ELSE 0 END) AS todayEstimatedCostUsd
        FROM inference_history WHERE occurred_at >= ? AND occurred_at <= ?`)
        .get(`${today}T00:00:00.000Z`, monthStart, asOf.toISOString());
      const models = db.prepare(`SELECT model_identifier AS model, COUNT(*) AS requestCount,
        COUNT(estimated_cost_usd) AS pricedRequestCount, SUM(estimated_cost_usd) AS estimatedCostUsd
        FROM inference_history WHERE occurred_at >= ? AND occurred_at <= ? GROUP BY model_identifier ORDER BY model_identifier`)
        .all(monthStart, asOf.toISOString());
      return res.json({ ...projectCosts(daily, today, month, readBudget()), models,
        pricing: Object.entries(pricing).map(([model, rates]) => ({ model, ...rates })) });
    } catch {
      return res.status(500).json({ error: 'FinOps data unavailable.' });
    }
  };
  const saveBudget = (req, res) => {
    const amount = req.body?.monthlyBudgetUsd;
    if (!req.body || Object.keys(req.body).some(key => key !== 'monthlyBudgetUsd') ||
      (amount !== null && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000))) {
      return res.status(400).json({ error: 'Invalid monthly budget.' });
    }
    try {
      db.prepare(`INSERT INTO finops_settings (id, monthly_budget_usd) VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET monthly_budget_usd = excluded.monthly_budget_usd`).run(amount);
      return res.json({ monthlyBudgetUsd: amount });
    } catch {
      return res.status(500).json({ error: 'Budget persistence unavailable.' });
    }
  };
  const simulate = (req, res) => {
    const body = req.body ?? {};
    const allowed = ['model', 'requestsPerDay', 'inputTokens', 'outputTokens', 'monthlyBudgetUsd'];
    const valid = (n, max) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
    if (Object.keys(body).some(key => !allowed.includes(key)) || typeof body.model !== 'string' || !body.model.length || body.model.length > 120 ||
      !Number.isInteger(body.requestsPerDay) || !valid(body.requestsPerDay, 1_000_000) ||
      !valid(body.inputTokens, 10_000_000) || !valid(body.outputTokens, 10_000_000) ||
      (body.monthlyBudgetUsd !== null && (!valid(body.monthlyBudgetUsd, 1_000_000_000) || body.monthlyBudgetUsd === 0))) {
      return res.status(400).json({ error: 'Invalid simulation parameters.' });
    }
    if (!Object.hasOwn(pricing, body.model)) {
      return res.json({ status: 'unavailable', reason: 'model_pricing_not_configured', costPerRequestUsd: null, monthlyCostUsd: null });
    }
    const costPerRequestUsd = calculateTokenCost(body.inputTokens, body.outputTokens, pricing[body.model]);
    if (costPerRequestUsd === null) {
      return res.json({ status: 'unavailable', reason: 'numeric_overflow', costPerRequestUsd: null, monthlyCostUsd: null });
    }
    const date = now();
    const monthDays = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    const monthlyCostUsd = costPerRequestUsd * body.requestsPerDay * monthDays;
    if (!Number.isFinite(monthlyCostUsd)) return res.json({ status: 'unavailable', reason: 'numeric_overflow', costPerRequestUsd, monthlyCostUsd: null });
    return res.json({ status: 'ready', currency: 'USD', isEstimate: true, monthDays,
      costPerRequestUsd, monthlyCostUsd,
      budget: budgetStatus(monthlyCostUsd, body.monthlyBudgetUsd) });
  };
  return { summary, saveBudget, simulate };
}

export function registerFinopsRoutes(app, handlers, guard) {
  app.get('/api/dashboard/finops', guard, handlers.summary);
  app.post('/api/dashboard/finops/budget', guard, handlers.saveBudget);
  app.post('/api/dashboard/finops/simulate', guard, handlers.simulate);
}
