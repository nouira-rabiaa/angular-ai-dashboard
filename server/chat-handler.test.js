import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { createChatHandler } from './chat-handler.js';
import { indexDocument, initializeDocumentStore, searchDocumentChunks } from './document-store.js';

function makeDatabase() {
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
  `);
  initializeDocumentStore(db);
  return db;
}

function addDocument(db, filename, text) {
  return indexDocument(db, {
    filename,
    fileType: 'txt',
    sourceBuffer: Buffer.from(text),
    text
  });
}

function makeGroq(answer) {
  const calls = [];
  return {
    calls,
    client: {
      chat: { completions: { create: async request => {
        calls.push(request);
        return {
          choices: [{ message: { content: answer } }],
          usage: { total_tokens: 17 }
        };
      } } }
    }
  };
}

async function runChat(db, groq, prompt, documentId, retrieve) {
  const handler = createChatHandler({ groq: groq.client, db, retrieve });
  const response = {
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
  const body = documentId === undefined ? { prompt } : { prompt, documentId };
  await handler({ body }, response);
  return response;
}

test('returns citation sources that exactly match persisted SQLite chunks', async () => {
  const db = makeDatabase();
  addDocument(db, 'climate-report.txt', 'The coastal wetland absorbs carbon and protects nearby communities.');
  const storedChunk = searchDocumentChunks(db, 'coastal wetland')[0];
  const groq = makeGroq('The wetland absorbs carbon [S1].');

  const response = await runChat(db, groq, 'What does the coastal wetland do?');
  const source = response.body.sources[0];

  assert.equal(response.statusCode, 200);
  assert.equal(source.chunkId, storedChunk.chunkId);
  assert.equal(source.documentId, storedChunk.documentId);
  assert.equal(source.filename, 'climate-report.txt');
  assert.equal(source.excerpt, storedChunk.chunkText);
  assert.equal(source.label, 'S1');
  assert.equal(source.cited, true);
  assert.deepEqual(response.body.citationValidation.validLabels, ['S1']);
  assert.deepEqual(response.body.citationValidation.invalidLabels, []);
  assert.equal(response.body.citationValidation.sourceIdentityValidated, true);
  assert.equal(response.body.citationValidation.factualEntailmentValidated, false);
  assert.match(groq.calls[0].messages[0].content, /\[S1\].*climate-report\.txt/s);
  assert.match(groq.calls[0].messages[0].content, /coastal wetland absorbs carbon/);
  assert.equal(response.body.retrievalMeta.strategy, 'sqlite-fts5');
  assert.equal(response.body.vectorMeta, null);
  db.close();
});

test('recognizes full-width citation markers and normalizes valid markers in the answer', async () => {
  const db = makeDatabase();
  addDocument(db, 'report.txt', 'The coastal wetland absorbs carbon and protects nearby communities.');
  const groq = makeGroq('The wetland absorbs carbon 【S1】.');

  const response = await runChat(db, groq, 'What does the coastal wetland do?');

  assert.equal(response.body.reply, 'The wetland absorbs carbon [S1].');
  assert.deepEqual(response.body.citationValidation.validLabels, ['S1']);
  assert.deepEqual(response.body.citationValidation.invalidLabels, []);
  assert.equal(response.body.sources[0].cited, true);
  db.close();
});

test('normalizes mixed and repeated citations while reporting each label once', async () => {
  const db = makeDatabase();
  addDocument(db, 'one.txt', 'Falcon migration data indicates kestrels travel south each winter.');
  addDocument(db, 'two.txt', 'Falcon migration records show kestrels use coastal routes.');
  addDocument(db, 'three.txt', 'Falcon migration observations show kestrels rest at wetlands.');
  const groq = makeGroq('First 【S1】, next [S2], and again 【S1】; finally [S3].');

  const response = await runChat(db, groq, 'What do falcon migration records show about kestrels?');

  assert.equal(response.body.reply, 'First [S1], next [S2], and again [S1]; finally [S3].');
  assert.deepEqual(response.body.citationValidation.validLabels, ['S1', 'S2', 'S3']);
  assert.deepEqual(response.body.citationValidation.invalidLabels, []);
  assert.deepEqual(response.body.sources.map(source => source.cited), [true, true, true]);
  db.close();
});

test('reports invalid citation labels and never marks them as retrieved sources', async () => {
  const db = makeDatabase();
  addDocument(db, 'policy.txt', 'The retention period is seven years for archived records.');
  const groq = makeGroq('The records remain archived for seven years [S1], under policy [S9].');

  const response = await runChat(db, groq, 'What is the retention period?');

  assert.deepEqual(response.body.citationValidation.validLabels, ['S1']);
  assert.deepEqual(response.body.citationValidation.invalidLabels, ['S9']);
  assert.equal(response.body.sources[0].cited, true);
  assert.equal(response.body.sources.some(source => source.label === 'S9'), false);
  assert.equal(response.body.citationValidation.factualEntailmentValidated, false);
  db.close();
});

test('preserves invalid full-width citation labels and never treats them as valid', async () => {
  const db = makeDatabase();
  addDocument(db, 'policy.txt', 'The retention period is seven years for archived records.');
  const groq = makeGroq('The period is seven years [S1], with an exception 【S99】.');

  const response = await runChat(db, groq, 'What is the retention period?');

  assert.equal(response.body.reply, 'The period is seven years [S1], with an exception 【S99】.');
  assert.deepEqual(response.body.citationValidation.validLabels, ['S1']);
  assert.deepEqual(response.body.citationValidation.invalidLabels, ['S99']);
  assert.equal(response.body.sources[0].cited, true);
  db.close();
});

test('does not send or return document sources when retrieval has no matches', async () => {
  const db = makeDatabase();
  addDocument(db, 'notes.txt', 'The garden grows roses in spring.');
  const groq = makeGroq('I do not have document context for that question.');

  const response = await runChat(db, groq, 'Explain quasar spectroscopy.');

  assert.deepEqual(response.body.sources, []);
  assert.deepEqual(response.body.citationValidation.validLabels, []);
  assert.deepEqual(response.body.citationValidation.invalidLabels, []);
  assert.equal(response.body.documentName, null);
  assert.equal(response.body.retrievalMeta.resultCount, 0);
  assert.match(groq.calls[0].messages[0].content, /Aucun passage de document pertinent/);
  assert.doesNotMatch(groq.calls[0].messages[0].content, /\[S1\]/);
  db.close();
});

test('assigns distinct labels to sources retrieved from multiple documents', async () => {
  const db = makeDatabase();
  addDocument(db, 'first.txt', 'A kestrel is a small falcon found across open country.');
  addDocument(db, 'second.txt', 'A kestrel hunts by hovering over grassland.');
  const groq = makeGroq('Kestrels hunt over grassland [S2].');

  const response = await runChat(db, groq, 'How does a kestrel hunt?');

  assert.equal(response.body.sources.length, 2);
  assert.deepEqual(response.body.sources.map(source => source.label), ['S1', 'S2']);
  assert.equal(new Set(response.body.sources.map(source => source.documentId)).size, 2);
  assert.deepEqual(response.body.citationValidation.validLabels, ['S2']);
  assert.deepEqual(response.body.sources.map(source => source.cited), [false, true]);
  db.close();
});

test('omits unavailable page numbers and bounds source excerpts', async () => {
  const db = makeDatabase();
  const text = `A unique searchable phrase ${'additional detail '.repeat(100)}`;
  addDocument(db, 'long.txt', text);
  const groq = makeGroq('The phrase is present [S1].');

  const response = await runChat(db, groq, 'What is the unique searchable phrase?');

  assert.equal(Object.hasOwn(response.body.sources[0], 'pageNumber'), false);
  assert.ok(response.body.sources[0].excerpt.length <= 1200);
  assert.equal(response.body.sources[0].excerpt, searchDocumentChunks(db, 'unique searchable phrase')[0].chunkText);
  assert.equal(response.body.sources[0].excerptTruncated, false);
  db.close();
});

test('preserves legacy chat response fields for clients without source support', async () => {
  const db = makeDatabase();
  const groq = makeGroq('A general response.');

  const response = await runChat(db, groq, 'Say hello.');

  assert.equal(response.body.reply, 'A general response.');
  assert.equal(response.body.tokens, 17);
  assert.equal(response.body.documentName, null);
  assert.equal(response.body.vectorMeta, null);
  assert.deepEqual(response.body.sources, []);
  db.close();
});

test('selected document retrieval excludes matching chunks from other documents', async () => {
  const db = makeDatabase();
  const selected = addDocument(db, 'jest-guide.pdf', 'calculateTotal(items) returns 42 for the supplied test items.');
  addDocument(db, 'older-spec.pdf', 'calculateTotal(items) returns 999 in the unrelated historical example.');
  const groq = makeGroq('The expected result is 42 [S1].');

  const response = await runChat(db, groq, 'What does calculateTotal(items) return?', selected.documentId);

  assert.equal(response.body.sources.length, 1);
  assert.equal(response.body.sources[0].documentId, selected.documentId);
  assert.equal(response.body.sources[0].filename, 'jest-guide.pdf');
  assert.doesNotMatch(groq.calls[0].messages[0].content, /older-spec\.pdf|999/);
  assert.equal(response.body.retrievalMeta.scope, 'document');
  assert.equal(response.body.retrievalMeta.documentId, selected.documentId);
  db.close();
});

test('similar terms from different documents cannot leak into scoped results', async () => {
  const db = makeDatabase();
  const selected = addDocument(db, 'new.pdf', 'The Jest test expects calculateTotal(items) to equal 42.');
  addDocument(db, 'old.pdf', 'The Jest test expects calculateTotal(items) to equal 7.');
  const groq = makeGroq('The Jest expectation is 42 [S1].');

  const response = await runChat(db, groq, 'What does the Jest test expect calculateTotal(items) to equal?', selected.documentId);

  assert.ok(response.body.sources.length > 0);
  assert.ok(response.body.sources.every(source => source.documentId === selected.documentId));
  assert.doesNotMatch(groq.calls[0].messages[0].content, /old\.pdf|equal 7/);
  db.close();
});

test('omitting documentId preserves the legacy all-documents retrieval default', async () => {
  const db = makeDatabase();
  addDocument(db, 'first.pdf', 'The Jest helper returns calculateTotal(items) as 42.');
  addDocument(db, 'second.pdf', 'The Jest helper handles calculateTotal(items) when input is empty.');
  const groq = makeGroq('The helper returns 42 [S1].');

  const response = await runChat(db, groq, 'How does the Jest helper handle calculateTotal(items)?');

  assert.equal(response.body.retrievalMeta.scope, 'all');
  assert.equal(response.body.retrievalMeta.documentId, null);
  assert.equal(response.body.sources.length, 2);
  assert.deepEqual(new Set(response.body.sources.map(source => source.filename)), new Set(['first.pdf', 'second.pdf']));
  db.close();
});

test('invalid and nonexistent document IDs fail without global retrieval or Groq calls', async () => {
  const db = makeDatabase();
  addDocument(db, 'existing.pdf', 'The indexed document mentions calculateTotal(items).');
  const retrievalCalls = [];
  const retrieve = (...args) => {
    retrievalCalls.push(args);
    return searchDocumentChunks(...args);
  };

  const invalidGroq = makeGroq('Should not be called.');
  const invalid = await runChat(db, invalidGroq, 'calculateTotal(items)', 0, retrieve);
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalidGroq.calls.length, 0);

  const unknownGroq = makeGroq('Should not be called.');
  const unknown = await runChat(db, unknownGroq, 'calculateTotal(items)', 987654, retrieve);
  assert.equal(unknown.statusCode, 404);
  assert.equal(unknownGroq.calls.length, 0);
  assert.equal(retrievalCalls.length, 0);
  db.close();
});
