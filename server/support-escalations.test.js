import { createWorkflowLocalEngine } from './workflow-local-engine.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import express from 'express';
import Database from 'better-sqlite3';
import {runMigrations} from './migration-runner.js';
import {initializeDocumentStore} from './document-store.js';
import {registerSupportAgentRoutes} from './support-agents.js';
import {registerSupportTicketRoutes} from './support-tickets.js';
import {registerSupportEscalationRoutes} from './support-escalations.js';
import {createDashboardHandlers} from './dashboard-routes.js';
import {createCorsPolicy,parseCorsAllowedOrigins} from './cors-policy.js';
const config={name:'NovaShop fictif',description:'',role:'Support',systemInstructions:'Documents only',tone:'professional',language:'fr',model:'openai/gpt-oss-120b',temperature:.6,maxOutputTokens:1024,fallbackMessage:'Unavailable',escalationEnabled:false,status:'active'};
const intent=(data={})=>({requestId:randomUUID(),reason:'refund_validation',details:'NS-2026-1042 — exemple fictif',...data});
function legacy(){const db=new Database(':memory:');db.exec('CREATE TABLE documents_history(id INTEGER PRIMARY KEY,filename TEXT,file_type TEXT,created_at TEXT); CREATE TABLE form_submissions(id INTEGER PRIMARY KEY,created_at TEXT);');initializeDocumentStore(db);return db;}
async function fixture(t){
 const dir=mkdtempSync(path.join(tmpdir(),'support-escalations-')),file=path.join(dir,'test.db'),db=legacy();runMigrations(db);
 const app=express();app.use(createCorsPolicy(parseCorsAllowedOrigins()));app.use(express.json());let enabled=true;const guard=(req,res,next)=>createDashboardHandlers(db,{localOnlyEnabled:enabled}).middleware(req,res,next);
 registerSupportAgentRoutes(app,db,guard);registerSupportTicketRoutes(app,db,guard);registerSupportEscalationRoutes(app,db,guard);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true});});
 const request=async(route,method='GET',body,headers={})=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/agents${route}`,{method,headers:{Origin:'http://localhost:4200','Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:r.status===204?null:await r.json(),headers:r.headers};};
 const a=(await request('','POST',config)).body,b=(await request('','POST',{...config,name:'Other'})).body;
 const ticket=(await request('/'+a.id+'/tickets','POST',{requestId:randomUUID(),title:'Produit défectueux — NS-2026-1042',description:'Casque Bluetooth fictif'})).body;
 return {db,file,a,b,ticket,base:`/${a.id}/tickets/${ticket.id}/escalations`,request,disable:()=>enabled=false};
}
test('007 upgrades exactly six migrations without changing existing table rows; repeatable and persistent',async t=>{
 const db=legacy();t.after(()=>db.close());db.exec('CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
 for(const file of readdirSync(new URL('./migrations/',import.meta.url)).filter(f=>/^00[1-6]_/.test(f)).sort()){db.exec(readFileSync(new URL('./migrations/'+file,import.meta.url),'utf8'));db.prepare('INSERT INTO schema_migrations(version) VALUES(?)').run(file);}
 db.prepare("INSERT INTO form_submissions(id,created_at) VALUES(42,'2026-01-01')").run();const snapshot=()=>db.prepare('SELECT * FROM form_submissions').all();const before=snapshot();runMigrations(db);runMigrations(db);assert.deepEqual(snapshot(),before);assert.equal(db.prepare('SELECT count(*) n FROM schema_migrations').get().n,8);assert.deepEqual(db.pragma('foreign_key_check'),[]);
});
test('NovaShop full requested/assigned/note/resolved flow persists and leaves ticket classification/status/audit unchanged',async t=>{
 const f=await fixture(t);const before=f.db.prepare('SELECT * FROM support_tickets').all(),audit=f.db.prepare('SELECT * FROM support_ticket_events').all();
 let r=await f.request(f.base,'POST',intent());assert.equal(r.status,201);assert.equal(r.body.status,'requested');const id=r.body.id;
 const action=async(version,action,data)=>f.request(f.base+'/'+id,'PATCH',{version,action,requestId:randomUUID(),...data});
 r=await action(1,'assign',{operator:'Opérateur fictif'});assert.equal(r.body.status,'assigned');assert.ok(r.body.assignedAt);
 r=await action(2,'note',{note:'Demande examinée, aucun remboursement exécuté.'});assert.equal(r.body.version,3);
 r=await action(3,'resolve',{note:'Décision humaine fictive examinée.'});assert.equal(r.body.status,'resolved');assert.ok(r.body.resolvedAt);
 const events=(await f.request(f.base+'/'+id+'/events')).body;assert.deepEqual(events.items.map(e=>e.type),['requested','assigned','noted','resolved']);assert.equal(events.items[3].oldStatus,'assigned');assert.equal(events.items[3].operator,'Opérateur fictif');assert.equal('response_json' in events.items[0],false);
 const list=(await f.request(f.base)).body;assert.equal(list.active,null);assert.equal(list.items[0].status,'resolved');assert.deepEqual(f.db.prepare('SELECT * FROM support_tickets').all(),before);assert.deepEqual(f.db.prepare('SELECT * FROM support_ticket_events').all(),audit);
 await f.db.backup(f.file);const reopened=new Database(f.file);t.after(()=>reopened.close());runMigrations(reopened);assert.equal(reopened.prepare('SELECT status FROM support_escalations').get().status,'resolved');
});
test('request and action retries are idempotent, payload conflicts rejected, one active escalation',async t=>{
 const f=await fixture(t),body=intent();const results=await Promise.all([f.request(f.base,'POST',body),f.request(f.base,'POST',body)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);const id=results[0].body.id;assert.equal(results[1].body.id,id);
 assert.equal((await f.request(f.base,'POST',intent())).body.code,'active_escalation');assert.equal((await f.request(f.base,'POST',{...body,details:'changed'})).body.code,'idempotency_conflict');
 const action={requestId:randomUUID(),version:1,action:'assign',operator:'Fictif'};assert.equal((await f.request(f.base+'/'+id,'PATCH',action)).status,200);assert.equal((await f.request(f.base+'/'+id,'PATCH',action)).body.version,2);assert.equal((await f.request(f.base+'/'+id,'PATCH',{...action,operator:'Changed'})).status,409);assert.equal(f.db.prepare('SELECT count(*) n FROM support_escalation_events').get().n,2);
});
test('optimistic concurrency and terminal transitions, cancellation from requested and assigned',async t=>{
 const f=await fixture(t);let r=await f.request(f.base,'POST',intent()),id=r.body.id;
 const act=(version,action,data={})=>f.request(f.base+'/'+id,'PATCH',{requestId:randomUUID(),version,action,...data});
 assert.equal((await act(1,'resolve',{note:'Premature'})).body.code,'invalid_transition');
 const simultaneous=await Promise.all([act(1,'assign',{operator:'A'}),act(1,'cancel',{note:'B'})]);assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,409]);
 let current=(await f.request(f.base)).body.items[0];if(current.status==='assigned')await act(2,'cancel',{note:'Annulation explicite'});
 assert.equal((await act(3,'note',{note:'Terminal'})).status,409);
 r=await f.request(f.base,'POST',intent());assert.equal(r.status,201);id=r.body.id;assert.equal((await act(1,'cancel',{note:'Annulation avant affectation'})).body.status,'cancelled');
});
test('strict input, ownership, bounded pagination and scoped CORS/guard',async t=>{
 const f=await fixture(t);for(const body of [intent({reason:'invented'}),intent({reason:'other',details:''}),intent({requestId:'bad'}),intent({details:'x'.repeat(2001)}),intent({extra:true}),intent({details:'\0'})])assert.equal((await f.request(f.base,'POST',body)).status,400);
 assert.equal((await f.request(f.base.replace(f.a.id,f.b.id))).status,404);const row=(await f.request(f.base,'POST',intent())).body;
 for(const body of [{requestId:randomUUID(),version:1,action:'assign',operator:''},{requestId:randomUUID(),version:1,action:'assign',operator:'Fictif',note:'unexpected'},{requestId:randomUUID(),version:'1',action:'cancel',note:'x'},{requestId:randomUUID(),version:1,action:'note',note:'x'.repeat(4001)}])assert.equal((await f.request(f.base+'/'+row.id,'PATCH',body)).status,400);
 for(const q of ['limit=0','offset=-1','limit=51','extra=1','limit=2&limit=3'])assert.equal((await f.request(f.base+'?'+q)).status,400);
 assert.equal((await f.request(f.base+'/'+row.id,'OPTIONS',undefined,{'Access-Control-Request-Method':'PATCH'})).status,204);assert.equal((await f.request(f.base,'OPTIONS',undefined,{'Access-Control-Request-Method':'PATCH'})).status,403);
 f.disable();assert.equal((await f.request(f.base)).status,403);assert.equal((await f.request(f.base,'POST',intent())).status,403);
});
test('audit failure rolls back request and mutation without leaking SQL or private notes',async t=>{
 const f=await fixture(t);f.db.exec("CREATE TRIGGER refuse_handoff BEFORE INSERT ON support_escalation_events BEGIN SELECT RAISE(ABORT,'PRIVATE_ERROR'); END;");
 let r=await f.request(f.base,'POST',intent());assert.equal(r.status,500);assert.equal(JSON.stringify(r.body).includes('PRIVATE_ERROR'),false);assert.equal(f.db.prepare('SELECT count(*) n FROM support_escalations').get().n,0);
 f.db.exec('DROP TRIGGER refuse_handoff');const row=(await f.request(f.base,'POST',intent())).body;
 f.db.exec("CREATE TRIGGER refuse_handoff BEFORE INSERT ON support_escalation_events BEGIN SELECT RAISE(ABORT,'PRIVATE_ERROR'); END;");r=await f.request(f.base+'/'+row.id,'PATCH',{requestId:randomUUID(),version:1,action:'assign',operator:'Private'});assert.equal(r.status,500);assert.equal((await f.request(f.base)).body.active.status,'requested');assert.equal(f.db.prepare('SELECT count(*) n FROM support_escalation_events').get().n,1);
 assert.throws(()=>f.db.prepare("UPDATE support_escalation_events SET note='Rewrite'").run());
});

test('escalation IDs cannot be used under another ticket; quota, cascades and terminal events remain scoped',async t=>{
 const f=await fixture(t),created=(await f.request(f.base,'POST',intent())).body;
 const other=(await f.request('/'+f.a.id+'/tickets','POST',{requestId:randomUUID(),title:'Autre ticket fictif',description:'Test'})).body;
 const wrong=f.base.replace(f.ticket.id,other.id)+'/'+created.id;
 assert.equal((await f.request(wrong+'/events')).status,404);
 assert.equal((await f.request(wrong,'PATCH',{requestId:randomUUID(),version:1,action:'assign',operator:'Fictif'})).status,404);
 const schema=f.db.prepare("SELECT sql FROM sqlite_master WHERE name='support_escalations'").get().sql;assert.ok(schema.includes('support_tickets'));
 assert.throws(()=>f.db.prepare("INSERT INTO support_escalations(id,ticket_id,reason,details,created_at) VALUES(?,?,'other','test','2026-01-01')").run(randomUUID(),f.ticket.id));
 f.db.prepare('DELETE FROM support_agents WHERE id=?').run(f.a.id);assert.equal(f.db.prepare('SELECT count(*) n FROM support_escalations').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM support_escalation_events').get().n,0);assert.deepEqual(f.db.pragma('foreign_key_check'),[]);
});


test('local automation captures a real confirmed handoff exactly once while saturated or paused',async t=>{
 const f=await fixture(t),engine=createWorkflowLocalEngine(f.db),binding=engine.createBinding({agentId:f.a.id,requestId:randomUUID(),confirm:true});
 engine.setBinding({agentId:f.a.id,bindingId:binding.id,expectedVersion:1,enabled:true,requestId:randomUUID(),confirm:true});
 engine.setDispatcher({expectedVersion:1,enabled:true,capacity:1,requestId:randomUUID(),confirm:true});
 const first=intent();const response=await f.request(f.base,'POST',first);assert.equal(response.status,201);assert.equal((await f.request(f.base,'POST',first)).status,200);assert.equal(engine.listReceipts(f.a.id).total,1);engine.materialize();
 await f.request(f.base+'/'+response.body.id,'PATCH',{requestId:randomUUID(),version:1,action:'cancel',note:'Fictif'});
 const second=await f.request(f.base,'POST',intent());assert.equal(second.status,201);assert.equal(engine.materialize().created,0);assert.equal(engine.listReceipts(f.a.id).total,2);assert.equal(engine.listReceipts(f.a.id).items.filter(r=>r.state==='deferred').length,1);
 engine.setDispatcher({expectedVersion:2,enabled:false,requestId:randomUUID(),confirm:true});
 await f.request(f.base+'/'+second.body.id,'PATCH',{requestId:randomUUID(),version:1,action:'cancel',note:'Fictif'});
 assert.equal((await f.request(f.base,'POST',intent())).status,201);assert.equal(engine.listReceipts(f.a.id).total,3);assert.equal(engine.listReceipts(f.a.id).items.at(-1).state,'paused');
 assert.equal(f.db.prepare('SELECT count(*) n FROM support_ticket_events').get().n,2);
});

test('failure of durable eligibility capture rolls back the entire handoff transaction',async t=>{
 const f=await fixture(t),engine=createWorkflowLocalEngine(f.db),binding=engine.createBinding({agentId:f.a.id,requestId:randomUUID(),confirm:true});engine.setBinding({agentId:f.a.id,bindingId:binding.id,expectedVersion:1,enabled:true,requestId:randomUUID(),confirm:true});
 f.db.exec("CREATE TRIGGER unavailable_storage BEFORE INSERT ON workflow_receipts BEGIN SELECT RAISE(ABORT,'STORAGE_UNAVAILABLE'); END;");
 const response=await f.request(f.base,'POST',intent());assert.equal(response.status,500);assert.equal(response.body.code,'storage_error');assert.equal(f.db.prepare('SELECT count(*) n FROM support_escalations').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM support_escalation_events').get().n,0);assert.equal(engine.listReceipts(f.a.id).total,0);
});
