import { createHash, randomUUID } from 'node:crypto';

export const TICKET_CATEGORIES = Object.freeze(['technical', 'billing', 'account', 'product', 'defective_product', 'returns', 'delivery', 'general', 'other']);
export const TICKET_PRIORITIES = Object.freeze(['low', 'medium', 'high', 'urgent']);
export const TICKET_STATUSES = Object.freeze(['open', 'in_progress', 'waiting', 'resolved', 'closed']);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !value.includes('\0');
const fail = (res, status, code) => res.status(status).json({ code, error: 'Ticket request could not be completed.' });
const raise = (status, code) => { throw Object.assign(new Error(code), { status, code }); };

/** Ordered, bounded lexical rules, not semantic understanding or a confidence measurement. */
export function classifyTicket(title, description) {
  const input = `${title} ${description}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const rules = [
    ['defective_product', /\b(defective|broken|faulty|defectueux|defectueuse|casse|cassee)\b/],
    ['returns', /\b(return|returns|refund|retour|retours|remboursement)\b/],
    ['delivery', /\b(delivery|shipping|livraison|expedition|colis)\b/],
    ['billing', /\b(invoice|billing|payment|facture|facturation|paiement)\b/],
    ['account', /\b(account|login|password|compte|connexion|identifiant|mot de passe)\b/],
    ['technical', /\b(error|bug|outage|crash|erreur|panne|incident)\b/],
    ['product', /\b(product|warranty|produit|garantie)\b/],
    ['general', /\b(information|hours|horaire|horaires|renseignement|renseignements)\b/]
  ];
  const category = rules.find(([, pattern]) => pattern.test(input))?.[0] ?? 'other';
  const priority = /\b(urgent|critical|critique)\b/.test(input) ? 'urgent'
    : /\b(blocked|blocking|outage|bloque|bloquante|panne)\b/.test(input) ? 'high'
      : /\b(suggestion|feature request)\b/.test(input) ? 'low' : 'medium';
  return { category, priority, source: 'rules', reason: `${category}:${category === 'other' ? 'default' : 'keywords'};${priority}:${priority === 'medium' ? 'default' : 'keywords'}`, confidence: null };
}

export function registerSupportTicketRoutes(app, db, guard) {
  const base = '/api/agents/:id/tickets';
  const read = (id, agent) => db.prepare('SELECT * FROM support_tickets WHERE id = ? AND agent_id = ?').get(id, agent);
  const serialize = row => ({ id: row.id, agentId: row.agent_id, conversationId: row.conversation_id, sourceMessageId: row.source_message_id,
    title: row.title, description: row.description, category: row.category, priority: row.priority, status: row.status,
    classificationSource: row.classification_source, classificationReason: row.classification_reason, classificationConfidence: row.classification_confidence,
    version: row.version, createdAt: row.created_at, updatedAt: row.updated_at, closedAt: row.closed_at });
  const event = db.prepare('INSERT INTO support_ticket_events(ticket_id,type,old_value,new_value,origin,created_at) VALUES(?,?,?,?,?,?)');
  const wrap = handler => (req, res) => {
    try {
      if (!uuid(req.params.id) || (req.params.ticketId !== undefined && !uuid(req.params.ticketId))) return fail(res, 400, 'invalid_id');
      if (!db.prepare('SELECT 1 FROM support_agents WHERE id = ?').get(req.params.id)) return fail(res, 404, 'not_found');
      if (['POST', 'PATCH'].includes(req.method) && (!req.is('application/json') || !object(req.body))) return fail(res, 400, 'invalid_body');
      if (['POST','PATCH'].includes(req.method) && Object.keys(req.query).length) return fail(res, 400, 'invalid_query');
      return handler(req, res);
    } catch (error) { return fail(res, error.status ?? 500, error.code && error.status ? error.code : 'storage_error'); }
  };
  const page = (query, allowed) => {
    if (Object.keys(query).some(key => !allowed.includes(key)) || Object.values(query).some(value => typeof value !== 'string')) raise(400, 'invalid_query');
    const limit = query.limit === undefined ? 25 : Number(query.limit), offset = query.offset === undefined ? 0 : Number(query.offset);
    if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset) || limit < 1 || limit > 50 || offset < 0 || offset > 10000 ||
      (query.limit !== undefined && !/^\d+$/.test(query.limit)) || (query.offset !== undefined && !/^\d+$/.test(query.offset))) raise(400, 'invalid_query');
    return { limit, offset };
  };
  app.get(base, guard, wrap((req, res) => {
    const p = page(req.query, ['limit', 'offset', 'status', 'priority', 'category', 'search', 'conversationId']);
    const clauses = ['agent_id = ?'], values = [req.params.id];
    for (const [key, allowed] of [['status', TICKET_STATUSES], ['priority', TICKET_PRIORITIES], ['category', TICKET_CATEGORIES]]) {
      if (req.query[key] !== undefined) {
        if (!allowed.includes(req.query[key])) return fail(res, 400, 'invalid_query');
        clauses.push(`${key} = ?`);values.push(req.query[key]);
      }
    }
    if (req.query.conversationId !== undefined) {
      if (!uuid(req.query.conversationId) || !db.prepare('SELECT 1 FROM support_conversations WHERE id=? AND agent_id=?').get(req.query.conversationId, req.params.id)) return fail(res, 404, 'invalid_reference');
      clauses.push('conversation_id = ?');values.push(req.query.conversationId);
    }
    if (req.query.search !== undefined) {
      if (req.query.search.length > 100 || req.query.search.includes('\0')) return fail(res, 400, 'invalid_query');
      // instr treats wildcard characters literally; bounded scan within one agent's quota.
      clauses.push('(instr(lower(title), lower(?)) > 0 OR instr(lower(description), lower(?)) > 0)');values.push(req.query.search.trim(), req.query.search.trim());
    }
    const where = clauses.join(' AND ');
    const items = db.prepare(`SELECT * FROM support_tickets WHERE ${where} ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?`).all(...values, p.limit, p.offset).map(serialize);
    const total = db.prepare(`SELECT count(*) n FROM support_tickets WHERE ${where}`).get(...values).n;
    const counts = Object.fromEntries(TICKET_STATUSES.map(status => [status, 0]));
    for (const row of db.prepare('SELECT status, count(*) n FROM support_tickets WHERE agent_id = ? GROUP BY status').all(req.params.id)) counts[row.status] = row.n;
    res.json({ items, total, ...p, counts });
  }));
  app.post(base, guard, wrap((req, res) => {
    const b = req.body, keys = ['requestId', 'title', 'description', 'conversationId', 'sourceMessageId', 'category', 'priority'];
    if (Object.keys(b).some(key => !keys.includes(key)) || !uuid(b.requestId) || !text(b.title, 160) || !text(b.description, 4000) ||
      (b.conversationId != null && !uuid(b.conversationId)) || (b.sourceMessageId != null && !uuid(b.sourceMessageId)) ||
      (b.sourceMessageId != null && b.conversationId == null) ||
      ((b.category === undefined) !== (b.priority === undefined)) ||
      (b.category !== undefined && (!TICKET_CATEGORIES.includes(b.category) || !TICKET_PRIORITIES.includes(b.priority)))) return fail(res, 400, 'invalid_body');
    const data = { title: b.title.trim(), description: b.description.trim(), conversationId: b.conversationId ?? null, sourceMessageId: b.sourceMessageId ?? null,
      category: b.category ?? null, priority: b.priority ?? null };
    const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const result = db.transaction(() => {
      const previous = db.prepare('SELECT * FROM support_tickets WHERE agent_id = ? AND request_id = ?').get(req.params.id, b.requestId);
      if (previous) { if (previous.request_hash !== hash) raise(409, 'idempotency_conflict');return { ticket: serialize(previous), replay: true }; }
      if (data.conversationId && !db.prepare('SELECT 1 FROM support_conversations WHERE id = ? AND agent_id = ?').get(data.conversationId, req.params.id)) raise(404, 'invalid_reference');
      if (data.sourceMessageId && !db.prepare('SELECT 1 FROM support_messages WHERE id = ? AND conversation_id = ?').get(data.sourceMessageId, data.conversationId)) raise(404, 'invalid_reference');
      if (db.prepare('SELECT count(*) n FROM support_tickets WHERE agent_id = ?').get(req.params.id).n >= 1000) raise(409, 'ticket_limit');
      const classification = data.category ? { category: data.category, priority: data.priority, source: 'manual', reason: 'manual', confidence: null } : classifyTicket(data.title, data.description);
      const id = randomUUID(), now = new Date().toISOString();
      db.prepare(`INSERT INTO support_tickets(id,agent_id,conversation_id,source_message_id,request_id,request_hash,title,description,category,priority,classification_source,classification_reason,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, req.params.id, data.conversationId, data.sourceMessageId, b.requestId, hash, data.title, data.description, classification.category, classification.priority, classification.source, classification.reason, now, now);
      event.run(id, 'created', null, JSON.stringify({ status: 'open', category: classification.category, priority: classification.priority, source: classification.source }), 'local_user', now);
      event.run(id, 'classified', null, classification.reason, classification.source === 'rules' ? 'system' : 'local_user', now);
      return { ticket: serialize(read(id, req.params.id)), replay: false };
    }).immediate();
    res.status(result.replay ? 200 : 201).json(result.ticket);
  }));
  app.get(`${base}/:ticketId`, guard, wrap((req, res) => {
    if (Object.keys(req.query).length) return fail(res, 400, 'invalid_query');
    const ticket = read(req.params.ticketId, req.params.id);if (!ticket) return fail(res, 404, 'not_found');res.json(serialize(ticket));
  }));
  app.patch(`${base}/:ticketId`, guard, wrap((req, res) => {
    const b = req.body, fields = ['status', 'priority', 'category'];
    if (Object.keys(b).some(key => ![...fields, 'version'].includes(key)) || !Number.isSafeInteger(b.version) || b.version < 1 || !fields.some(key => key in b) ||
      (b.status !== undefined && !TICKET_STATUSES.includes(b.status)) || (b.priority !== undefined && !TICKET_PRIORITIES.includes(b.priority)) || (b.category !== undefined && !TICKET_CATEGORIES.includes(b.category))) return fail(res, 400, 'invalid_body');
    const result = db.transaction(() => {
      const ticket = read(req.params.ticketId, req.params.id);if (!ticket) raise(404, 'not_found');if (ticket.version !== b.version) raise(409, 'version_conflict');
      const changes = fields.filter(key => b[key] !== undefined && b[key] !== ticket[key]);
      if (!changes.length) return serialize(ticket);
      const now = new Date().toISOString(), status = b.status ?? ticket.status;
      const manual = changes.some(key => key === 'priority' || key === 'category');
      db.prepare(`UPDATE support_tickets SET status=?,priority=?,category=?,classification_source=?,classification_reason=?,closed_at=?,version=version+1,updated_at=? WHERE id=? AND agent_id=?`)
        .run(status, b.priority ?? ticket.priority, b.category ?? ticket.category, manual ? 'manual' : ticket.classification_source, manual ? 'manual_override' : ticket.classification_reason,
          status === 'closed' ? (ticket.closed_at ?? now) : null, now, ticket.id, req.params.id);
      for (const key of changes) event.run(ticket.id, `${key}_changed`, ticket[key], b[key], 'local_user', now);
      if (manual && ticket.classification_source !== 'manual') event.run(ticket.id, 'classification_changed', ticket.classification_source, 'manual', 'local_user', now);
      return serialize(read(ticket.id, req.params.id));
    }).immediate();res.json(result);
  }));
  app.get(`${base}/:ticketId/events`, guard, wrap((req, res) => {
    const p = page(req.query, ['limit', 'offset']);if (!read(req.params.ticketId, req.params.id)) return fail(res, 404, 'not_found');
    const items = db.prepare('SELECT id,type,old_value AS oldValue,new_value AS newValue,origin,created_at AS createdAt FROM support_ticket_events WHERE ticket_id = ? ORDER BY id ASC LIMIT ? OFFSET ?').all(req.params.ticketId, p.limit, p.offset);
    res.json({ items, total: db.prepare('SELECT count(*) n FROM support_ticket_events WHERE ticket_id = ?').get(req.params.ticketId).n, ...p });
  }));
}
