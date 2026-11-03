-- Local plaintext history; bounded by application quotas, not an automatic expiry promise.
CREATE TABLE support_conversations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES support_agents(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status = 'open'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX support_conversations_agent ON support_conversations(agent_id, updated_at DESC, id);
CREATE TABLE support_messages (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','completed','abstained','failed')),
  created_at TEXT NOT NULL,
  sources_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(conversation_id, request_id, role)
);
CREATE INDEX support_messages_conversation ON support_messages(conversation_id, sequence);
CREATE UNIQUE INDEX support_messages_one_pending ON support_messages(conversation_id) WHERE status = 'pending';
-- A monotonically increasing revision also detects remove/re-add during an inference.
ALTER TABLE support_agents ADD COLUMN knowledge_revision INTEGER NOT NULL DEFAULT 0;
CREATE TRIGGER support_scope_insert AFTER INSERT ON support_agent_documents BEGIN
  UPDATE support_agents SET knowledge_revision = knowledge_revision + 1 WHERE id = new.agent_id;
END;
CREATE TRIGGER support_scope_delete AFTER DELETE ON support_agent_documents BEGIN
  UPDATE support_agents SET knowledge_revision = knowledge_revision + 1 WHERE id = old.agent_id;
END;
