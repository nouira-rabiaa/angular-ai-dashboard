import test from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import Database from 'better-sqlite3';
import { initializeDocumentStore, indexDocument, searchDocumentChunks } from './document-store.js';
import { runMigrations } from './migration-runner.js';
import { registerSupportAgentRoutes } from './support-agents.js';
import { registerSupportKnowledgeRoutes } from './support-knowledge.js';
import { createDashboardHandlers } from './dashboard-routes.js';
import { registerSupportConversationRoutes, conversationMemory } from './support-conversations.js';
import { createCorsPolicy, parseCorsAllowedOrigins } from './cors-policy.js';

const config = name => ({ name, description: '', role: 'Support client', systemInstructions: 'Utiliser les documents autorisés.',
  tone: 'professional', language: 'fr', model: 'openai/gpt-oss-120b', temperature: 0.6, maxOutputTokens: 1024,
  fallbackMessage: 'Informations insuffisantes dans les documents autorisés.', escalationEnabled: false, status: 'active' });
const answer = text => ({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } });
async function fixture(t, options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'support-knowledge-'));const file = path.join(dir, 'isolated.db');const queries = [];
  const db = new Database(file, { verbose: sql => { if (sql.includes('bm25(document_chunks_fts)')) queries.push(sql); } });
  db.exec(`CREATE TABLE documents_history (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, file_type TEXT,
    character_count INTEGER, chunks_count INTEGER, status TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE form_submissions (id INTEGER PRIMARY KEY, created_at TEXT);`);
  initializeDocumentStore(db);runMigrations(db);runMigrations(db);
  const index = (filename, text) => indexDocument(db, { filename, fileType: 'txt', text, sourceBuffer: Buffer.from(text) }).documentId;
  const publicId = index('public.txt', 'Le retour article est autorisé sous trente jours avec le reçu. Cette politique explique le retour article.');
  const privateId = index('private.txt', 'Retour article retour article EXCLUDED_TEST_CONTENT : politique interne strictement réservée.');
  const calls = [];let completion = options.completion ?? (() => Promise.resolve(answer('Le retour est possible sous trente jours [S1].')));
  const groq = { chat: { completions: { create: (body, opts) => { calls.push({ body, opts });return completion(body, opts); } } } };
  const app = express();app.use(createCorsPolicy(parseCorsAllowedOrigins()));app.use(express.json());
  let enabled = true;const guard = (req,res,next) => createDashboardHandlers(db, { localOnlyEnabled: enabled }).middleware(req,res,next);
  registerSupportAgentRoutes(app, db, guard);const knowledge = registerSupportKnowledgeRoutes(app, { db, groq, timeoutMs: options.timeoutMs ?? 1000, pricing: options.pricing ?? {} }, guard);
  registerSupportConversationRoutes(app, { db, answer: knowledge.answer }, guard);
  const server = await new Promise(resolve => { const s = app.listen(0,'127.0.0.1',() => resolve(s)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve));if (db.open) db.close();rmSync(dir, { recursive: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (url, method = 'GET', body) => {
    const response = await fetch(base + '/api/agents' + url, { method, headers: { Origin: 'http://localhost:4200', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  const a = (await request('', 'POST', config('Agent A'))).body;const b = (await request('', 'POST', config('Agent B'))).body;
  const scope = async id => (await request(`/${id}/documents`)).body;
  const assign = async (id, documentIds, version) => request(`/${id}/documents`, 'PUT', { documentIds, scopeVersion: version ?? (await scope(id)).scopeVersion });
  return { db, file, base, publicId, privateId, a, b, calls, queries, request, scope, assign, index,
    completion: fn => completion = fn, disable: () => enabled = false };
}

const create = async f => {
  await f.assign(f.a.id, [f.publicId]);
  return (await f.request(`/${f.a.id}/conversations`, 'POST', {})).body;
};
const turn = (f, c, question = 'retour article', requestId = randomUUID()) => f.request(`/${f.a.id}/conversations/${c.id}/messages`, 'POST', { question, requestId });
const history = (f, c, query = '') => f.request(`/${f.a.id}/conversations/${c.id}${query}`);

test('durable ordered turns, citations, bounded list/history pages and cascade deletion', async t => {
  const f = await fixture(t);const c = await create(f);assert.ok(c.id);
  const sent = await turn(f, c);assert.equal(sent.status, 200);
  assert.deepEqual(sent.body.items.map(m => [m.role,m.status]), [['user','completed'],['assistant','completed']]);
  assert.equal(sent.body.items[1].sources[0].documentId, f.publicId);
  const read = await history(f,c,'?limit=1');assert.equal(read.body.items.length,1);assert.ok(read.body.nextBefore);
  const older = await history(f,c,`?limit=1&before=${read.body.nextBefore}`);assert.equal(older.body.items[0].role,'user');assert.equal(older.body.nextBefore,null);
  const list = await f.request(`/${f.a.id}/conversations?limit=1&offset=0`);assert.equal(list.body.total,1);assert.equal(list.body.items[0].title,'retour article');
  // A second connection proves persistence, independent of HTTP/client state.
  const reopened = new Database(f.file);assert.equal(reopened.prepare('SELECT count(*) n FROM support_messages WHERE conversation_id = ?').get(c.id).n,2);reopened.close();
  assert.equal((await f.request(`/${f.a.id}/conversations/${c.id}`,'DELETE')).status,204);
  assert.equal(f.db.prepare('SELECT count(*) n FROM support_messages').get().n,0);assert.equal((await history(f,c)).status,404);
});

test('follow-up retrieval uses recent user context, never assistant answers or old excerpts', async t => {
  const f = await fixture(t);const c = await create(f);await turn(f,c,'politique retour article');
  const response = await turn(f,c,'Et si le produit est déjà ouvert ?');assert.equal(response.status,200);assert.equal(response.body.items[1].status,'completed');
  const prompt = JSON.parse(f.calls[1].body.messages[1].content);
  assert.deepEqual(prompt.conversationUserContext,[{role:'user',content:'politique retour article'}]);
  assert.ok(!JSON.stringify(prompt.conversationUserContext).includes('trente jours'));
  assert.equal(f.calls.length,2);assert.ok(f.queries.every(sql=>sql.includes('binding.agent_id')));
  const rows = Array.from({length:20},()=>({content:'x'.repeat(2000)}));const memory = conversationMemory(rows,'q'.repeat(2000));
  assert.ok(memory.length<=6);assert.ok(memory.reduce((n,m)=>n+m.content.length,2000)<=4000);
});

test('cross-agent access, unknown resources, strict bodies, pagination and local guard', async t => {
  const f=await fixture(t);const c=await create(f);
  for(const [method,suffix,body] of [['GET','',undefined],['DELETE','',undefined],['POST','/messages',{question:'retour article',requestId:randomUUID()}]]) {
    assert.equal((await f.request(`/${f.b.id}/conversations/${c.id}${suffix}`,method,body)).status,404);
  }
  assert.equal((await history(f,{id:randomUUID()})).status,404);
  assert.equal((await history(f,{id:'invalid'})).status,400);
  for(const query of ['?limit=51','?limit=-1','?offset=1','?before=0','?unexpected=yes']) assert.equal((await history(f,c,query)).status,400);
  for(const body of [{},{question:'',requestId:randomUUID()},{question:'x'.repeat(2001),requestId:randomUUID()},{question:'retour',requestId:'bad'},{question:'retour',requestId:randomUUID(),permissions:['all']}]) assert.equal((await f.request(`/${f.a.id}/conversations/${c.id}/messages`,'POST',body)).status,400);
  assert.equal((await f.request(`/${f.a.id}/conversations`,'POST',{agentId:f.b.id})).status,400);
  f.disable();assert.equal((await history(f,c)).status,403);assert.equal((await turn(f,c)).status,403);assert.equal((await f.request(`/${f.a.id}/conversations`,'POST',{})).status,403);
});

test('retries replay durable results; key reuse with a different payload is rejected', async t => {
  const f=await fixture(t);const c=await create(f);const id=randomUUID();const first=await turn(f,c,'retour article',id);
  const retry=await turn(f,c,'retour article',id);assert.deepEqual(retry.body,first.body);assert.equal(f.calls.length,1);
  assert.equal((await turn(f,c,'autre question',id)).status,409);assert.equal(f.db.prepare('SELECT count(*) n FROM support_messages').get().n,2);
});

test('same-conversation concurrency is serialized and a retry sees pending status', async t => {
  const f=await fixture(t);const c=await create(f);let release,started;const ready=new Promise(resolve=>started=resolve);
  f.completion(()=>{started();return new Promise(resolve=>release=resolve);});const id=randomUUID();const pending=turn(f,c,'retour article',id);await ready;
  assert.equal((await turn(f,c)).body.code,'conversation_busy');assert.equal((await turn(f,c,'retour article',id)).status,202);
  assert.equal((await history(f,c)).body.items[1].status,'pending');release(answer('retour article [S1]'));assert.equal((await pending).status,200);assert.equal(f.calls.length,1);
});

test('revoked history is masked, sources withheld, next turn performs no unauthorized inference', async t => {
  const f=await fixture(t);const c=await create(f);await turn(f,c);await f.assign(f.a.id,[]);
  const read=await history(f,c);const assistant=read.body.items[1];assert.equal(assistant.stale,true);assert.deepEqual(assistant.sources,[]);assert.ok(!assistant.content.includes('trente jours'));
  const next=await turn(f,c,'Et dans ce cas ?');assert.equal(next.body.items[1].status,'abstained');assert.equal(f.calls.length,1);
});

for(const change of ['revoke','remove-readd','inactive','delete']) test(`discard pending generation after ${change}`, async t=>{
  const f=await fixture(t);const c=await create(f);let release,started;const ready=new Promise(resolve=>started=resolve);
  f.completion(()=>{started();return new Promise(resolve=>release=resolve);});const pending=turn(f,c);await ready;
  if(change==='delete') await f.request(`/${f.a.id}/conversations/${c.id}`,'DELETE');
  else if(change==='inactive') f.db.prepare("UPDATE support_agents SET status='inactive',version=version+1 WHERE id=?").run(f.a.id);
  else {await f.assign(f.a.id,[]);if(change==='remove-readd') await f.assign(f.a.id,[f.publicId]);}
  release(answer('NEVER_PERSIST_THIS [S1]'));const response=await pending;assert.equal(response.status,change==='delete'?404:409);
  assert.ok(!JSON.stringify(f.db.prepare('SELECT content,sources_json FROM support_messages').all()).includes('NEVER_PERSIST_THIS'));
  if(change!=='delete') assert.equal((await history(f,c)).body.items[1].status,'failed');
});

test('inactive agents retain readable history but cannot create or generate', async t=>{
  const f=await fixture(t);const c=await create(f);await turn(f,c);f.db.prepare("UPDATE support_agents SET status='inactive' WHERE id=?").run(f.a.id);
  assert.equal((await history(f,c)).status,200);assert.equal((await turn(f,c)).body.code,'agent_inactive');assert.equal((await f.request(`/${f.a.id}/conversations`,'POST',{})).body.code,'agent_inactive');
});

test('abstention and invalid citations persist distinctly from provider failure and timeout; late result ignored', async t=>{
  const f=await fixture(t,{timeoutMs:20});const c=await create(f);
  f.completion(()=>Promise.resolve(answer('unverifiable [S999]')));assert.equal((await turn(f,c)).body.items[1].status,'abstained');
  f.completion(()=>Promise.resolve(answer('[ABSTAIN]')));assert.equal((await turn(f,c)).body.items[1].status,'abstained');
  f.completion(()=>Promise.reject(new Error('DO_NOT_EXPOSE_PROVIDER')));const failed=await turn(f,c);assert.equal(failed.status,502);assert.equal(failed.body.items[1].status,'failed');assert.ok(!JSON.stringify(failed).includes('DO_NOT_EXPOSE'));
  let release;f.completion(()=>new Promise(resolve=>release=resolve));const timed=await turn(f,c);assert.equal(timed.status,504);assert.equal(timed.body.items[1].metadata.code,'provider_timeout');
  release(answer('LATE [S1]'));await new Promise(resolve=>setTimeout(resolve,10));assert.ok(!JSON.stringify((await history(f,c)).body).includes('LATE'));
});

test('startup recovery marks abandoned pending messages failed without invoking provider; quotas enforced', async t=>{
  const f=await fixture(t);const c=await create(f);const now=new Date().toISOString();
  f.db.prepare("INSERT INTO support_messages (id,conversation_id,request_id,role,content,status,created_at) VALUES (?,?,?,'assistant','','pending',?)").run(randomUUID(),c.id,randomUUID(),now);
  registerSupportConversationRoutes(express(),{db:f.db,answer:()=>{throw Error('must not generate');}},(_q,_s,next)=>next());
  assert.equal((await history(f,c)).body.items[0].metadata.code,'interrupted');assert.equal(f.calls.length,0);
  const insert=f.db.prepare("INSERT INTO support_messages (id,conversation_id,request_id,role,content,status,created_at) VALUES (?,?,?,'user','quota','completed',?)");
  for(let i=1;i<200;i++) insert.run(randomUUID(),c.id,randomUUID(),now);
  assert.equal((await turn(f,c)).body.code,'message_limit');
  for(let i=1;i<50;i++) await f.request(`/${f.a.id}/conversations`,'POST',{});
  assert.equal((await f.request(`/${f.a.id}/conversations`,'POST',{})).body.code,'conversation_limit');
});

test('browser preflight permits conversation deletion only for trusted exact origins and resource paths', async t=>{
  const f=await fixture(t);const c=await create(f);
  const preflight=(url,origin='http://localhost:4200')=>fetch(f.base+url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'DELETE','Access-Control-Request-Headers':'content-type'}});
  const ok=await preflight(`/api/agents/${f.a.id}/conversations/${c.id}`);assert.equal(ok.status,204);assert.match(ok.headers.get('access-control-allow-methods'),/DELETE/);
  assert.equal((await preflight(`/api/agents/${f.a.id}/conversations/${c.id}`,'https://untrusted.example')).status,403);
  assert.equal((await preflight('/api/agent/run')).status,403);assert.equal((await preflight(`/api/agents/${f.a.id}`)).status,403);
});

test('conversation and source references survive closing and reopening SQLite, without copied chunks', async t=>{
  const f=await fixture(t);const c=await create(f);await turn(f,c);
  const stored=JSON.parse(f.db.prepare("SELECT sources_json FROM support_messages WHERE role='assistant'").get().sources_json);
  assert.equal(stored[0].excerpt,undefined);assert.equal(stored[0].digest.length,64);
  f.db.close();const reopened=new Database(f.file);runMigrations(reopened);
  const app=express();app.use(express.json());const knowledge=registerSupportKnowledgeRoutes(app,{db:reopened,groq:{},pricing:{}},(_q,_s,next)=>next());
  registerSupportConversationRoutes(app,{db:reopened,answer:knowledge.answer},createDashboardHandlers(reopened,{localOnlyEnabled:true}).middleware);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try {
    const result=await fetch(`http://127.0.0.1:${server.address().port}/api/agents/${f.a.id}/conversations/${c.id}`);const data=await result.json();
    assert.equal(result.status,200);assert.equal(data.items[1].sources[0].filename,'public.txt');assert.equal(data.items[1].status,'completed');
  } finally {await new Promise(resolve=>server.close(resolve));reopened.close();}
});

test('failed linked writes roll back both messages and return a generic storage error', async t=>{
  const f=await fixture(t);const c=await create(f);
  f.db.exec("CREATE TRIGGER reject_assistant BEFORE INSERT ON support_messages WHEN new.role = 'assistant' BEGIN SELECT RAISE(ABORT, 'PRIVATE_SQL_DETAILS'); END;");
  const result=await turn(f,c);assert.equal(result.status,500);assert.equal(result.body.code,'storage_error');assert.ok(!JSON.stringify(result).includes('PRIVATE_SQL'));
  assert.equal(f.db.prepare('SELECT count(*) n FROM support_messages').get().n,0);assert.equal(f.calls.length,0);
});

test('actual provider prompt bounds prior user turns and shares busy limits with independent ask', async t=>{
  const f=await fixture(t);const c=await create(f);
  for(let i=0;i<8;i++) await turn(f,c,`retour article ${i} `+'x'.repeat(800));
  await turn(f,c,'Et ouvert ?');const prompt=JSON.parse(f.calls.at(-1).body.messages[1].content);
  assert.ok(prompt.conversationUserContext.length<=6);assert.ok(prompt.conversationUserContext.reduce((n,m)=>n+m.content.length,prompt.question.length)<=4000);
  let release,started;const ready=new Promise(resolve=>started=resolve);f.completion(()=>{started();return new Promise(resolve=>release=resolve);});
  const pending=turn(f,c);await ready;const other=await f.request(`/${f.a.id}/ask`,'POST',{question:'retour article'});assert.equal(other.status,429);
  release(answer('retour [S1]'));assert.equal((await pending).status,200);
});

test('modified source text masks historical citations without returning new text as old evidence', async t=>{
  const f=await fixture(t);const c=await create(f);await turn(f,c);
  f.db.prepare('UPDATE document_chunks SET chunk_text = ? WHERE document_id = ?').run('REPLACEMENT_SOURCE_CONTENT',f.publicId);
  const result=await history(f,c);assert.equal(result.body.items[1].stale,true);assert.deepEqual(result.body.items[1].sources,[]);assert.ok(!JSON.stringify(result.body).includes('REPLACEMENT_SOURCE_CONTENT'));
});

test('records genuine provider usage and configured estimates without representing them as billing', async t=>{
  const f=await fixture(t,{pricing:{'openai/gpt-oss-120b':{inputUsdPerMillion:1,outputUsdPerMillion:2}}});const c=await create(f);const result=await turn(f,c);
  const metadata=result.body.items[1].metadata;assert.equal(metadata.usage.inputTokens,20);assert.equal(metadata.usage.outputTokens,10);
  assert.equal(metadata.estimatedCostUsd,0.00004);assert.equal(metadata.isEstimate,true);assert.equal(metadata.unavailableReason,null);
  f.completion(()=>Promise.resolve({choices:[{message:{content:'retour [S1]'}}]}));const missing=await turn(f,c);
  assert.equal(missing.body.items[1].metadata.estimatedCostUsd,null);assert.equal(missing.body.items[1].metadata.usage.source,'unavailable');
});
