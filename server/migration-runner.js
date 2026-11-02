import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));

export function runMigrations(db) {
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrations = readdirSync(migrationDirectory)
    .filter(filename => /^\d+_[a-z0-9_]+\.sql$/i.test(filename))
    .sort();
  const applied = db.prepare('SELECT version FROM schema_migrations').all()
    .map(row => row.version);
  const recordMigration = db.prepare('INSERT INTO schema_migrations (version) VALUES (?)');

  for (const filename of migrations) {
    if (applied.includes(filename)) continue;
    const sql = readFileSync(path.join(migrationDirectory, filename), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      recordMigration.run(filename);
    })();
  }
}
