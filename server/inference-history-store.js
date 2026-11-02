const STAGE_COLUMNS = Object.freeze({
  'sqlite-fts5-retrieval': 'retrieval_duration_ms',
  'context-preparation': 'context_preparation_duration_ms',
  'groq-inference': 'groq_duration_ms'
});

function nonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function persistInferenceTrace(db, { trace, usage, cost }) {
  if (!trace || typeof trace.traceId !== 'string' || !trace.traceId.trim()) return false;

  db.pragma('foreign_keys = ON');
  const stageDurations = Object.fromEntries(Object.values(STAGE_COLUMNS).map(column => [column, null]));
  for (const step of trace.steps ?? []) {
    const column = STAGE_COLUMNS[step.name];
    if (column) stageDurations[column] = nonNegativeNumber(step.durationMs);
  }

  const documentId = trace.retrieval?.scope === 'document' &&
    Number.isSafeInteger(trace.retrieval.documentId) && trace.retrieval.documentId > 0
    ? trace.retrieval.documentId
    : null;
  const insertHistory = db.prepare(`
    INSERT INTO inference_history (
      trace_id, occurred_at, model_identifier, status, scope, document_id,
      input_tokens, output_tokens, total_tokens, usage_source,
      estimated_cost_usd, pricing_model_id, pricing_source,
      total_duration_ms, retrieval_duration_ms, context_preparation_duration_ms,
      groq_duration_ms, retrieved_chunk_count
    ) VALUES (
      @traceId, @occurredAt, @modelIdentifier, @status, @scope, @documentId,
      @inputTokens, @outputTokens, @totalTokens, @usageSource,
      @estimatedCostUsd, @pricingModelId, @pricingSource,
      @totalDurationMs, @retrievalDurationMs, @contextPreparationDurationMs,
      @groqDurationMs, @retrievedChunkCount
    )
  `);
  const insertStep = db.prepare(`
    INSERT INTO inference_steps (trace_id, step_index, name, status, duration_ms)
    VALUES (?, ?, ?, ?, ?)
  `);
  const documentExists = db.prepare('SELECT 1 FROM documents_history WHERE id = ?');

  db.transaction(() => {
    const storedDocumentId = documentId !== null && documentExists.get(documentId)
      ? documentId
      : null;
    insertHistory.run({
      traceId: trace.traceId,
      occurredAt: typeof trace.timestamp === 'string' ? trace.timestamp : new Date().toISOString(),
      modelIdentifier: typeof trace.modelIdentifier === 'string' ? trace.modelIdentifier : null,
      status: ['success', 'no_match', 'error'].includes(trace.status) ? trace.status : 'error',
      scope: trace.retrieval?.scope === 'document' ? 'document' : 'all',
      documentId: storedDocumentId,
      inputTokens: nonNegativeInteger(usage?.inputTokens),
      outputTokens: nonNegativeInteger(usage?.outputTokens),
      totalTokens: nonNegativeInteger(usage?.totalTokens),
      usageSource: usage?.source === 'provider' ? 'provider' : 'unavailable',
      estimatedCostUsd: nonNegativeNumber(cost?.estimatedCostUsd),
      pricingModelId: typeof cost?.pricingModelId === 'string' ? cost.pricingModelId : null,
      pricingSource: cost?.pricingSource === 'configured' ? 'configured' : null,
      totalDurationMs: nonNegativeNumber(trace.totalDurationMs) ?? 0,
      retrievalDurationMs: stageDurations.retrieval_duration_ms,
      contextPreparationDurationMs: stageDurations.context_preparation_duration_ms,
      groqDurationMs: stageDurations.groq_duration_ms,
      retrievedChunkCount: nonNegativeInteger(trace.retrieval?.retrievedChunkCount) ?? 0
    });

    (trace.steps ?? []).forEach((step, index) => {
      const duration = nonNegativeNumber(step.durationMs);
      if (duration === null || typeof step.name !== 'string' || !step.name) return;
      const status = ['success', 'no_match', 'error'].includes(step.status) ? step.status : 'error';
      insertStep.run(trace.traceId, index, step.name, status, duration);
    });
  })();

  return true;
}
