import { createHash } from 'node:crypto';

const CHUNK_SIZE = 400;
const DEFAULT_RESULT_LIMIT = 4;

export function initializeDocumentStore(db) {
  db.pragma('foreign_keys = ON');

  const columns = db.prepare('PRAGMA table_info(documents_history)').all();
  if (!columns.some(column => column.name === 'content_sha256')) {
    db.exec('ALTER TABLE documents_history ADD COLUMN content_sha256 TEXT');
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS documents_history_content_sha256_unique
      ON documents_history (content_sha256)
      WHERE content_sha256 IS NOT NULL;

    CREATE TABLE IF NOT EXISTS document_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES documents_history(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      page_number INTEGER,
      start_offset INTEGER,
      end_offset INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (document_id, chunk_index),
      CHECK (start_offset IS NULL OR start_offset >= 0),
      CHECK (end_offset IS NULL OR end_offset >= start_offset)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
      chunk_text,
      content='document_chunks',
      content_rowid='id',
      tokenize='unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS document_chunks_ai AFTER INSERT ON document_chunks BEGIN
      INSERT INTO document_chunks_fts (rowid, chunk_text) VALUES (new.id, new.chunk_text);
    END;

    CREATE TRIGGER IF NOT EXISTS document_chunks_ad AFTER DELETE ON document_chunks BEGIN
      INSERT INTO document_chunks_fts (document_chunks_fts, rowid, chunk_text)
        VALUES ('delete', old.id, old.chunk_text);
    END;

    CREATE TRIGGER IF NOT EXISTS document_chunks_au AFTER UPDATE ON document_chunks BEGIN
      INSERT INTO document_chunks_fts (document_chunks_fts, rowid, chunk_text)
        VALUES ('delete', old.id, old.chunk_text);
      INSERT INTO document_chunks_fts (rowid, chunk_text) VALUES (new.id, new.chunk_text);
    END;

    INSERT INTO document_chunks_fts (document_chunks_fts) VALUES ('rebuild');
  `);
}

function splitIntoChunks(text, pageNumber = null, baseOffset = null) {
  const chunks = [];
  for (let offset = 0; offset < text.length; offset += CHUNK_SIZE) {
    const chunkText = text.slice(offset, offset + CHUNK_SIZE);
    chunks.push({
      chunkText,
      pageNumber,
      startOffset: baseOffset === null ? null : baseOffset + offset,
      endOffset: baseOffset === null ? null : baseOffset + offset + chunkText.length
    });
  }
  return chunks;
}

function makeChunks({ text, pages }) {
  if (!pages.length) return splitIntoChunks(text, null, 0);

  const chunks = [];
  let searchFrom = 0;
  for (const page of pages) {
    const pageText = page.text.trim();
    if (!pageText) continue;

    const startOffset = text.indexOf(pageText, searchFrom);
    const offset = startOffset === -1 ? null : startOffset;
    chunks.push(...splitIntoChunks(pageText, page.pageNumber, offset));
    if (offset !== null) searchFrom = offset + pageText.length;
  }

  return chunks;
}

export function indexDocument(db, { filename, fileType, sourceBuffer, text, pages = [] }) {
  const contentSha256 = createHash('sha256').update(sourceBuffer).digest('hex');
  const existing = db.prepare(`
    SELECT id, filename, character_count, chunks_count, status, created_at
    FROM documents_history
    WHERE content_sha256 = ?
  `).get(contentSha256);

  if (existing) {
    return {
      documentId: existing.id,
      filename: existing.filename,
      characterCount: existing.character_count,
      chunksGenerated: existing.chunks_count,
      duplicate: true
    };
  }

  const chunks = makeChunks({ text, pages });
  const insertDocument = db.prepare(`
    INSERT INTO documents_history
      (filename, file_type, character_count, chunks_count, status, created_at, content_sha256)
    VALUES (?, ?, ?, ?, 'Success', ?, ?)
  `);
  const insertChunk = db.prepare(`
    INSERT INTO document_chunks
      (document_id, chunk_index, chunk_text, page_number, start_offset, end_offset)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  return db.transaction(() => {
    const createdAt = new Date().toISOString();
    const result = insertDocument.run(
      filename,
      fileType,
      text.length,
      chunks.length,
      createdAt,
      contentSha256
    );
    const documentId = Number(result.lastInsertRowid);

    chunks.forEach((chunk, chunkIndex) => {
      insertChunk.run(
        documentId,
        chunkIndex,
        chunk.chunkText,
        chunk.pageNumber,
        chunk.startOffset,
        chunk.endOffset
      );
    });

    return {
      documentId,
      filename,
      characterCount: text.length,
      chunksGenerated: chunks.length,
      duplicate: false
    };
  })();
}

function toFtsQuery(text) {
  const terms = [...new Set(text.match(/[\p{L}\p{N}_]+/gu) ?? [])].slice(0, 32);
  return terms.map(term => `"${term.replaceAll('"', '""')}"`).join(' OR ');
}

export function searchDocumentChunks(db, query, limit = DEFAULT_RESULT_LIMIT, documentId = null) {
  const ftsQuery = toFtsQuery(query);
  if (!ftsQuery) return [];

  return db.prepare(`
    SELECT
      chunk.id AS chunkId,
      chunk.document_id AS documentId,
      document.filename,
      chunk.chunk_text AS chunkText,
      chunk.page_number AS pageNumber,
      chunk.start_offset AS startOffset,
      chunk.end_offset AS endOffset,
      bm25(document_chunks_fts) AS rank
    FROM document_chunks_fts
    JOIN document_chunks AS chunk ON chunk.id = document_chunks_fts.rowid
    JOIN documents_history AS document ON document.id = chunk.document_id
    WHERE document_chunks_fts MATCH ?
      AND (? IS NULL OR chunk.document_id = ?)
    ORDER BY rank ASC, chunk.id ASC
    LIMIT ?
  `).all(ftsQuery, documentId, documentId, limit);
}

function makePdfPageRenderer(pages) {
  return async pageData => {
    const textContent = await pageData.getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: false
    });
    let lastY;
    let text = '';

    for (const item of textContent.items) {
      if (lastY === item.transform[5] || !lastY) text += item.str;
      else text += `\n${item.str}`;
      lastY = item.transform[5];
    }

    pages.push({ pageNumber: pages.length + 1, text });
    return text;
  };
}

async function parsePdf(buffer, options) {
  const pdfParseModule = await import('pdf-parse/lib/pdf-parse.js');
  const pdfParse = pdfParseModule.default || pdfParseModule;
  return pdfParse(buffer, options);
}

export function createDocumentParseHandler({ db, pdfParser = parsePdf }) {
  return async function documentParseHandler(req, res) {
    if (!req.file || !Buffer.isBuffer(req.file.buffer) || req.file.buffer.length === 0) {
      return res.status(400).json({ error: 'Aucun fichier valide fourni' });
    }

    const filename = req.file.originalname;
    const lowerFilename = filename.toLowerCase();
    const isPdf = req.file.mimetype === 'application/pdf' || lowerFilename.endsWith('.pdf');
    const isText = req.file.mimetype === 'text/plain' || req.file.mimetype === 'text/csv' ||
      lowerFilename.endsWith('.csv') || lowerFilename.endsWith('.txt');

    if (!isPdf && !isText) {
      return res.status(400).json({ error: 'Format non supporté (PDF, TXT, CSV uniquement).' });
    }

    let extractedText;
    let pages = [];
    if (isPdf) {
      try {
        const data = await pdfParser(req.file.buffer, { pagerender: makePdfPageRenderer(pages) });
        extractedText = data.text;
      } catch {
        return res.status(400).json({ error: 'PDF invalide ou illisible.' });
      }
    } else {
      extractedText = req.file.buffer.toString('utf-8');
    }

    const cleanText = typeof extractedText === 'string' ? extractedText.trim() : '';
    if (!cleanText) {
      return res.status(400).json({ error: 'Le document ne contient aucun texte exploitable.' });
    }

    if (isPdf && !pages.length) pages = [];
    const fileType = lowerFilename.split('.').pop();
    const indexed = indexDocument(db, {
      filename,
      fileType,
      sourceBuffer: req.file.buffer,
      text: cleanText,
      pages
    });

    return res.json({
      filename,
      text: cleanText,
      characterCount: cleanText.length,
      chunksGenerated: indexed.chunksGenerated,
      documentId: indexed.documentId
    });
  };
}
