import { readFileSync } from 'node:fs';

// Explicit maintenance only: never imported by backend startup or HTTP routes.
// Call on a backed-up database during an approved maintenance operation.
export function repairSupportTicketSchema(db) {
  if (db.inTransaction || db.pragma('foreign_keys', { simple: true }) !== 1) {
    throw new Error('Repair requires foreign keys enabled and no active transaction.');
  }
  const sql = readFileSync(new URL('../migrations/006_support_tickets.sql', import.meta.url), 'utf8');
  const rows = table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
  return db.transaction(() => {
    // Refuse unknown inbound dependencies instead of risking cascading data loss.
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
      if (name === 'support_ticket_events') continue;
      if (db.pragma(`foreign_key_list("${name.replaceAll('"', '""')}")`).some(f => ['support_tickets', 'support_ticket_events'].includes(f.table))) {
        throw new Error('Unexpected ticket dependency; repair requires review.');
      }
    }
    const tickets = rows('support_tickets'), events = rows('support_ticket_events');
    const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='support_ticket_events'").get()?.seq ?? 0;
    db.exec('DROP TRIGGER IF EXISTS support_ticket_conversation_delete; DROP TABLE support_ticket_events; DROP TABLE support_tickets;');
    db.exec(sql);
    for (const [table, records] of [['support_tickets', tickets], ['support_ticket_events', events]]) {
      if (!records.length) continue;
      const columns = Object.keys(records[0]);
      const insert = db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`);
      for (const record of records) insert.run(...columns.map(key => record[key]));
      if (JSON.stringify(rows(table)) !== JSON.stringify(records)) throw new Error('Ticket preservation check failed.');
    }
    db.prepare("DELETE FROM sqlite_sequence WHERE name='support_ticket_events'").run();
    db.prepare("INSERT INTO sqlite_sequence(name,seq) VALUES('support_ticket_events',?)").run(sequence);
    if (db.pragma('foreign_key_check').length) throw new Error('Foreign key verification failed.');
    return { tickets: tickets.length, events: events.length };
  }).immediate();
}
