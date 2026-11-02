import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
  createDocumentParseHandler,
  indexDocument,
  initializeDocumentStore,
  searchDocumentChunks
} from './document-store.js';

function makeDatabase(location = ':memory:') {
  const db = new Database(location);
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      character_count INTEGER,
      chunks_count INTEGER,
      status TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  initializeDocumentStore(db);
  return db;
}

function mockResponse() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function makePdfParser(pageText) {
  return async (_buffer, options) => {
    const renderedPage = await options.pagerender({
      getTextContent: async () => ({
        items: pageText.split(' ').map((str, index) => ({
          str: index === 0 ? str : ` ${str}`,
          transform: [0, 0, 0, 0, 0, 1]
        }))
      })
    });
    return { text: `\n\n${renderedPage}` };
  };
}

function indexText(db, { filename, text, bytes = text }) {
  return indexDocument(db, {
    filename,
    fileType: 'txt',
    sourceBuffer: Buffer.from(bytes),
    text
  });
}

test('persists PDF chunks with supplied page number and character offsets', async () => {
  const db = makeDatabase();
  const pageText = `The ${'reliable archive '.repeat(30)}`.trim();
  const handler = createDocumentParseHandler({ db, pdfParser: makePdfParser(pageText) });
  const response = mockResponse();

  await handler({
    file: {
      originalname: 'archive.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-test')
    }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.filename, 'archive.pdf');
  assert.ok(response.body.documentId);
  const chunks = db.prepare(`
    SELECT chunk_text, page_number, start_offset, end_offset, created_at
    FROM document_chunks
    WHERE document_id = ?
    ORDER BY chunk_index
  `).all(response.body.documentId);
  assert.ok(chunks.length > 1);
  assert.equal(chunks[0].page_number, 1);
  assert.equal(chunks[0].start_offset, 0);
  assert.equal(chunks[0].end_offset, chunks[0].chunk_text.length);
  assert.ok(chunks[0].created_at);
  assert.equal(chunks[1].start_offset, 400);
  assert.equal(chunks[1].page_number, 1);
  db.close();
});

test('retrieves persisted chunks after closing and reopening SQLite', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'rag-store-'));
  const databasePath = path.join(directory, 'documents.db');
  let db = makeDatabase(databasePath);
  const indexed = indexText(db, {
    filename: 'manual.txt',
    text: 'The observatory stores telescope calibration records.'
  });
  db.close();

  db = makeDatabase(databasePath);
  const results = searchDocumentChunks(db, 'telescope calibration');

  assert.equal(results.length, 1);
  assert.equal(results[0].documentId, indexed.documentId);
  assert.equal(results[0].filename, 'manual.txt');
  assert.match(results[0].chunkText, /telescope calibration/);
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

test('adds chunk storage without losing existing document history', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE documents_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      character_count INTEGER,
      chunks_count INTEGER,
      status TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO documents_history (filename, file_type, character_count, chunks_count, status)
    VALUES ('legacy.pdf', 'pdf', 120, 1, 'Success');
  `);

  initializeDocumentStore(db);

  assert.deepEqual(db.prepare(`
    SELECT id, filename, character_count, chunks_count, status
    FROM documents_history
  `).get(), {
    id: 1,
    filename: 'legacy.pdf',
    character_count: 120,
    chunks_count: 1,
    status: 'Success'
  });
  assert.ok(db.prepare('PRAGMA table_info(documents_history)').all()
    .some(column => column.name === 'content_sha256'));
  db.close();
});

test('keeps chunks from multiple uploaded documents and avoids exact duplicate indexing', () => {
  const db = makeDatabase();
  const first = indexText(db, {
    filename: 'one.txt',
    text: 'Copper finches nest in the northern valley.'
  });
  const second = indexText(db, {
    filename: 'two.txt',
    text: 'Silver herons gather beside the eastern marsh.'
  });
  const duplicate = indexText(db, {
    filename: 'renamed-copy.txt',
    text: 'Copper finches nest in the northern valley.'
  });

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.documentId, first.documentId);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM documents_history').get().count, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM document_chunks').get().count, 2);
  assert.equal(searchDocumentChunks(db, 'finches').length, 1);
  assert.equal(searchDocumentChunks(db, 'herons').length, 1);
  db.close();
});

test('rejects missing, empty, unsupported, empty-text, and invalid PDF uploads', async () => {
  const db = makeDatabase();
  const handler = createDocumentParseHandler({
    db,
    pdfParser: async () => { throw new Error('invalid PDF content'); }
  });

  const noFile = mockResponse();
  await handler({ file: undefined }, noFile);
  assert.equal(noFile.statusCode, 400);

  const emptyFile = mockResponse();
  await handler({
    file: { originalname: 'empty.txt', mimetype: 'text/plain', buffer: Buffer.alloc(0) }
  }, emptyFile);
  assert.equal(emptyFile.statusCode, 400);

  const unsupported = mockResponse();
  await handler({
    file: { originalname: 'image.png', mimetype: 'image/png', buffer: Buffer.from('data') }
  }, unsupported);
  assert.equal(unsupported.statusCode, 400);

  const emptyText = mockResponse();
  await handler({
    file: { originalname: 'blank.txt', mimetype: 'text/plain', buffer: Buffer.from('  \n ') }
  }, emptyText);
  assert.equal(emptyText.statusCode, 400);

  const invalidPdf = mockResponse();
  await handler({
    file: { originalname: 'broken.pdf', mimetype: 'application/pdf', buffer: Buffer.from('not pdf') }
  }, invalidPdf);
  assert.equal(invalidPdf.statusCode, 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM documents_history').get().count, 0);
  db.close();
});

test('returns no chunks for lexical queries without a match', () => {
  const db = makeDatabase();
  indexText(db, { filename: 'notes.txt', text: 'A short note about renewable energy.' });

  assert.deepEqual(searchDocumentChunks(db, 'quasars supernova'), []);
  assert.deepEqual(searchDocumentChunks(db, '   '), []);
  db.close();
});
