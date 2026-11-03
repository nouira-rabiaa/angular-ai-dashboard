-- The existing document store owns chunks and its FTS5 index; no copies or grants by default.
CREATE TABLE support_agent_documents (
  agent_id TEXT NOT NULL REFERENCES support_agents(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES documents_history(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agent_id, document_id)
);
CREATE INDEX support_agent_documents_document ON support_agent_documents(document_id);
