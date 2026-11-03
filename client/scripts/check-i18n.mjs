import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const flatten = (object, prefix = '') => Object.fromEntries(Object.entries(object).flatMap(([key, value]) => {
  const path = prefix ? `${prefix}.${key}` : key;
  if (typeof value === 'string') { assert.ok(value.trim(), `Empty translation: ${path}`);return [[path, value]]; }
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `Invalid translation: ${path}`);
  return Object.entries(flatten(value, path));
}));
const read = language => flatten(JSON.parse(readFileSync(new URL(`../src/app/i18n/catalogs/${language}.json`, import.meta.url), 'utf8')));
const fr = read('fr'), en = read('en');
assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort(), 'FR/EN key mismatch');
const params = value => [...value.matchAll(/{{\s*([\w.]+)\s*}}/g)].map(match => match[1]).sort();
for (const key of Object.keys(fr)) assert.deepEqual(params(fr[key]), params(en[key]), `Interpolation mismatch: ${key}`);
const used = new Set();
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) scan(file);
    else if (/\.(ts|html)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) {
      for (const match of readFileSync(file, 'utf8').matchAll(/['"]((?:brand|shell|nav|common|errors)\.[a-zA-Z][\w.]*)['"]/g)) used.add(match[1]);
    }
  }
}
scan(new URL('../src/app/', import.meta.url));
for (const key of used) assert.ok(Object.hasOwn(fr, key), `Referenced key is missing: ${key}`);
console.log(`i18n: ${Object.keys(fr).length} matching non-empty keys per language; interpolation and ${used.size} referenced keys verified.`);
