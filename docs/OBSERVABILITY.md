# RAG Chat Observability

Each `/api/chat` response includes a request-local `executionTrace`, provider `usage` when Groq returns it, and an optional `estimatedCostUsd`. Trace durations use Node's monotonic high-resolution performance clock. Request prompts, retrieved excerpts, API keys, and authorization data are not written to the trace or logs.

## Pricing Configuration

Cost estimation is disabled unless `GROQ_MODEL_PRICING` is configured in the server environment. Set it to a JSON object keyed by the exact model identifier returned/used by the chat handler. Each value must provide positive, finite USD rates per one million tokens:

```json
{
  "<exact-model-id>": {
    "inputUsdPerMillion": <verified-input-rate>,
    "outputUsdPerMillion": <verified-output-rate>
  }
}
```

Obtain rates from the provider's current pricing documentation before configuring them. The application does not ship a default price list. Missing/invalid rates or unavailable provider usage produce a null estimate with an `unavailableReason`; an estimate is not a provider invoice or billed charge. Restart the server after changing the environment value.

`usage.source` is `provider` only when Groq returns token usage fields. Missing provider values are `null`; the legacy `tokens` field mirrors provider `total_tokens` and is also `null` when unavailable. No token count is estimated from text length.

## Dashboard History and Local-Only Access

The server applies additive numbered SQL migrations from `server/migrations/` after creating the existing document tables. Migration `001_inference_history.sql` creates `inference_history` and `inference_steps` plus indexes; it does not delete or rewrite existing form, document, or chunk records. The migration runner records applied filenames in `schema_migrations` and executes each migration transactionally. Inference rows contain metadata and ordered timings only. They never contain prompts, replies, excerpts, form payloads, headers, keys, or raw provider errors. A telemetry insert failure is logged with a generic message and does not fail an otherwise completed chat response. Partial traces from valid failed chat requests are also recorded; a disappearing document reference is set to null by the foreign key.

Dashboard telemetry endpoints are disabled unless `DASHBOARD_TELEMETRY_LOCAL_ONLY=true`. The Express server binds to `127.0.0.1` by default and refuses non-loopback `HOST` values. In production, the telemetry opt-in must also be explicitly true, and the bind must remain loopback. Do not expose this unauthenticated demo through a reverse proxy, tunnel, public container port, or shared network interface. CORS is not authorization. The old `/api/submissions` and `/api/dashboard/history` endpoints remain for compatibility, but form rows now return the neutral title `Form submission`, never `form_data`.

Read-only Dashboard endpoints:

- `GET /api/dashboard/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD` returns bounded period totals, status counts, average measured latency, provider token totals, estimated cost and priced/unpriced request coverage.
- `GET /api/dashboard/timeseries?from=YYYY-MM-DD&to=YYYY-MM-DD` returns daily request counts, mean measured latency, estimated cost and price coverage.
- `GET /api/dashboard/inferences?from=...&to=...&limit=25&offset=0&status=success&scope=document&model=...` returns stable paginated inference metadata.
- `GET /api/dashboard/inferences/:traceId` returns one metadata record and ordered stage timings.
- `GET /api/dashboard/documents?limit=25&offset=0` returns indexed file metadata and real chunk totals, not chunk text.
- `GET /api/dashboard/form-submissions?limit=25&offset=0&q=2026-10` returns only submission ID, date and status. Search accepts a numeric ID or ISO date prefix; form payloads are intentionally excluded.

Date ranges are limited to 366 days and page sizes to 100. Unknown cost stays null; aggregate costs include only priced requests and report priced/unpriced counts separately. These measures reduce data exposure but do not replace authentication or multi-tenancy. The Dashboard must remain a local-only demo until a later phase supplies server-side identity and authorization.
