import { isIP } from 'node:net';

const MAX_PAGE_SIZE = 100;
const MAX_DATE_RANGE_DAYS = 366;
const DEFAULT_PAGE_SIZE = 25;

function isLoopback(address) {
  if (typeof address !== 'string') return false;
  if (address === '::1' || address.startsWith('127.')) return true;
  return address.startsWith('::ffff:127.') && isIP(address) === 6;
}

export function validateDateRange(query) {
  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFrom = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const from = query.from ?? defaultFrom;
  const to = query.to ?? defaultTo;
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

  if (!validDate(from) || !validDate(to) || from > to) return null;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
  return days <= MAX_DATE_RANGE_DAYS ? { from, to } : null;
}

function parsePagination(query) {
  const limit = query.limit === undefined ? DEFAULT_PAGE_SIZE : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE ||
    !Number.isInteger(offset) || offset < 0 || offset > 1_000_000) return null;
  return { limit, offset };
}

function withinRangeClause() {
  return "occurred_at >= ? AND occurred_at < date(?, '+1 day')";
}

export function createDashboardHandlers(db, { localOnlyEnabled = false } = {}) {
  const allowLocalOnly = (req, res, next) => {
    const remoteAddress = req.socket?.remoteAddress;
    if (!localOnlyEnabled || !isLoopback(remoteAddress)) {
      return res.status(403).json({ error: 'Dashboard telemetry is available only in the enabled local demo.' });
    }
    return next();
  };

  const metrics = (req, res) => {
    const range = validateDateRange(req.query ?? {});
    if (!range) return res.status(400).json({ error: 'Invalid date range.' });

    const row = db.prepare(`
      SELECT
        COUNT(*) AS requestCount,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successCount,
        SUM(CASE WHEN status = 'no_match' THEN 1 ELSE 0 END) AS noMatchCount,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errorCount,
        AVG(total_duration_ms) AS averageLatencyMs,
        SUM(input_tokens) AS inputTokens,
        SUM(output_tokens) AS outputTokens,
        SUM(total_tokens) AS totalTokens,
        SUM(CASE WHEN estimated_cost_usd IS NOT NULL THEN estimated_cost_usd ELSE 0 END) AS pricedEstimatedCostUsd,
        SUM(CASE WHEN estimated_cost_usd IS NOT NULL THEN 1 ELSE 0 END) AS pricedRequestCount,
        SUM(CASE WHEN estimated_cost_usd IS NULL THEN 1 ELSE 0 END) AS unpricedRequestCount,
        SUM(retrieved_chunk_count) AS retrievedChunkCount
      FROM inference_history
      WHERE ${withinRangeClause()}
    `).get(`${range.from}T00:00:00.000Z`, range.to);

    return res.json({
      range,
      requestCount: row.requestCount ?? 0,
      successCount: row.successCount ?? 0,
      noMatchCount: row.noMatchCount ?? 0,
      errorCount: row.errorCount ?? 0,
      averageLatencyMs: row.averageLatencyMs ?? null,
      inputTokens: row.inputTokens ?? null,
      outputTokens: row.outputTokens ?? null,
      totalTokens: row.totalTokens ?? null,
      estimatedCostUsd: row.pricedRequestCount ? row.pricedEstimatedCostUsd : null,
      pricedRequestCount: row.pricedRequestCount ?? 0,
      unpricedRequestCount: row.unpricedRequestCount ?? 0,
      retrievedChunkCount: row.retrievedChunkCount ?? 0
    });
  };

  const timeseries = (req, res) => {
    const range = validateDateRange(req.query ?? {});
    if (!range) return res.status(400).json({ error: 'Invalid date range.' });
    const rows = db.prepare(`
      SELECT substr(occurred_at, 1, 10) AS date,
        COUNT(*) AS requestCount,
        AVG(total_duration_ms) AS averageLatencyMs,
        SUM(CASE WHEN estimated_cost_usd IS NOT NULL THEN estimated_cost_usd ELSE 0 END) AS pricedEstimatedCostUsd,
        SUM(CASE WHEN estimated_cost_usd IS NOT NULL THEN 1 ELSE 0 END) AS pricedRequestCount,
        SUM(CASE WHEN estimated_cost_usd IS NULL THEN 1 ELSE 0 END) AS unpricedRequestCount
      FROM inference_history
      WHERE ${withinRangeClause()}
      GROUP BY substr(occurred_at, 1, 10)
      ORDER BY date ASC
    `).all(`${range.from}T00:00:00.000Z`, range.to).map(row => ({
      date: row.date,
      requestCount: row.requestCount,
      averageLatencyMs: row.averageLatencyMs,
      estimatedCostUsd: row.pricedRequestCount ? row.pricedEstimatedCostUsd : null,
      pricedRequestCount: row.pricedRequestCount,
      unpricedRequestCount: row.unpricedRequestCount
    }));
    return res.json({ range, items: rows });
  };

  const inferenceHistory = (req, res) => {
    const range = validateDateRange(req.query ?? {});
    const pagination = parsePagination(req.query ?? {});
    if (!range || !pagination) return res.status(400).json({ error: 'Invalid date range or pagination.' });

    const clauses = [withinRangeClause()];
    const params = [`${range.from}T00:00:00.000Z`, range.to];
    if (req.query.status !== undefined) {
      if (!['success', 'no_match', 'error'].includes(req.query.status)) return res.status(400).json({ error: 'Invalid status filter.' });
      clauses.push('status = ?');
      params.push(req.query.status);
    }
    if (req.query.scope !== undefined) {
      if (!['all', 'document'].includes(req.query.scope)) return res.status(400).json({ error: 'Invalid scope filter.' });
      clauses.push('scope = ?');
      params.push(req.query.scope);
    }
    if (req.query.model !== undefined) {
      if (typeof req.query.model !== 'string' || req.query.model.length < 1 || req.query.model.length > 120) return res.status(400).json({ error: 'Invalid model filter.' });
      clauses.push('model_identifier = ?');
      params.push(req.query.model);
    }
    const where = clauses.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS count FROM inference_history WHERE ${where}`).get(...params).count;
    const items = db.prepare(`
      SELECT trace_id AS traceId, occurred_at AS timestamp, model_identifier AS modelIdentifier,
        status, scope, document_id AS documentId, input_tokens AS inputTokens,
        output_tokens AS outputTokens, total_tokens AS totalTokens, usage_source AS usageSource,
        estimated_cost_usd AS estimatedCostUsd, pricing_model_id AS pricingModelId,
        pricing_source AS pricingSource, total_duration_ms AS totalDurationMs,
        retrieval_duration_ms AS retrievalDurationMs,
        context_preparation_duration_ms AS contextPreparationDurationMs,
        groq_duration_ms AS groqDurationMs, retrieved_chunk_count AS retrievedChunkCount
      FROM inference_history
      WHERE ${where}
      ORDER BY occurred_at DESC, trace_id DESC
      LIMIT ? OFFSET ?
    `).all(...params, pagination.limit, pagination.offset);
    return res.json({ range, total, ...pagination, items });
  };

  const inferenceDetail = (req, res) => {
    const traceId = req.params.traceId;
    if (typeof traceId !== 'string' || traceId.length > 80 || !/^[\w-]+$/.test(traceId)) {
      return res.status(400).json({ error: 'Invalid trace ID.' });
    }
    const trace = db.prepare(`
      SELECT trace_id AS traceId, occurred_at AS timestamp, model_identifier AS modelIdentifier,
        status, scope, document_id AS documentId, input_tokens AS inputTokens,
        output_tokens AS outputTokens, total_tokens AS totalTokens, usage_source AS usageSource,
        estimated_cost_usd AS estimatedCostUsd, pricing_model_id AS pricingModelId,
        pricing_source AS pricingSource, total_duration_ms AS totalDurationMs,
        retrieval_duration_ms AS retrievalDurationMs,
        context_preparation_duration_ms AS contextPreparationDurationMs,
        groq_duration_ms AS groqDurationMs, retrieved_chunk_count AS retrievedChunkCount
      FROM inference_history WHERE trace_id = ?
    `).get(traceId);
    if (!trace) return res.status(404).json({ error: 'Trace not found.' });
    const steps = db.prepare(`
      SELECT step_index AS stepIndex, name, status, duration_ms AS durationMs
      FROM inference_steps WHERE trace_id = ? ORDER BY step_index ASC
    `).all(traceId);
    return res.json({ ...trace, steps });
  };

  const documents = (req, res) => {
    const pagination = parsePagination(req.query ?? {});
    if (!pagination) return res.status(400).json({ error: 'Invalid pagination.' });
    const total = db.prepare('SELECT COUNT(*) AS count FROM documents_history').get().count;
    const totalChunks = db.prepare('SELECT COUNT(*) AS count FROM document_chunks').get().count;
    const items = db.prepare(`
      SELECT d.id AS documentId, d.filename, d.file_type AS fileType,
        d.status, d.created_at AS createdAt,
        COUNT(c.id) AS chunksCount, d.character_count AS characterCount
      FROM documents_history d
      LEFT JOIN document_chunks c ON c.document_id = d.id
      GROUP BY d.id
      ORDER BY d.created_at DESC, d.id DESC
      LIMIT ? OFFSET ?
    `).all(pagination.limit, pagination.offset);
    return res.json({ total, totalChunks, ...pagination, items });
  };

  const formSubmissions = (req, res) => {
    const pagination = parsePagination(req.query ?? {});
    if (!pagination) return res.status(400).json({ error: 'Invalid pagination.' });
    const search = req.query.q === undefined ? '' : req.query.q.trim();
    if (typeof search !== 'string' || search.length > 10) return res.status(400).json({ error: 'Invalid search query.' });
    let where = '';
    let searchParams = [];
    if (search) {
      if (/^\d+$/.test(search)) {
        where = 'WHERE id = ?';
        searchParams = [Number(search)];
      } else if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(search)) {
        const from = search.length === 4 ? `${search}-01-01` : search.length === 7 ? `${search}-01` : search;
        const next = search.length === 4
          ? `${Number(search) + 1}-01-01`
          : search.length === 7
            ? `${search.slice(0, 4)}-${String(Number(search.slice(5, 7)) + 1).padStart(2, '0')}-01`
            : new Date(Date.parse(`${search}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
        where = 'WHERE created_at >= ? AND created_at < ?';
        searchParams = [`${from}T00:00:00.000Z`, `${next}T00:00:00.000Z`];
      } else {
        return res.status(400).json({ error: 'Search by numeric ID or ISO date prefix.' });
      }
    }
    const total = db.prepare(`SELECT COUNT(*) AS count FROM form_submissions ${where}`).get(...searchParams).count;
    const items = db.prepare(`
      SELECT id, created_at AS createdAt, 'submitted' AS status
      FROM form_submissions ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...searchParams, pagination.limit, pagination.offset);
    return res.json({ total, ...pagination, items });
  };

  return {
    middleware: allowLocalOnly,
    metrics,
    timeseries,
    inferenceHistory,
    inferenceDetail,
    documents,
    formSubmissions
  };
}

export function registerDashboardRoutes(app, handlers) {
  const guarded = handlers.middleware;
  app.get('/api/dashboard/metrics', guarded, handlers.metrics);
  app.get('/api/dashboard/timeseries', guarded, handlers.timeseries);
  app.get('/api/dashboard/inferences', guarded, handlers.inferenceHistory);
  app.get('/api/dashboard/inferences/:traceId', guarded, handlers.inferenceDetail);
  app.get('/api/dashboard/documents', guarded, handlers.documents);
  app.get('/api/dashboard/form-submissions', guarded, handlers.formSubmissions);
}
