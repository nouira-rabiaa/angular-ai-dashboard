import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { createCorsPolicy } from './cors-policy.js';
import { registerLegacyHistoryRoutes } from './legacy-history-routes.js';

async function withServer(run) {
  const app = express();
  app.use(createCorsPolicy(new Set(['http://localhost:4200'])));
  registerLegacyHistoryRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('retires both legacy dashboard history endpoints without returning stored metadata', async () => {
  await withServer(async baseUrl => {
    for (const endpoint of ['/api/submissions', '/api/dashboard/history']) {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        headers: { Origin: 'http://localhost:4200' }
      });
      assert.equal(response.status, 410);
      assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:4200');
      assert.deepEqual(await response.json(), { error: 'This endpoint is no longer available.' });
    }
  });
});

test('does not expose legacy endpoint responses to unapproved origins or requests without Origin', async () => {
  await withServer(async baseUrl => {
    for (const endpoint of ['/api/submissions', '/api/dashboard/history']) {
      const unapproved = await fetch(`${baseUrl}${endpoint}`, {
        headers: { Origin: 'https://untrusted.example' }
      });
      assert.equal(unapproved.status, 403);
      assert.equal(unapproved.headers.get('access-control-allow-origin'), null);
      assert.deepEqual(await unapproved.json(), { error: 'Origin not allowed.' });

      const noOrigin = await fetch(`${baseUrl}${endpoint}`);
      assert.equal(noOrigin.status, 410);
      assert.equal(noOrigin.headers.get('access-control-allow-origin'), null);
      assert.doesNotMatch(await noOrigin.text(), /filename|private|documentId|chunks_count/i);
    }
  });
});
