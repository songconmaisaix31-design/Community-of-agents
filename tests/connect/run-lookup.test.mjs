import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../../app/api/gongzhi/runs/route.ts';
import { createApiClient } from '../../lib/gongzhi/api-client.ts';

// No database, accounts or provider: actual route rejection + injected client responses.
test('run lookup rejects missing or self-authorized query fields before identity/storage work', async () => {
  for (const query of ['', '?need_id=fixture-need', '?need_id=fixture-need&idempotency_key=fixed-key&owner_id=someone-else']) {
    const response = await GET(new Request('http://localhost/api/gongzhi/runs' + query));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'invalid_request');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('valid original-key lookup without a credential fails before database or model configuration', async () => {
  const response = await GET(new Request('http://localhost/api/gongzhi/runs?need_id=fixture-need&idempotency_key=fixed-key'));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('shared lookup client preserves original parameters, null and later real run ID without a POST', async () => {
  const calls = [];
  const input = { need_id: 'need/fixture', idempotency_key: 'same-key:with&delimiters' };
  const run = { id: 'fixture-run-id', ...input, status: 'running', mode: 'live' };
  const client = createApiClient('live', { accessToken: () => 'synthetic-human-test-token', fetch: async (path, options) => {
    calls.push(options.method);
    const url = new URL(path, 'http://localhost');
    assert.equal(url.pathname, '/api/gongzhi/runs');
    assert.equal(url.searchParams.get('need_id'), input.need_id);
    assert.equal(url.searchParams.get('idempotency_key'), input.idempotency_key);
    return Response.json({ ok: true, mode: 'live', data: calls.length === 1 ? null : run });
  } });
  assert.equal(await client.lookupRun(input), null);
  assert.deepEqual(await client.lookupRun(input), run);
  assert.deepEqual(calls, ['GET', 'GET']);
});
