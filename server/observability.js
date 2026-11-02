import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

export function createExecutionTrace(scope, documentId) {
  return {
    traceId: randomUUID(),
    status: 'error',
    totalDurationMs: 0,
    steps: [],
    retrieval: {
      strategy: 'sqlite-fts5',
      retrievedChunkCount: 0,
      scope,
      documentId
    },
    modelIdentifier: null,
    timestamp: new Date().toISOString()
  };
}

export function elapsedMilliseconds(startedAt) {
  const duration = performance.now() - startedAt;
  return Number.isFinite(duration) ? Math.max(0, duration) : 0;
}

export async function measureStep(trace, name, operation, statusForResult = () => 'success') {
  const startedAt = performance.now();
  try {
    const result = await operation();
    trace.steps.push({ name, status: statusForResult(result), durationMs: elapsedMilliseconds(startedAt) });
    return result;
  } catch (error) {
    trace.steps.push({ name, status: 'error', durationMs: elapsedMilliseconds(startedAt) });
    throw error;
  }
}

function validTokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function extractProviderUsage(providerUsage) {
  const inputTokens = validTokenCount(providerUsage?.prompt_tokens);
  const outputTokens = validTokenCount(providerUsage?.completion_tokens);
  const totalTokens = validTokenCount(providerUsage?.total_tokens);
  const source = inputTokens !== null || outputTokens !== null || totalTokens !== null
    ? 'provider'
    : 'unavailable';

  return { inputTokens, outputTokens, totalTokens, source };
}

export function loadModelPricing(serializedPricing = process.env.GROQ_MODEL_PRICING) {
  if (!serializedPricing) return {};

  try {
    const parsed = JSON.parse(serializedPricing);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(Object.entries(parsed).flatMap(([model, rates]) => {
      const inputUsdPerMillion = rates?.inputUsdPerMillion;
      const outputUsdPerMillion = rates?.outputUsdPerMillion;
      if (
        typeof inputUsdPerMillion !== 'number' || !Number.isFinite(inputUsdPerMillion) || inputUsdPerMillion <= 0 ||
        typeof outputUsdPerMillion !== 'number' || !Number.isFinite(outputUsdPerMillion) || outputUsdPerMillion <= 0
      ) return [];
      return [[model, { inputUsdPerMillion, outputUsdPerMillion }]];
    }));
  } catch {
    return {};
  }
}

// Accept fractional averages for simulations; actual provider usage is validated separately.
export function calculateTokenCost(inputTokens, outputTokens, rates) {
  if (!rates || ![rates.inputUsdPerMillion, rates.outputUsdPerMillion].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0) || ![inputTokens, outputTokens].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return null;
  const amount = (inputTokens * rates.inputUsdPerMillion + outputTokens * rates.outputUsdPerMillion) / 1_000_000;
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function estimateCost(modelIdentifier, usage, pricing) {
  const rates = modelIdentifier && Object.hasOwn(pricing, modelIdentifier) ? pricing[modelIdentifier] : null;
  const hasUsage = validTokenCount(usage?.inputTokens) !== null && validTokenCount(usage?.outputTokens) !== null && usage?.source === 'provider';
  let unavailableReason = !rates
    ? 'model_pricing_not_configured'
    : !hasUsage
      ? 'provider_usage_unavailable'
      : null;

  const amount = unavailableReason ? null : calculateTokenCost(usage.inputTokens, usage.outputTokens, rates);
  if (!unavailableReason && amount === null) unavailableReason = 'numeric_overflow';

  return {
    estimatedCostUsd: unavailableReason ? null : amount,
    currency: 'USD',
    pricingModelId: modelIdentifier ?? null,
    pricingSource: rates ? 'configured' : null,
    isEstimate: true,
    unavailableReason
  };
}
