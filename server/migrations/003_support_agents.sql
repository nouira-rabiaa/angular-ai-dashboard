-- Configuration only. No conversations, document bindings or execution permissions yet.
CREATE TABLE support_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  description TEXT NOT NULL CHECK(length(description) <= 500),
  role TEXT NOT NULL CHECK(length(role) BETWEEN 1 AND 200),
  system_instructions TEXT NOT NULL CHECK(length(system_instructions) BETWEEN 1 AND 12000),
  tone TEXT NOT NULL CHECK(tone IN ('professional','friendly','concise')),
  language TEXT NOT NULL CHECK(language IN ('fr','en','ar')),
  model TEXT NOT NULL CHECK(model = 'openai/gpt-oss-120b'),
  temperature REAL NOT NULL CHECK(temperature >= 0 AND temperature <= 2),
  max_output_tokens INTEGER NOT NULL CHECK(max_output_tokens BETWEEN 1 AND 4096),
  fallback_message TEXT NOT NULL CHECK(length(fallback_message) BETWEEN 1 AND 2000),
  escalation_enabled INTEGER NOT NULL CHECK(escalation_enabled IN (0,1)),
  status TEXT NOT NULL CHECK(status IN ('active','inactive')),
  owner_id TEXT,
  organization_id TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX support_agents_updated ON support_agents(updated_at DESC, id);
