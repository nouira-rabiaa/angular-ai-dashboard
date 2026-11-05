import { randomUUID, createHash } from 'node:crypto';
export const ESCALATION_REASONS = ['refund_validation','complex_complaint','insufficient_information','human_requested','other'];
const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const text = (x, max, required = true) => typeof x === 'string' && x.length <= max && !x.includes('\0') && (!required || x.trim().length > 0);
const raise = (status, code) => { throw Object.assign(new Error(code), { status, code }); };
const serialize = r => ({ id:r.id,ticketId:r.ticket_id,reason:r.reason,details:r.details,status:r.status,operator:r.operator,note:r.note,version:r.version,createdAt:r.created_at,assignedAt:r.assigned_at,resolvedAt:r.resolved_at,cancelledAt:r.cancelled_at });
export function registerSupportEscalationRoutes(app, db, guard) {
 const base='/api/agents/:id/tickets/:ticketId/escalations';
 const read=(id,ticket)=>db.prepare('SELECT * FROM support_escalations WHERE id=? AND ticket_id=?').get(id,ticket);
 const wrap=handler=>(req,res)=>{try {
  if(!uuid(req.params.id)||!uuid(req.params.ticketId)||(req.params.escalationId!==undefined&&!uuid(req.params.escalationId)))raise(400,'invalid_id');
  if(!db.prepare('SELECT 1 FROM support_tickets WHERE id=? AND agent_id=?').get(req.params.ticketId,req.params.id))raise(404,'not_found');
  if(req.method!=='GET' && (!req.is('application/json')||!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.query).length))raise(400,'invalid_body');
  handler(req,res);
 } catch(e){res.status(e.status??500).json({code:e.status?e.code:'storage_error',error:'Escalation request could not be completed.'});}};
 const page=q=>{if(Object.keys(q).some(k=>!['limit','offset'].includes(k))||Object.values(q).some(v=>typeof v!=='string'||!/^\d+$/.test(v)))raise(400,'invalid_query');const limit=Number(q.limit??25),offset=Number(q.offset??0);if(!Number.isSafeInteger(limit)||!Number.isSafeInteger(offset)||limit<1||limit>50||offset<0||offset>10000)raise(400,'invalid_query');return {limit,offset};};
 const replay=(ticket,key,hash)=>{const old=db.prepare('SELECT request_hash,response_json FROM support_escalation_events WHERE ticket_id=? AND request_id=?').get(ticket,key);if(!old)return null;if(old.request_hash!==hash)raise(409,'idempotency_conflict');return JSON.parse(old.response_json);};
 const audit=(ticket,key,hash,type,old,row)=>{const response=serialize(row);db.prepare('INSERT INTO support_escalation_events(escalation_id,ticket_id,request_id,request_hash,type,old_status,new_status,operator,note,created_at,response_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(row.id,ticket,key,hash,type,old,row.status,row.operator,row.note,new Date().toISOString(),JSON.stringify(response));return response;};
 app.get(base,guard,wrap((req,res)=>{const p=page(req.query),ticket=req.params.ticketId;res.json({active:(()=>{const r=db.prepare("SELECT * FROM support_escalations WHERE ticket_id=? AND status IN ('requested','assigned')").get(ticket);return r?serialize(r):null;})(),items:db.prepare('SELECT * FROM support_escalations WHERE ticket_id=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?').all(ticket,p.limit,p.offset).map(serialize),total:db.prepare('SELECT count(*) n FROM support_escalations WHERE ticket_id=?').get(ticket).n,...p});}));
 app.post(base,guard,wrap((req,res)=>{
  const b=req.body;if(Object.keys(b).some(k=>!['requestId','reason','details'].includes(k))||!uuid(b.requestId)||!ESCALATION_REASONS.includes(b.reason)||(b.details!==undefined&&!text(b.details,2000,false)))raise(400,'invalid_body');
  const data={reason:b.reason,details:(b.details??'').trim()};if(data.reason==='other'&&!data.details)raise(400,'invalid_body');
  const hash=createHash('sha256').update(JSON.stringify({action:'request',...data})).digest('hex');
  const result=db.transaction(()=>{const prior=replay(req.params.ticketId,b.requestId,hash);if(prior)return {response:prior,replay:true};
   if(db.prepare("SELECT 1 FROM support_escalations WHERE ticket_id=? AND status IN ('requested','assigned')").get(req.params.ticketId))raise(409,'active_escalation');
   if(db.prepare('SELECT count(*) n FROM support_escalations WHERE ticket_id=?').get(req.params.ticketId).n>=100)raise(409,'escalation_limit');
   const id=randomUUID();db.prepare('INSERT INTO support_escalations(id,ticket_id,reason,details,created_at) VALUES(?,?,?,?,?)').run(id,req.params.ticketId,data.reason,data.details,new Date().toISOString());
   return {response:audit(req.params.ticketId,b.requestId,hash,'requested',null,read(id,req.params.ticketId)),replay:false};
  }).immediate();res.status(result.replay?200:201).json(result.response);
 }));
 app.patch(`${base}/:escalationId`,guard,wrap((req,res)=>{
  const b=req.body,allowed=b.action==='assign'?['requestId','version','action','operator']:['requestId','version','action','note'];
  if(Object.keys(b).some(k=>!allowed.includes(k))||!uuid(b.requestId)||!Number.isSafeInteger(b.version)||b.version<1||!['assign','note','resolve','cancel'].includes(b.action)||(b.action==='assign'?!text(b.operator,100):!text(b.note,4000)))raise(400,'invalid_body');
  const data={id:req.params.escalationId,version:b.version,action:b.action,...(b.action==='assign'?{operator:b.operator.trim()}:{note:b.note.trim()})};
  const hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const response=db.transaction(()=>{const prior=replay(req.params.ticketId,b.requestId,hash);if(prior)return prior;const row=read(data.id,req.params.ticketId);if(!row)raise(404,'not_found');if(row.version!==b.version)raise(409,'version_conflict');
   if(!['requested','assigned'].includes(row.status)||(b.action==='assign'&&row.status!=='requested')||(b.action==='resolve'&&row.status!=='assigned'))raise(409,'invalid_transition');
   const now=new Date().toISOString(),status={assign:'assigned',resolve:'resolved',cancel:'cancelled',note:row.status}[b.action];
   db.prepare('UPDATE support_escalations SET status=?,operator=?,note=?,assigned_at=?,resolved_at=?,cancelled_at=?,version=version+1 WHERE id=? AND ticket_id=?').run(status,data.operator??row.operator,data.note??row.note,b.action==='assign'?now:row.assigned_at,b.action==='resolve'?now:row.resolved_at,b.action==='cancel'?now:row.cancelled_at,data.id,req.params.ticketId);
   return audit(req.params.ticketId,b.requestId,hash,{assign:'assigned',note:'noted',resolve:'resolved',cancel:'cancelled'}[b.action],row.status,read(data.id,req.params.ticketId));
  }).immediate();res.json(response);
 }));
 app.get(`${base}/:escalationId/events`,guard,wrap((req,res)=>{const p=page(req.query);if(!read(req.params.escalationId,req.params.ticketId))raise(404,'not_found');res.json({items:db.prepare('SELECT id,type,old_status AS oldStatus,new_status AS newStatus,operator,note,created_at AS createdAt FROM support_escalation_events WHERE escalation_id=? ORDER BY id LIMIT ? OFFSET ?').all(req.params.escalationId,p.limit,p.offset),total:db.prepare('SELECT count(*) n FROM support_escalation_events WHERE escalation_id=?').get(req.params.escalationId).n,...p});}));
}
