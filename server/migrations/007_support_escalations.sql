-- Declarative local human handoff. No verified identity or external action.
CREATE TABLE support_escalations (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
 ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
 reason TEXT NOT NULL CHECK(reason IN ('refund_validation','complex_complaint','insufficient_information','human_requested','other')),
 details TEXT NOT NULL CHECK(length(details)<=2000),
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','assigned','resolved','cancelled')),
 operator TEXT CHECK(operator IS NULL OR length(trim(operator)) BETWEEN 1 AND 100),
 note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=4000),
 version INTEGER NOT NULL DEFAULT 1 CHECK(typeof(version)='integer' AND version>0),
 created_at TEXT NOT NULL, assigned_at TEXT, resolved_at TEXT, cancelled_at TEXT,
 CHECK((status='requested' AND operator IS NULL AND assigned_at IS NULL AND resolved_at IS NULL AND cancelled_at IS NULL)
 OR (status='assigned' AND operator IS NOT NULL AND assigned_at IS NOT NULL AND resolved_at IS NULL AND cancelled_at IS NULL)
 OR (status='resolved' AND operator IS NOT NULL AND assigned_at IS NOT NULL AND resolved_at IS NOT NULL AND cancelled_at IS NULL AND length(trim(note))>0)
 OR (status='cancelled' AND resolved_at IS NULL AND cancelled_at IS NOT NULL AND length(trim(note))>0 AND ((operator IS NULL AND assigned_at IS NULL) OR (operator IS NOT NULL AND assigned_at IS NOT NULL))))
);
CREATE UNIQUE INDEX support_escalations_one_active ON support_escalations(ticket_id) WHERE status IN ('requested','assigned');
CREATE INDEX support_escalations_ticket ON support_escalations(ticket_id,created_at DESC,id);
CREATE TABLE support_escalation_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 escalation_id TEXT NOT NULL REFERENCES support_escalations(id) ON DELETE CASCADE,
 ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL CHECK(length(request_id)=36), request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
 type TEXT NOT NULL CHECK(type IN ('requested','assigned','noted','resolved','cancelled')),
 old_status TEXT, new_status TEXT NOT NULL,
 operator TEXT, note TEXT NOT NULL, created_at TEXT NOT NULL,
 response_json TEXT NOT NULL,
 UNIQUE(ticket_id,request_id)
);
CREATE INDEX support_escalation_events_page ON support_escalation_events(escalation_id,id);
CREATE TRIGGER support_escalation_events_immutable BEFORE UPDATE ON support_escalation_events BEGIN
 SELECT RAISE(ABORT,'Escalation events are immutable');
END;
