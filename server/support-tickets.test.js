import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import Database from 'better-sqlite3';
import { runMigrations } from './migration-runner.js';
import { initializeDocumentStore } from './document-store.js';
import { registerSupportAgentRoutes } from './support-agents.js';
import { registerSupportConversationRoutes } from './support-conversations.js';
import { registerSupportTicketRoutes, classifyTicket } from './support-tickets.js';
import { repairSupportTicketSchema } from './schema-repairs/support-tickets.js';
import { createDashboardHandlers } from './dashboard-routes.js';
import { createCorsPolicy, parseCorsAllowedOrigins } from './cors-policy.js';

const config = name => ({ name, description: '', role: 'Support', systemInstructions: 'Documents only', tone: 'professional', language: 'fr', model: 'openai/gpt-oss-120b', temperature: .6, maxOutputTokens: 1024, fallbackMessage: 'Unavailable', escalationEnabled: false, status: 'active' });
const draft = (overrides = {}) => ({ requestId: randomUUID(), title: 'Facture incorrecte', description: 'Le montant de ma facture est incorrect.', category: 'billing', priority: 'medium', ...overrides });
async function fixture(t, legacy = false) {
  const dir = mkdtempSync(path.join(tmpdir(), 'support-tickets-')), file = path.join(dir, 'isolated.db'), db = new Database(file);
  db.exec('CREATE TABLE documents_history(id INTEGER PRIMARY KEY,filename TEXT,file_type TEXT,created_at TEXT); CREATE TABLE form_submissions(id INTEGER PRIMARY KEY,created_at TEXT);');
  initializeDocumentStore(db);
  if (legacy) {
    db.pragma('foreign_keys=ON');db.exec('CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    for (const file of readdirSync(new URL('./migrations/',import.meta.url)).filter(f=>/^00[1-6]_/.test(f)).sort()) {db.exec(readFileSync(new URL('./migrations/'+file,import.meta.url),'utf8'));db.prepare('INSERT INTO schema_migrations(version) VALUES(?)').run(file);}
  } else {runMigrations(db);runMigrations(db);}

  if (legacy === true) {
    const sql = readFileSync(new URL('./migrations/006_support_tickets.sql', import.meta.url), 'utf8')
      .replace("'technical','billing','account','product','defective_product','returns','delivery','general','other'", "'technical','billing','account','product','other'")
      .replace("'created','classified',", "'created',");
    db.exec('DROP TABLE IF EXISTS support_escalation_events; DROP TABLE IF EXISTS support_escalations; DROP TRIGGER IF EXISTS support_ticket_conversation_delete; DROP TABLE support_ticket_events; DROP TABLE support_tickets;');db.prepare("DELETE FROM schema_migrations WHERE version='007_support_escalations.sql'").run();db.exec(sql);
  }
  const app = express();app.use(createCorsPolicy(parseCorsAllowedOrigins()));app.use(express.json());let enabled = true, aiCalls = 0;
  const guard = (req, res, next) => createDashboardHandlers(db, { localOnlyEnabled: enabled }).middleware(req, res, next);
  registerSupportAgentRoutes(app, db, guard);registerSupportConversationRoutes(app, { db, answer: () => { aiCalls++;throw Error('No inference permitted'); } }, guard);registerSupportTicketRoutes(app, db, guard);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve));db.close();rmSync(dir, { recursive: true });assert.equal(aiCalls, 0); });
  const request = async (route, method = 'GET', body, headers = {}) => { const response = await fetch(`http://127.0.0.1:${server.address().port}/api/agents${route}`, { method, headers: { Origin: 'http://localhost:4200', 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json().catch(() => null) }; };
  const a = (await request('', 'POST', config('A'))).body, b = (await request('', 'POST', config('B'))).body;
  const ticket = (agent = a.id, body = draft()) => request(`/${agent}/tickets`, 'POST', body);
  const conversation = async (agent = a.id) => (await request(`/${agent}/conversations`, 'POST', {})).body;
  const message = c => { const id = randomUUID();db.prepare("INSERT INTO support_messages(id,conversation_id,request_id,role,content,status,created_at) VALUES(?,?,?,'user','Question fictive','completed',?)").run(id, c.id, randomUUID(), new Date().toISOString());return id; };
  return { db, file, a, b, request, ticket, conversation, message, disable: () => enabled = false };
}

test('ticket migration is repeatable; constraints, immutable events and durable records', async t => {
  const f = await fixture(t), created = await f.ticket();assert.equal(created.status, 201);assert.equal(created.body.status, 'open');assert.equal(created.body.classificationSource, 'manual');assert.equal(created.body.classificationConfidence, null);assert.equal(created.body.closedAt, null);assert.equal(created.body.agentId, f.a.id);assert.equal(created.body.version, 1);assert.equal('request_hash' in created.body, false);
  const reopened = new Database(f.file);runMigrations(reopened);assert.equal(reopened.prepare('SELECT count(*) n FROM support_tickets').get().n, 1);reopened.close();
  const events = (await f.request(`/${f.a.id}/tickets/${created.body.id}/events`)).body;assert.deepEqual(events.items.map(e=>e.type), ['created','classified']);assert.equal(events.items[0].origin, 'local_user');
  assert.equal(f.db.prepare("SELECT count(*) n FROM schema_migrations WHERE version='006_support_tickets.sql'").get().n, 1);
  for (const [column, value] of [['status','invalid'],['category','invented'],['priority','top'],['classification_source','ai'],['classification_confidence',.9],['version',.5],['agent_id',randomUUID()]]) assert.throws(() => f.db.prepare(`UPDATE support_tickets SET ${column}=? WHERE id=?`).run(value, created.body.id));
  assert.throws(() => f.db.prepare("UPDATE support_ticket_events SET origin='system'").run());
  assert.equal(f.db.pragma('table_info(support_tickets)').find(column=>column.name==='id').notnull,1);
});

test('deterministic FR/EN classification including defective products, returns, delivery and explicit priority', async t => {
  for (const [input, category, priority] of [['Facture incorrecte', 'billing', 'medium'], ['Erreur critique', 'technical', 'urgent'], ['Compte bloqué', 'account', 'high'], ['Delivery suggestion', 'delivery', 'low'], ['General inquiry', 'other', 'medium'], ['URGENT payment error', 'billing', 'urgent'], ['Produit défectueux', 'defective_product', 'medium'], ['faulty headphones refund', 'defective_product', 'medium'], ['Retour remboursement', 'returns', 'medium'], ['Horaires', 'general', 'medium']]) {
    const result = classifyTicket(input, '');assert.equal(result.category, category);assert.equal(result.priority, priority);assert.equal(result.confidence, null);assert.equal(result.source, 'rules');
  }
  const f = await fixture(t), c = await f.conversation(), m = f.message(c);
  const response = await f.ticket(f.a.id, { requestId: randomUUID(), title: 'NovaShop — casque Bluetooth défectueux', description: 'Scénario fictif : Sophie Martin, commande NS-2026-1042, casque défectueux.', conversationId: c.id, sourceMessageId: m });
  assert.equal(response.body.classificationSource, 'rules');assert.equal(response.body.category, 'defective_product');assert.equal(response.body.priority, 'medium');assert.match(response.body.classificationReason, /defective_product:keywords/);
  assert.equal(response.body.conversationId,c.id);assert.equal(response.body.sourceMessageId,m);
  assert.equal((await f.request(`/${f.a.id}/tickets?conversationId=${c.id}`)).body.total,1);
});

test('conversation/message ownership enforced by API and database, without cross-agent reads', async t => {
  const f = await fixture(t), ca = await f.conversation(), cb = await f.conversation(f.b.id), ma = f.message(ca), mb = f.message(cb);
  const created = await f.ticket(f.a.id, draft({ conversationId: ca.id, sourceMessageId: ma }));assert.equal(created.status, 201);
  for (const data of [{ conversationId: cb.id }, { conversationId: ca.id, sourceMessageId: mb }, { conversationId: randomUUID() }, { conversationId: ca.id, sourceMessageId: randomUUID() }]) assert.equal((await f.ticket(f.a.id, draft(data))).status, 404);
  for (const suffix of ['', '/events']) assert.equal((await f.request(`/${f.b.id}/tickets/${created.body.id}${suffix}`)).status, 404);
  assert.equal((await f.request(`/${f.b.id}/tickets/${created.body.id}`, 'PATCH', { version: 1, status: 'closed' })).status, 404);
  assert.throws(() => f.db.prepare('UPDATE support_tickets SET conversation_id=? WHERE id=?').run(cb.id, created.body.id));
  assert.throws(() => f.db.prepare('UPDATE support_tickets SET source_message_id=? WHERE id=?').run(mb, created.body.id));
  assert.equal((await f.request(`/${f.b.id}/tickets`)).body.total, 0);assert.equal((await f.request(`/${f.b.id}/tickets?conversationId=${ca.id}`)).status,404);
});

test('strict fields, types, bounds, UUIDs, content type and query validation', async t => {
  const f = await fixture(t);
  for (const data of [{ title: '' }, { description: '' }, { title: 'x'.repeat(161) }, { description: 'x'.repeat(4001) }, { title: 'x\0' }, { requestId: 'bad' }, { category: 'unknown' }, { priority: 'top' }, { status: 'closed' }, { classificationConfidence: .9 }, { agentId: f.b.id }, { conversationId: 42 }, { sourceMessageId: randomUUID() }, { category: undefined }]) assert.equal((await f.ticket(f.a.id, draft(data))).status, 400);
  assert.equal((await f.request(`/${f.a.id}/tickets`, 'POST', null)).status, 400);assert.equal((await f.request(`/${f.a.id}/tickets`, 'POST', [])).status, 400);
  assert.equal((await f.request(`/${f.a.id}/tickets`, 'POST', draft(), { 'Content-Type': 'text/plain' })).status, 400);
  for (const q of ['limit=51','limit=0','limit=1.5','offset=-1','offset=10001','status=invalid','priority=top','category=bad','limit=1&limit=2','q=x','search='+ 'x'.repeat(101)]) assert.equal((await f.request(`/${f.a.id}/tickets?${q}`)).status, 400);
  assert.equal((await f.request('/bad/tickets')).status, 400);assert.equal((await f.request(`/${randomUUID()}/tickets`)).status, 404);
});

test('idempotency handles simultaneous retries, conflicts and normalized input without duplicate events', async t => {
  const f = await fixture(t), body = draft();const results = await Promise.all([f.ticket(f.a.id, body), f.ticket(f.a.id, body)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200,201]);assert.equal(results[0].body.id, results[1].body.id);
  assert.equal((await f.ticket(f.a.id, { ...body, title: ' '+body.title+' ' })).body.id, results[0].body.id);
  assert.equal((await f.ticket(f.a.id, { ...body, description: 'Different payload' })).status, 409);assert.equal(f.db.prepare('SELECT count(*) n FROM support_ticket_events').get().n, 2);
});

test('paginated stable filtered lists, literal wildcard search and real agent-wide counts', async t => {
  const f = await fixture(t);await f.ticket(f.b.id);
  const records = [];for (let i = 0; i < 4; i++) records.push((await f.ticket(f.a.id, draft({ title: i === 0 ? '100% literal' : 'Ticket '+i, priority: i % 2 ? 'high' : 'low', category: i % 2 ? 'technical' : 'billing' }))).body);
  f.db.prepare('UPDATE support_tickets SET updated_at=? WHERE agent_id=?').run('2026-01-01T00:00:00Z', f.a.id);
  const first = await f.request(`/${f.a.id}/tickets?limit=2`), second = await f.request(`/${f.a.id}/tickets?limit=2&offset=2`);
  assert.equal(first.body.total, 4);assert.equal(first.body.counts.open, 4);assert.deepEqual([...first.body.items,...second.body.items].map(r=>r.id),records.map(r=>r.id).sort());
  const filtered = await f.request(`/${f.a.id}/tickets?category=technical&priority=high&status=open`);assert.equal(filtered.body.total,2);assert.equal(filtered.body.counts.open,4);
  assert.equal((await f.request(`/${f.a.id}/tickets?search=%25`)).body.total,1);
});

test('controlled optimistic patch, no-ops, close/reopen and chronological events', async t => {
  const f = await fixture(t), created = (await f.ticket(f.a.id, { requestId: randomUUID(), title: 'Bug', description: 'Erreur' })).body, url = `/${f.a.id}/tickets/${created.id}`;
  let result = await f.request(url, 'PATCH', { version: 1, status: 'closed', category: 'product', priority: 'low' });assert.equal(result.status, 200);assert.ok(result.body.closedAt);assert.equal(result.body.classificationSource, 'manual');assert.equal(result.body.version, 2);
  assert.equal((await f.request(url, 'PATCH', { version: 1, status: 'open' })).status, 409);assert.equal((await f.request(url, 'PATCH', { version: 2, status: 'closed' })).body.version, 2);
  const events = (await f.request(url+'/events?limit=2')).body;assert.equal(events.total, 6);assert.equal(events.items.length, 2);
  const all = (await f.request(url+'/events?limit=50')).body.items;assert.deepEqual(all.map(e=>e.type), ['created','classified','status_changed','priority_changed','category_changed','classification_changed']);assert.equal(all[2].oldValue,'open');assert.equal(all[2].newValue,'closed');
  result = await f.request(url, 'PATCH', { version: 2, status: 'open' });assert.equal(result.body.closedAt,null);
  for(const data of [{version:3,title:'Rewrite'},{version:3,description:'Rewrite'},{version:3,agentId:f.b.id},{version:3,sourceMessageId:null},{version:3,status:'bad'},{status:'open'},{version:'3',status:'open'},{version:3}]) assert.equal((await f.request(url,'PATCH',data)).status,400);
  assert.equal((await f.request(url+'/events?offset=-1')).status,400);assert.equal((await f.request(url+'?extra=x')).status,400);
});

test('failed audit insert rolls back create and update without SQL disclosure', async t => {
  const f = await fixture(t);f.db.exec("CREATE TRIGGER refuse_event BEFORE INSERT ON support_ticket_events BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL_ERROR'); END;");
  const body = draft(), failed = await f.ticket(f.a.id, body);assert.equal(failed.status,500);assert.equal(failed.body.code,'storage_error');assert.ok(!JSON.stringify(failed.body).includes('PRIVATE_SQL_ERROR'));assert.equal(f.db.prepare('SELECT count(*) n FROM support_tickets').get().n,0);
  f.db.exec('DROP TRIGGER refuse_event');const ticket = (await f.ticket(f.a.id, body)).body;
  f.db.exec("CREATE TRIGGER refuse_event BEFORE INSERT ON support_ticket_events BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL_ERROR'); END;");
  assert.equal((await f.request(`/${f.a.id}/tickets/${ticket.id}`,'PATCH',{version:1,status:'closed'})).status,500);
  const saved = (await f.request(`/${f.a.id}/tickets/${ticket.id}`)).body;assert.equal(saved.status,'open');assert.equal(saved.version,1);assert.equal(f.db.prepare('SELECT count(*) n FROM support_ticket_events').get().n,2);
});

test('conversation deletion keeps tickets and audits lost links; agent deletion cascades', async t => {
  const f = await fixture(t), c = await f.conversation(), m = f.message(c), body = draft({conversationId:c.id,sourceMessageId:m}), ticket = (await f.ticket(f.a.id,body)).body;
  assert.equal((await f.request(`/${f.a.id}/conversations/${c.id}`,'DELETE')).status,204);
  const saved = (await f.request(`/${f.a.id}/tickets/${ticket.id}`)).body;assert.equal(saved.conversationId,null);assert.equal(saved.sourceMessageId,null);assert.equal(saved.description,body.description);assert.equal(saved.version,3);
  const events=(await f.request(`/${f.a.id}/tickets/${ticket.id}/events`)).body.items;assert.deepEqual(events.map(e=>e.type),['created','classified','source_unlinked','conversation_unlinked']);assert.equal(events[3].origin,'system');
  assert.equal((await f.ticket(f.a.id,body)).body.id,ticket.id);
  f.db.prepare('DELETE FROM support_agents WHERE id=?').run(f.a.id);assert.equal(f.db.prepare('SELECT count(*) n FROM support_tickets').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM support_ticket_events').get().n,0);
});

test('local guard and narrowly scoped PATCH preflight without PUT/DELETE', async t => {
  const f = await fixture(t), ticket = (await f.ticket()).body, url=`/${f.a.id}/tickets/${ticket.id}`;
  assert.equal((await f.request(url,'OPTIONS',undefined,{'Access-Control-Request-Method':'PATCH'})).status,204);
  for(const method of ['PUT','DELETE'])assert.equal((await f.request(url,'OPTIONS',undefined,{'Access-Control-Request-Method':method})).status,403);
  assert.equal((await f.request(`/${f.a.id}/unrelated/${ticket.id}`,'OPTIONS',undefined,{'Access-Control-Request-Method':'PATCH'})).status,403);
  f.disable();for(const [route,method,body]of [[`/${f.a.id}/tickets`,'GET'],[url,'GET'],[url+'/events','GET'],[`/${f.a.id}/tickets`,'POST',draft()],[url,'PATCH',{version:1,status:'waiting'}]])assert.equal((await f.request(route,method,body)).status,403);
});

test('ticket quota is enforced and source-message deletion alone is audited', async t => {
  const f=await fixture(t), c=await f.conversation(), m=f.message(c), saved=(await f.ticket(f.a.id,draft({conversationId:c.id,sourceMessageId:m}))).body;
  f.db.prepare('DELETE FROM support_messages WHERE id=?').run(m);
  const current=(await f.request(`/${f.a.id}/tickets/${saved.id}`)).body;assert.equal(current.sourceMessageId,null);assert.equal(current.conversationId,c.id);assert.equal(current.version,2);
  assert.equal((await f.request(`/${f.a.id}/tickets/${saved.id}/events`)).body.items.at(-1).type,'source_unlinked');
  const row=f.db.prepare('SELECT * FROM support_tickets WHERE id=?').get(saved.id), keys=Object.keys(row);
  const insert=f.db.prepare(`INSERT INTO support_tickets(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`);
  f.db.transaction(()=>{for(let i=1;i<1000;i++){const next={...row,id:randomUUID(),request_id:randomUUID()};insert.run(...keys.map(key=>next[key]));}})();
  const refused=await f.ticket();assert.equal(refused.status,409);assert.equal(refused.body.code,'ticket_limit');assert.equal(f.db.prepare('SELECT count(*) n FROM support_tickets').get().n,1000);
});

test('upgrade from exactly five migrations preserves agents, conversations and messages', async t => {
  const { readFileSync, readdirSync } = await import('node:fs');const db=new Database(':memory:');t.after(()=>db.close());
  db.exec('CREATE TABLE documents_history(id INTEGER PRIMARY KEY,filename TEXT,file_type TEXT,created_at TEXT); CREATE TABLE form_submissions(id INTEGER PRIMARY KEY,created_at TEXT);');initializeDocumentStore(db);
  db.pragma('foreign_keys=ON');db.exec('CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const files=readdirSync(new URL('./migrations/',import.meta.url)).filter(f=>/^00[1-5]_/.test(f)).sort();
  for(const file of files)db.transaction(()=>{db.exec(readFileSync(new URL('./migrations/'+file,import.meta.url),'utf8'));db.prepare('INSERT INTO schema_migrations(version) VALUES(?)').run(file);})();
  const agent=randomUUID(),conversation=randomUUID(),message=randomUUID();
  db.prepare("INSERT INTO support_agents(id,name,description,role,system_instructions,tone,language,model,temperature,max_output_tokens,fallback_message,escalation_enabled,status,created_at,updated_at) VALUES(?,'NovaShop fictif','','Support','Documents','professional','fr','openai/gpt-oss-120b',.6,1024,'Fallback',0,'active','2026-01-01','2026-01-01')").run(agent);
  db.prepare("INSERT INTO support_conversations(id,agent_id,title,created_at,updated_at) VALUES(?,?,'NS-2026-1042','2026-01-01','2026-01-01')").run(conversation,agent);
  db.prepare("INSERT INTO support_messages(id,conversation_id,request_id,role,content,status,created_at) VALUES(?,?,?,'user','Casque défectueux','completed','2026-01-01')").run(message,conversation,randomUUID());
  const before=db.prepare('SELECT * FROM support_messages').all();runMigrations(db);runMigrations(db);assert.deepEqual(db.prepare('SELECT * FROM support_messages').all(),before);assert.equal(db.prepare('SELECT count(*) n FROM support_agents').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM schema_migrations').get().n,8);assert.equal(db.prepare('SELECT count(*) n FROM support_tickets').get().n,0);assert.deepEqual(db.pragma('foreign_key_check'),[]);
});


test('early recorded 006 rejects current creation; explicit repair preserves history and restores idempotent creation', async t => {
  const f = await fixture(t, true), c = await f.conversation(), m = f.message(c);
  const beforeConversations = f.db.prepare('SELECT * FROM support_conversations').all();
  const beforeMessages = f.db.prepare('SELECT * FROM support_messages').all();
  const body = draft({ title: 'Produit défectueux — Casque Bluetooth — NS-2026-1042', description: 'Cas fictif : casque défectueux.', category: 'defective_product', conversationId: c.id, sourceMessageId: m });
  // Capture precise SQLite failures using synthetic rows only, not live requests.
  const id = randomUUID();
  const rawInsert = f.db.prepare("INSERT INTO support_tickets(id,agent_id,request_id,request_hash,title,description,category,priority,classification_source,classification_reason,created_at,updated_at) VALUES(?,?,?,?,'Fictif','Test',?,'medium','manual','manual','2026-01-01','2026-01-01')");
  assert.throws(() => rawInsert.run(id, f.a.id, randomUUID(), 'a'.repeat(64), 'defective_product'), e => e.code === 'SQLITE_CONSTRAINT_CHECK' && /category/.test(e.message));
  rawInsert.run(id, f.a.id, randomUUID(), 'b'.repeat(64), 'billing');
  assert.throws(() => f.db.prepare("INSERT INTO support_ticket_events(ticket_id,type,origin,created_at) VALUES(?,'classified','system','2026-01-01')").run(id), e => e.code === 'SQLITE_CONSTRAINT_CHECK' && /type/.test(e.message));
  f.db.prepare("INSERT INTO support_ticket_events(ticket_id,type,origin,created_at) VALUES(?,'created','local_user','2026-01-01')").run(id);
  const beforeTickets = f.db.prepare('SELECT * FROM support_tickets ORDER BY id').all();
  const beforeEvents = f.db.prepare('SELECT * FROM support_ticket_events ORDER BY id').all();
  for (const data of [body, draft()]) {
    const failed = await f.ticket(f.a.id, data);assert.equal(failed.status, 500);assert.equal(failed.body.code, 'storage_error');
    assert.deepEqual(f.db.prepare('SELECT * FROM support_tickets ORDER BY id').all(), beforeTickets);
    assert.deepEqual(f.db.prepare('SELECT * FROM support_ticket_events ORDER BY id').all(), beforeEvents);
  }
  f.db.prepare("UPDATE sqlite_sequence SET seq=100 WHERE name='support_ticket_events'").run();
  assert.deepEqual(repairSupportTicketSchema(f.db), { tickets: 1, events: 1 });
  assert.deepEqual(f.db.prepare('SELECT * FROM support_tickets ORDER BY id').all(), beforeTickets);
  assert.deepEqual(f.db.prepare('SELECT * FROM support_ticket_events ORDER BY id').all(), beforeEvents);
  assert.deepEqual(f.db.prepare('SELECT * FROM support_conversations').all(), beforeConversations);
  assert.deepEqual(f.db.prepare('SELECT * FROM support_messages').all(), beforeMessages);
  const created = await f.ticket(f.a.id, body);assert.equal(created.status, 201);assert.equal(created.body.category, 'defective_product');
  assert.equal((await f.ticket(f.a.id, body)).status, 200);
  assert.equal(f.db.prepare('SELECT count(*) n FROM support_tickets').get().n, 2);
  assert.equal(f.db.prepare('SELECT count(*) n FROM support_ticket_events').get().n, 3);
  assert.equal(f.db.prepare('SELECT max(id) n FROM support_ticket_events').get().n, 102);
  assert.equal(f.db.prepare('SELECT count(*) n FROM schema_migrations').get().n, 6);
  assert.deepEqual(f.db.pragma('foreign_key_check'), []);
});


test('explicit ticket repair rolls back completely on an unsupported schema', async t => {
  const f = await fixture(t, 'six');await f.ticket();
  f.db.exec("ALTER TABLE support_tickets ADD COLUMN maintenance_probe TEXT DEFAULT 'preserve'");
  const schema = f.db.prepare("SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all();
  const tickets = f.db.prepare('SELECT * FROM support_tickets').all();
  const events = f.db.prepare('SELECT * FROM support_ticket_events').all();
  assert.throws(() => repairSupportTicketSchema(f.db), /maintenance_probe/);
  assert.deepEqual(f.db.prepare("SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all(), schema);
  assert.deepEqual(f.db.prepare('SELECT * FROM support_tickets').all(), tickets);
  assert.deepEqual(f.db.prepare('SELECT * FROM support_ticket_events').all(), events);
  assert.deepEqual(f.db.pragma('foreign_key_check'), []);
});

test('priority-only override audits provenance once without changing category; status/no-op retain classification', async t => {
  const f = await fixture(t);
  const created = await f.ticket(f.a.id, { requestId: randomUUID(), title: 'Produit défectueux', description: 'Cas fictif : casque défectueux.' });
  const url = `/${f.a.id}/tickets/${created.body.id}`;
  const patch = (version, status, priority) => f.request(url, 'PATCH', { version, status, priority, category: 'defective_product' });
  let response = await patch(1, 'in_progress', 'medium');
  assert.equal(response.body.classificationSource, 'rules');assert.equal(response.body.category, 'defective_product');
  response = await patch(2, 'in_progress', 'high');
  assert.equal(response.status, 200);assert.equal(response.body.classificationSource, 'manual');assert.equal(response.body.classificationReason, 'manual_override');assert.equal(response.body.category, 'defective_product');
  let events = (await f.request(url+'/events')).body.items;
  assert.deepEqual(events.map(e => e.type), ['created', 'classified', 'status_changed', 'priority_changed', 'classification_changed']);
  assert.deepEqual([events[4].oldValue, events[4].newValue], ['rules', 'manual']);
  response = await patch(3, 'in_progress', 'high');assert.equal(response.body.version, 3);
  response = await patch(3, 'in_progress', 'urgent');assert.equal(response.body.version, 4);
  events = (await f.request(url+'/events')).body.items;
  assert.equal(events.filter(e => e.type === 'classification_changed').length, 1);
  assert.equal(events.filter(e => e.type === 'category_changed').length, 0);
  assert.equal(events.at(-1).type, 'priority_changed');
});


test('006 maintenance repair refuses new escalation dependencies without changing any rows or schema', async t => {
 const f=await fixture(t);await f.ticket();
 const snapshot=()=>f.db.prepare("SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all();const before=snapshot(),tickets=f.db.prepare('SELECT * FROM support_tickets').all();
 assert.throws(()=>repairSupportTicketSchema(f.db),/Unexpected ticket dependency/);
 assert.deepEqual(snapshot(),before);assert.deepEqual(f.db.prepare('SELECT * FROM support_tickets').all(),tickets);
});
