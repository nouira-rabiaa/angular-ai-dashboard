CREATE TABLE inference_history (
  trace_id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  model_identifier TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'no_match', 'error')),
  scope TEXT NOT NULL CHECK (scope IN ('document', 'all')),
  document_id INTEGER REFERENCES documents_history(id) ON DELETE SET NULL,
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  total_tokens INTEGER CHECK (total_tokens IS NULL OR total_tokens >= 0),
  usage_source TEXT NOT NULL CHECK (usage_source IN ('provider', 'unavailable')),
  estimated_cost_usd REAL CHECK (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0),
  pricing_model_id TEXT,
  pricing_source TEXT,
  total_duration_ms REAL NOT NULL CHECK (total_duration_ms >= 0),
  retrieval_duration_ms REAL CHECK (retrieval_duration_ms IS NULL OR retrieval_duration_ms >= 0),
  context_preparation_duration_ms REAL CHECK (context_preparation_duration_ms IS NULL OR context_preparation_duration_ms >= 0),
  groq_duration_ms REAL CHECK (groq_duration_ms IS NULL OR groq_duration_ms >= 0),
  retrieved_chunk_count INTEGER NOT NULL DEFAULT 0 CHECK (retrieved_chunk_count >= 0)
);

CREATE INDEX inference_history_occurred_at_idx ON inference_history (occurred_at DESC, trace_id DESC);
CREATE INDEX inference_history_status_occurred_at_idx ON inference_history (status, occurred_at DESC, trace_id DESC);
CREATE INDEX inference_history_scope_occurred_at_idx ON inference_history (scope, occurred_at DESC, trace_id DESC);

CREATE TABLE inference_steps (
  trace_id TEXT NOT NULL REFERENCES inference_history(trace_id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL CHECK (step_index >= 0),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'no_match', 'error')),
  duration_ms REAL NOT NULL CHECK (duration_ms >= 0),
  PRIMARY KEY (trace_id, step_index)
);

CREATE INDEX inference_steps_trace_order_idx ON inference_steps (trace_id, step_index);
CREATE INDEX documents_history_created_at_idx ON documents_history (created_at DESC, id DESC);
CREATE INDEX document_chunks_document_id_idx ON document_chunks (document_id);
CREATE INDEX form_submissions_created_at_idx ON form_submissions (created_at DESC, id DESC);
