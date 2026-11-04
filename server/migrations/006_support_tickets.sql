-- Local plaintext support records. No authenticated user identity or AI classification.
CREATE TABLE support_tickets (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id) = 36),
  agent_id TEXT NOT NULL REFERENCES support_agents(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES support_conversations(id) ON DELETE SET NULL,
  source_message_id TEXT REFERENCES support_messages(id) ON DELETE SET NULL,
  request_id TEXT NOT NULL CHECK(length(request_id) = 36),
  request_hash TEXT NOT NULL CHECK(length(request_hash) = 64),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
  description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 4000),
  category TEXT NOT NULL CHECK(category IN ('technical','billing','account','product','defective_product','returns','delivery','general','other')),
  priority TEXT NOT NULL CHECK(priority IN ('low','medium','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','waiting','resolved','closed')),
  classification_source TEXT NOT NULL CHECK(classification_source IN ('manual','rules')),
  classification_reason TEXT NOT NULL,
  classification_confidence REAL CHECK(classification_confidence IS NULL),
  version INTEGER NOT NULL DEFAULT 1 CHECK(typeof(version) = 'integer' AND version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT,
  UNIQUE(agent_id, request_id),
  CHECK(source_message_id IS NULL OR conversation_id IS NOT NULL),
  CHECK((status = 'closed' AND closed_at IS NOT NULL) OR (status <> 'closed' AND closed_at IS NULL))
);
CREATE INDEX support_tickets_agent_updated ON support_tickets(agent_id, updated_at DESC, id);
CREATE INDEX support_tickets_agent_status ON support_tickets(agent_id, status, updated_at DESC, id);
CREATE INDEX support_tickets_conversation ON support_tickets(conversation_id);
CREATE INDEX support_tickets_source ON support_tickets(source_message_id);
CREATE TABLE support_ticket_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('created','classified','status_changed','priority_changed','category_changed','classification_changed','conversation_unlinked','source_unlinked')),
  old_value TEXT,
  new_value TEXT,
  origin TEXT NOT NULL CHECK(origin IN ('local_user','system')),
  created_at TEXT NOT NULL
);
CREATE INDEX support_ticket_events_ticket ON support_ticket_events(ticket_id, id);
CREATE TRIGGER support_ticket_events_immutable BEFORE UPDATE ON support_ticket_events BEGIN
  SELECT RAISE(ABORT, 'Ticket events are immutable');
END;
CREATE TRIGGER support_ticket_ownership_insert BEFORE INSERT ON support_tickets BEGIN
  SELECT CASE WHEN NEW.conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM support_conversations WHERE id = NEW.conversation_id AND agent_id = NEW.agent_id
  ) THEN RAISE(ABORT, 'Invalid ticket conversation') END;
  SELECT CASE WHEN NEW.source_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM support_messages WHERE id = NEW.source_message_id AND conversation_id = NEW.conversation_id
  ) THEN RAISE(ABORT, 'Invalid ticket source') END;
END;
CREATE TRIGGER support_ticket_ownership_update BEFORE UPDATE OF agent_id, conversation_id, source_message_id ON support_tickets BEGIN
  SELECT CASE WHEN NEW.conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM support_conversations WHERE id = NEW.conversation_id AND agent_id = NEW.agent_id
  ) THEN RAISE(ABORT, 'Invalid ticket conversation') END;
  SELECT CASE WHEN NEW.source_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM support_messages WHERE id = NEW.source_message_id AND conversation_id = NEW.conversation_id
  ) THEN RAISE(ABORT, 'Invalid ticket source') END;
END;
-- Clear the source first so SET NULL on the conversation cannot leave an orphan source.
CREATE TRIGGER support_ticket_conversation_delete BEFORE DELETE ON support_conversations BEGIN
  UPDATE support_tickets SET source_message_id = NULL WHERE conversation_id = OLD.id;
END;
CREATE TRIGGER support_ticket_source_unlink AFTER UPDATE OF source_message_id ON support_tickets
WHEN OLD.source_message_id IS NOT NULL AND NEW.source_message_id IS NULL BEGIN
  INSERT INTO support_ticket_events(ticket_id,type,old_value,new_value,origin,created_at)
    VALUES(NEW.id,'source_unlinked',OLD.source_message_id,NULL,'system',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
  UPDATE support_tickets SET version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;
CREATE TRIGGER support_ticket_conversation_unlink AFTER UPDATE OF conversation_id ON support_tickets
WHEN OLD.conversation_id IS NOT NULL AND NEW.conversation_id IS NULL BEGIN
  INSERT INTO support_ticket_events(ticket_id,type,old_value,new_value,origin,created_at)
    VALUES(NEW.id,'conversation_unlinked',OLD.conversation_id,NULL,'system',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
  UPDATE support_tickets SET version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;
