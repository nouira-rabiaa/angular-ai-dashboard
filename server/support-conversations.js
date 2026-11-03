import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const CONVERSATION_LIMITS = Object.freeze({ conversations: 50, messages: 200, memoryMessages: 6, memoryCharacters: 4000 });
const digest = text => createHash('sha256').update(text).digest('hex');
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = (res, status, code) => res.status(status).json({ code, error: 'Conversation request could not be completed.' });

// Deliberately includes user turns only: historical model answers/excerpts are never model evidence.
export function conversationMemory(rows, currentQuestion) {
  let remaining = CONVERSATION_LIMITS.memoryCharacters - currentQuestion.length;
  const memory = [];
  for (const row of rows.slice().reverse()) {
    if (memory.length >= CONVERSATION_LIMITS.memoryMessages || remaining <= 0) break;
    const content = row.content.slice(0, remaining);remaining -= content.length;
    memory.unshift({ role: 'user', content });
  }
  return memory;
}

export function registerSupportConversationRoutes(app, { db, answer }, guard) {
  // Single local BFF process. Recover requests interrupted by a previous process, never auto-retry a paid call.
  db.prepare("UPDATE support_messages SET status = 'failed', metadata_json = ? WHERE status = 'pending'")
    .run(JSON.stringify({ code: 'interrupted' }));
  const base = '/api/agents/:id/conversations';
  const agentFor = (req, res) => {
    if (!UUID.test(req.params.id)) { fail(res, 400, 'invalid_id');return; }
    const agent = db.prepare('SELECT * FROM support_agents WHERE id = ?').get(req.params.id);
    if (!agent) fail(res, 404, 'not_found');
    return agent;
  };
  const owned = (req, res) => {
    const agent = agentFor(req, res);if (!agent) return;
    if (!UUID.test(req.params.conversationId)) { fail(res, 400, 'invalid_id');return; }
    const conversation = db.prepare('SELECT * FROM support_conversations WHERE id = ? AND agent_id = ?').get(req.params.conversationId, agent.id);
    if (!conversation) { fail(res, 404, 'not_found');return; }
    return { agent, conversation };
  };
  const safe = handler => async (req, res) => {
    try { await handler(req, res); } catch { if (!res.headersSent && !res.destroyed) fail(res, 500, 'storage_error'); }
  };
  const page = (req, res, allowed) => {
    if (Object.keys(req.query).some(key => !allowed.includes(key))) { fail(res, 400, 'invalid_page');return; }
    const limit = req.query.limit === undefined ? 30 : Number(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    const before = req.query.before === undefined ? Number.MAX_SAFE_INTEGER : Number(req.query.before);
    if (![limit, offset, before].every(Number.isSafeInteger) || limit < 1 || limit > 50 || offset < 0 || offset > 10000 || before < 1) { fail(res, 400, 'invalid_page');return; }
    return { limit, offset, before };
  };
  const serialize = row => {
    const sources = JSON.parse(row.sources_json);
    const authorized = db.prepare(`SELECT d.filename, k.chunk_text, k.page_number, k.start_offset, k.end_offset
      FROM support_conversations c JOIN support_agent_documents b ON b.agent_id = c.agent_id
      JOIN document_chunks k ON k.document_id = b.document_id JOIN documents_history d ON d.id = k.document_id
      WHERE c.id = ? AND b.document_id = ? AND k.id = ?`);
    const hydrated = sources.map(source => {
      const current = authorized.get(row.conversation_id, source.documentId, source.chunkId);
      if (!current || digest(current.chunk_text.slice(0, 1200)) !== source.digest) return null;
      return { label: source.label, documentId: source.documentId, chunkId: source.chunkId,
        filename: current.filename, excerpt: current.chunk_text.slice(0, 1200), pageNumber: current.page_number,
        startOffset: current.start_offset, endOffset: current.end_offset };
    });
    const stale = hydrated.some(source => source === null);
    return { id: row.id, sequence: row.sequence, requestId: row.request_id, role: row.role,
      content: stale ? 'Réponse historique masquée : une source n’est plus autorisée.' : row.content,
      status: row.status, createdAt: row.created_at, sources: stale ? [] : hydrated, stale,
      metadata: JSON.parse(row.metadata_json) };
  };
  const pair = (id, requestId) => db.prepare('SELECT * FROM support_messages WHERE conversation_id = ? AND request_id = ? ORDER BY sequence').all(id, requestId).map(serialize);
  app.get(base, guard, safe((req, res) => {
    const agent = agentFor(req, res);if (!agent) return;const p = page(req, res, ['limit', 'offset']);if (!p) return;
    const items = db.prepare('SELECT * FROM support_conversations WHERE agent_id = ? ORDER BY updated_at DESC, id LIMIT ? OFFSET ?').all(agent.id, p.limit, p.offset);
    res.json({ items, total: db.prepare('SELECT count(*) n FROM support_conversations WHERE agent_id = ?').get(agent.id).n, limit: p.limit, offset: p.offset });
  }));
  app.post(base, guard, safe((req, res) => {
    const agent = agentFor(req, res);if (!agent) return;
    if (!req.is('application/json') || !plain(req.body) || Object.keys(req.body).length) return fail(res, 400, 'invalid_body');
    if (agent.status !== 'active') return fail(res, 409, 'agent_inactive');
    const created = db.transaction(() => {
      if (db.prepare('SELECT count(*) n FROM support_conversations WHERE agent_id = ?').get(agent.id).n >= CONVERSATION_LIMITS.conversations) return null;
      const id = randomUUID(), now = new Date().toISOString();
      db.prepare('INSERT INTO support_conversations (id, agent_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, agent.id, 'Nouvelle conversation', now, now);
      return db.prepare('SELECT * FROM support_conversations WHERE id = ?').get(id);
    }).immediate();
    if (!created) return fail(res, 409, 'conversation_limit');res.status(201).json(created);
  }));
  app.get(`${base}/:conversationId`, guard, safe((req, res) => {
    const state = owned(req, res);if (!state) return;const p = page(req, res, ['limit', 'before']);if (!p) return;
    const rows = db.prepare('SELECT * FROM support_messages WHERE conversation_id = ? AND sequence < ? ORDER BY sequence DESC LIMIT ?').all(state.conversation.id, p.before, p.limit + 1);
    const hasMore = rows.length > p.limit;const items = rows.slice(0, p.limit).reverse().map(serialize);
    res.json({ conversation: state.conversation, items, nextBefore: hasMore ? items[0].sequence : null });
  }));
  app.delete(`${base}/:conversationId`, guard, safe((req, res) => {
    const state = owned(req, res);if (!state) return;
    db.prepare('DELETE FROM support_conversations WHERE id = ? AND agent_id = ?').run(state.conversation.id, state.agent.id);
    res.status(204).end();
  }));
  app.post(`${base}/:conversationId/messages`, guard, safe(async (req, res) => {
    const state = owned(req, res);if (!state) return;
    const { agent, conversation } = state;const body = req.body;
    if (!req.is('application/json') || !plain(body) || Object.keys(body).some(key => !['question', 'requestId'].includes(key)) ||
      !UUID.test(body.requestId) || typeof body.question !== 'string' || !body.question.trim() || body.question.length > 2000 || body.question.includes('\0')) return fail(res, 400, 'invalid_body');
    const previous = db.prepare("SELECT * FROM support_messages WHERE conversation_id = ? AND request_id = ? AND role = 'user'").get(conversation.id, body.requestId);
    if (previous) {
      if (previous.content !== body.question.trim()) return fail(res, 409, 'idempotency_conflict');
      const items = pair(conversation.id, body.requestId);return res.status(items.some(item => item.status === 'pending') ? 202 : 200).json({ items });
    }
    if (agent.status !== 'active') return fail(res, 409, 'agent_inactive');
    const memory = conversationMemory(db.prepare(`SELECT u.content FROM support_messages u WHERE u.conversation_id = ? AND u.role = 'user'
      AND EXISTS (SELECT 1 FROM support_messages a WHERE a.conversation_id = u.conversation_id AND a.request_id = u.request_id AND a.role = 'assistant' AND a.status = 'completed')
      ORDER BY u.sequence DESC LIMIT ?`).all(conversation.id, CONVERSATION_LIMITS.memoryMessages).reverse(), body.question);
    const begin = db.transaction(() => {
      if (db.prepare("SELECT 1 FROM support_messages WHERE conversation_id = ? AND status = 'pending'").get(conversation.id)) return 'conversation_busy';
      if (db.prepare('SELECT count(*) n FROM support_messages WHERE conversation_id = ?').get(conversation.id).n >= CONVERSATION_LIMITS.messages) return 'message_limit';
      const now = new Date().toISOString();const insert = db.prepare('INSERT INTO support_messages (id, conversation_id, request_id, role, content, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      insert.run(randomUUID(), conversation.id, body.requestId, 'user', body.question.trim(), 'completed', now);
      insert.run(randomUUID(), conversation.id, body.requestId, 'assistant', '', 'pending', now);
      db.prepare('UPDATE support_conversations SET title = CASE WHEN NOT EXISTS (SELECT 1 FROM support_messages WHERE conversation_id = ? AND role = ? AND request_id <> ?) THEN ? ELSE title END, updated_at = ? WHERE id = ?')
        .run(conversation.id, 'user', body.requestId, body.question.trim().slice(0, 80), now, conversation.id);
    }).immediate();
    if (begin) return fail(res, 409, begin);
    // Continue across a client disconnect so reload can recover the durable outcome. Provider timeout still applies.
    const sink = new EventEmitter();let status = 200, result;
    sink.status = code => { status = code;return sink; };sink.json = data => { result = data;return sink; };
    try { await answer({ params: { id: agent.id }, body: { question: body.question }, is: () => true }, sink, memory); }
    catch { status = 500;result = { code: 'generation_failed' }; }
    const alive = db.prepare('SELECT 1 FROM support_conversations WHERE id = ? AND agent_id = ?').get(conversation.id, agent.id);
    if (!alive) return fail(res, 404, 'not_found');
    const current = db.prepare('SELECT * FROM support_agents WHERE id = ?').get(agent.id);
    if (!current || current.status !== 'active' || current.version !== agent.version || current.knowledge_revision !== agent.knowledge_revision) {
      status = 409;result = { code: 'scope_changed' };
    }
    const success = status === 200 && ['answered', 'abstained'].includes(result?.status);
    if (!success && status === 200) status = 502;
    const { reply, sources, ...metadata } = result ?? {};
    db.transaction(() => {
      db.prepare("UPDATE support_messages SET content = ?, status = ?, sources_json = ?, metadata_json = ? WHERE conversation_id = ? AND request_id = ? AND role = 'assistant' AND status = 'pending'")
        .run(success ? reply : '', success ? (result.status === 'answered' ? 'completed' : 'abstained') : 'failed', JSON.stringify(success ? sources.map(source => ({ label: source.label, documentId: source.documentId, chunkId: source.chunkId, digest: digest(source.excerpt) })) : []), JSON.stringify(success ? metadata : { code: result?.code ?? 'generation_failed' }), conversation.id, body.requestId);
      db.prepare('UPDATE support_conversations SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), conversation.id);
    }).immediate();
    res.status(success ? 200 : status).json({ code: success ? undefined : result?.code, items: pair(conversation.id, body.requestId) });
  }));
}
