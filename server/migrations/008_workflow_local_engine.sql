-- Local-only engine. No URL, credential, callback or external transport configuration.
CREATE TABLE workflow_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 capacity INTEGER NOT NULL DEFAULT 1000 CHECK(capacity BETWEEN 1 AND 10000), version INTEGER NOT NULL DEFAULT 1 CHECK(version>0)
);
INSERT INTO workflow_settings(id) VALUES(1);
CREATE TABLE workflow_bindings (
 id TEXT PRIMARY KEY NOT NULL, agent_id TEXT REFERENCES support_agents(id) ON DELETE SET NULL,
 event_type TEXT NOT NULL DEFAULT 'handoff.requested' CHECK(event_type='handoff.requested'),
 target TEXT NOT NULL DEFAULT 'local_simulator' CHECK(target='local_simulator'),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)), revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at INTEGER NOT NULL, UNIQUE(agent_id,event_type)
);
CREATE TABLE workflow_receipts (
 id TEXT PRIMARY KEY NOT NULL, binding_id TEXT NOT NULL REFERENCES workflow_bindings(id), binding_revision INTEGER NOT NULL,
 source_event_id INTEGER NOT NULL, agent_id TEXT NOT NULL, ticket_id TEXT NOT NULL, handoff_id TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)), state TEXT NOT NULL CHECK(state IN ('deferred','paused','materialized','cancelled')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_at INTEGER NOT NULL,
 UNIQUE(binding_id,source_event_id)
);
CREATE INDEX workflow_receipts_pending ON workflow_receipts(state,created_at,id);
CREATE TABLE workflow_runs (
 id TEXT PRIMARY KEY NOT NULL, receipt_id TEXT NOT NULL UNIQUE REFERENCES workflow_receipts(id),
 state TEXT NOT NULL CHECK(state IN ('queued','running','retry_wait','paused','succeeded','failed','unknown','cancelled')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), fence INTEGER NOT NULL DEFAULT 0 CHECK(fence>=0),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 worker TEXT, lease_until INTEGER, next_attempt_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
 CHECK((state='running' AND worker IS NOT NULL AND lease_until IS NOT NULL) OR (state<>'running' AND worker IS NULL AND lease_until IS NULL))
);
CREATE INDEX workflow_runs_pending ON workflow_runs(state,next_attempt_at,id);
CREATE TABLE workflow_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, binding_id TEXT, receipt_id TEXT, run_id TEXT,
 type TEXT NOT NULL, old_state TEXT, new_state TEXT, version INTEGER, fence INTEGER,
 created_at INTEGER NOT NULL, scope TEXT, request_id TEXT, payload_hash TEXT, response_json TEXT,
 UNIQUE(scope,request_id)
);
CREATE INDEX workflow_audit_run ON workflow_audit(run_id,id);
CREATE TRIGGER workflow_audit_immutable_update BEFORE UPDATE ON workflow_audit BEGIN SELECT RAISE(ABORT,'Workflow audit immutable'); END;
CREATE TRIGGER workflow_audit_immutable_delete BEFORE DELETE ON workflow_audit BEGIN SELECT RAISE(ABORT,'Workflow audit immutable'); END;
CREATE TRIGGER workflow_capture_handoff AFTER INSERT ON support_escalation_events WHEN NEW.type='requested' BEGIN
 INSERT INTO workflow_receipts(id,binding_id,binding_revision,source_event_id,agent_id,ticket_id,handoff_id,payload,state,created_at)
 SELECT b.id||':'||NEW.id,b.id,b.revision,NEW.id,b.agent_id,NEW.ticket_id,NEW.escalation_id,
 json_object('schemaVersion',1,'type','handoff.requested','sourceEventId',NEW.id,'agentId',b.agent_id,'ticketId',NEW.ticket_id,'handoffId',NEW.escalation_id,'handoffVersion',e.version,'reason',e.reason),
 CASE WHEN (SELECT enabled FROM workflow_settings WHERE id=1)=1 THEN 'deferred' ELSE 'paused' END,
 CAST(strftime('%s','now') AS INTEGER)*1000
 FROM workflow_bindings b JOIN support_tickets t ON t.agent_id=b.agent_id AND t.id=NEW.ticket_id
 JOIN support_escalations e ON e.id=NEW.escalation_id AND e.ticket_id=t.id
 WHERE b.enabled=1;
 INSERT INTO workflow_audit(binding_id,receipt_id,type,new_state,version,created_at)
 SELECT binding_id,id,'captured',state,version,created_at FROM workflow_receipts WHERE source_event_id=NEW.id;
END;
CREATE TRIGGER workflow_ticket_deleted BEFORE DELETE ON support_tickets BEGIN
 INSERT INTO workflow_audit(binding_id,receipt_id,run_id,type,old_state,new_state,version,fence,created_at)
 SELECT r.binding_id,r.id,w.id,'source_deleted',w.state,'cancelled',w.version+1,w.fence+1,CAST(strftime('%s','now') AS INTEGER)*1000
 FROM workflow_runs w JOIN workflow_receipts r ON r.id=w.receipt_id WHERE r.ticket_id=OLD.id AND w.state NOT IN ('succeeded','cancelled');
 UPDATE workflow_runs SET state='cancelled',version=version+1,fence=fence+1,worker=NULL,lease_until=NULL WHERE receipt_id IN (SELECT id FROM workflow_receipts WHERE ticket_id=OLD.id) AND state NOT IN ('succeeded','cancelled');
 INSERT INTO workflow_audit(binding_id,receipt_id,type,old_state,new_state,version,created_at)
 SELECT binding_id,id,'source_deleted',state,'cancelled',version+1,CAST(strftime('%s','now') AS INTEGER)*1000 FROM workflow_receipts WHERE ticket_id=OLD.id AND state IN ('deferred','paused');
 UPDATE workflow_receipts SET state='cancelled',version=version+1 WHERE ticket_id=OLD.id AND state IN ('deferred','paused');
END;
CREATE TRIGGER workflow_agent_deleted BEFORE DELETE ON support_agents BEGIN
 INSERT INTO workflow_audit(binding_id,type,created_at) SELECT id,'binding_orphaned',CAST(strftime('%s','now') AS INTEGER)*1000 FROM workflow_bindings WHERE agent_id=OLD.id;
 UPDATE workflow_bindings SET enabled=0,revision=revision+1 WHERE agent_id=OLD.id;
END;
