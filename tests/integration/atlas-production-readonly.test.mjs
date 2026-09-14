import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

// Read-only checks against an explicitly selected operator-owned loopback proxy.
// The expected directory contains only the fixed frontend delta, never secrets.
const base = process.env.GONGZHI_PRODUCTION_ACCEPTANCE_URL;
const expected = process.env.GONGZHI_ATLAS_EXPECTED_DIR;
// Historical Atlas delta defaults to ten; later static-only releases select an exact count.
const expectedCount = Number(process.env.GONGZHI_STATIC_EXPECTED_COUNT ?? 10);
assert.ok(Number.isInteger(expectedCount) && expectedCount > 0 && expectedCount <= 1000);
const skip = !base || !expected ? 'Set explicit loopback proxy and fixed public-resource directory' : false;
if (base) {
  const url = new URL(base);
  assert.equal(url.protocol, 'http:');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  assert.equal(url.username + url.password + url.search + url.hash, '');
}
const get = path => fetch(new URL(path, base), { redirect: 'error', signal: AbortSignal.timeout(10_000) });

test('Public HTTP bytes equal the explicitly fixed frontend delta', { skip }, async () => {
  let count = 0;
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { await walk(path); continue; }
      assert.ok(entry.isFile(), 'Only ordinary public files are expected');
      const resource = '/community/' + relative(expected, path).split(sep).join('/');
      const response = await get(resource);
      assert.equal(response.status, 200, resource);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(path), resource);
      count++;
    }
  }
  await walk(expected);
  assert.equal(count, expectedCount);
  for (const page of ['/zh?demo=atlas', '/zh/board?demo=atlas', '/zh/connect?demo=atlas']) {
    const response = await get(page);
    assert.equal(response.status, 200, page);
    assert.match(await response.text(), /atlas-fixture\.js/);
  }
});

test('Atlas catalog is public and real APIs never select fixtures from demo query parameters', { skip }, async () => {
  const response = await get('/community/assets/atlas-agent-catalog.js');
  assert.equal(response.status, 200);
  const source = await response.text();
  const catalog = JSON.parse(source.slice(source.indexOf('=') + 1).trim().replace(/;$/, ''));
  assert.equal(catalog.length, 100);
  for (const field of ['id', 'name', 'specialty']) assert.equal(new Set(catalog.map(p => p[field])).size, 100);
  for (const profile of catalog) assert.match(profile.name, /^知乎 .+ 专家 Agent$/);
  const fixtureIds = new Set(catalog.map(p => p.id));
  // BoardQuerySchema is strict: unknown demo selectors fail rather than opt into fixtures.
  const rejected = await get('/api/gongzhi/board?demo=atlas');
  assert.equal(rejected.status, 400);
  const rejection = await rejected.json();
  assert.equal(rejection.ok, false);
  assert.equal(rejection.mode, 'live');
  assert.equal(rejection.error.code, 'invalid_request');
  assert.equal(Object.hasOwn(rejection, 'data'), false);
  for (const path of ['/api/gongzhi/board', '/api/gongzhi/agent-graph?demo=atlas']) {
    const response = await get(path);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'live');
    assert.equal(result.data.mode, 'live');
    for (const item of result.data.records ?? result.data.nodes) assert.equal(fixtureIds.has(item.id), false);
  }
});

test('Anonymous MCP Agent status remains an error after the frontend-only release', { skip }, async () => {
  const response = await fetch(new URL('/mcp', base), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'agent_status', arguments: {} } }),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.result.isError, true);
});
