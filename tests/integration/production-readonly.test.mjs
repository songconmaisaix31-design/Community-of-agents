import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Explicit opt-in for a fresh, operator-migrated production-package deployment.
// Every request is GET: no signup, session, Agent, grant or business writes.
const base = process.env.GONGZHI_PRODUCTION_ACCEPTANCE_URL;
if (base) {
  const url = new URL(base);
  assert.equal(url.protocol, 'http:');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.username + url.password + url.search + url.hash, '');
}
const skip = base ? false : 'Set GONGZHI_PRODUCTION_ACCEPTANCE_URL for a fresh isolated local production package';
// Explicit operator expectation; never infer availability from legacy Supabase config.
const oauthAvailable = process.env.GONGZHI_EXPECT_OAUTH_AVAILABLE === 'true';
const get = path => fetch(new URL(path, base), { redirect: 'error', signal: AbortSignal.timeout(10_000) });

test('production proxy, official Auth and Next process health respond separately', { skip }, async () => {
  const proxy = await get('/healthz');
  assert.equal(proxy.status, 200);
  assert.equal(await proxy.text(), 'proxy alive');
  const auth = await get('/auth/v1/health');
  assert.equal(auth.status, 200);
  assert.match((await auth.json()).name, /GoTrue/i);
  const next = await get('/api/gongzhi/health');
  assert.equal(next.status, 200);
  const health = await next.json();
  assert.equal(health.mode, 'live');
  assert.equal(health.data.database_configured, true);
  assert.equal(health.data.auth_configured, oauthAvailable);
  assert.equal(health.data.live_verified, false);
});

test('production browser configuration contains only the public contract', { skip }, async () => {
  const response = await get('/api/gongzhi/config');
  assert.equal(response.status, 200);
  const { ok, mode, data } = await response.json();
  assert.equal(ok, true);
  assert.equal(mode, 'live');
  assert.deepEqual(Object.keys(data).sort(), ['api_base', 'auth', 'contract_version', 'database_configured']);
  assert.equal(data.database_configured, true);
  assert.equal(data.api_base, '/api/gongzhi');
  assert.deepEqual(Object.keys(data.auth).sort(), ['available', 'endpoints', 'provider', 'public_key', 'url']);
  assert.equal(data.auth.available, oauthAvailable);
  assert.equal(data.auth.provider, 'zhihu');
  assert.equal(data.auth.url, null);
  assert.equal(data.auth.public_key, null);
  assert.deepEqual(data.auth.endpoints, {
    start: '/api/gongzhi/auth/zhihu/start', session: '/api/gongzhi/auth/session',
    logout: '/api/gongzhi/auth/logout', callback: '/auth/zhihu/callback',
  });
});

test('fresh production board and Agent-only graph query the real empty database', { skip }, async () => {
  const boardResponse = await get('/api/gongzhi/board');
  assert.equal(boardResponse.status, 200);
  const board = await boardResponse.json();
  assert.equal(board.ok, true);
  assert.equal(board.mode, 'live');
  assert.equal(board.data.mode, 'live');
  assert.equal(board.data.records.length, 0);
  assert.equal(board.data.next_cursor, null);
  const graphResponse = await get('/api/gongzhi/agent-graph');
  assert.equal(graphResponse.status, 200);
  const graph = await graphResponse.json();
  assert.equal(graph.mode, 'live');
  assert.equal(graph.data.mode, 'live');
  assert.equal(graph.data.nodes.length, 0);
  assert.equal(graph.data.edges.length, 0);
});

test('production proxy serves three existing pages and the single-source public skill', { skip }, async () => {
  for (const path of ['/zh', '/zh/board', '/zh/connect']) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /共治/);
  }
  const guide = await get('/agent-skill.md');
  assert.equal(guide.status, 200);
  assert.equal(await guide.text(), await readFile(new URL('../../docs/connect/agent-skill.md', import.meta.url), 'utf8'));
});

test('production proxy blocks Auth admin and demo escape without synthetic success', { skip }, async () => {
  assert.equal((await get('/auth/v1/admin/users')).status, 404);
  const demo = await get('/demo/api/__production_readonly_probe__');
  assert.equal(demo.status, 409);
  const denied = await demo.json();
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'mode_mismatch');
  assert.equal(Object.hasOwn(denied, 'data'), false);
  assert.equal((await get('/api/gongzhi/__production_readonly_probe__')).status, 404);
  assert.equal((await get('/api/gongzhi/runs/__production_readonly_probe__')).status, 401);
  for (const path of ['/api/gongzhi/owners', '/api/gongzhi/authorizations', '/api/gongzhi/agents/me']) {
    assert.equal((await get(path)).status, 401, path);
  }
  const session = await get('/api/gongzhi/auth/session');
  assert.equal(session.status, 200);
  assert.equal((await session.json()).data.user, null);
  const callback = await fetch(new URL('/auth/zhihu/callback?state=invalid-readonly-probe', base), {
    redirect: 'follow', signal: AbortSignal.timeout(10_000),
  });
  assert.equal(callback.status, 200, 'the whole callback redirect must reach the actual page');
  assert.equal(new URL(callback.url).pathname, '/zh');
  assert.notEqual(new URL(callback.url).searchParams.get('auth'), 'success');
});
