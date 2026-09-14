// Test-only HTTP host: actual public files and Core/Connect handlers, real dedicated PG.
// Only the two official OAuth upstream responses are fixtures; no browser identity injection.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { oauthBrowserBase as base, oauthDatabaseEnv, assertOAuthBrowserTarget, assertOAuthConfigPath } from './oauth-browser-guard.mjs';

assertOAuthConfigPath(oauthDatabaseEnv);
const config = parseEnv(await readFile(oauthDatabaseEnv, 'utf8'));
assertOAuthBrowserTarget(config, process.env.GONGZHI_OAUTH_BROWSER_TEST);
const container = JSON.parse(execFileSync('docker', ['inspect', '--format', '{{json .}}', 'gongzhi-fulltest-c-20260914-db-1'], { encoding: 'utf8' }));
assert.equal(container.Config.Labels['com.docker.compose.project'], 'gongzhi-fulltest-c-20260914');
assert.equal(container.State.Health.Status, 'healthy');
assert.deepEqual(container.HostConfig.PortBindings['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: '56640' }]);
// Do not inherit model, mail or real OAuth credentials. The fixture keys have no external authority.
for (const name of Object.keys(process.env)) if (/^(ZHIHU_|OPENAI_|SUPABASE_|GONGZHI_ASSISTANT_)/.test(name)) delete process.env[name];
Object.assign(process.env, { DATABASE_URL: config.DATABASE_URL, GONGZHI_DATABASE_ENABLED: 'true',
  GONGZHI_AUTH_ENABLED: 'false', GONGZHI_ASSISTANT_ENABLED: 'false', SITE_URL: base, CRIER_HASH_SECRET: randomUUID(),
  ZHIHU_OAUTH_APP_ID: 'isolated-browser-fixture', ZHIHU_OAUTH_APP_KEY: 'nonsecret-fixture-only',
  ZHIHU_OAUTH_REDIRECT_URI: base + '/auth/zhihu/callback', NEXT_TELEMETRY_DISABLED: '1' });
const { sql } = await import('../../lib/db.ts');
const [{ db, role }] = await sql()`select current_database() as db, current_user as role`;
assert.equal(db, 'gongzhi_core_test'); assert.equal(role, 'crier_app');
const migrations = await sql()`select name from schema_migrations where name='0015-zhihu-web-sessions.sql'`;
assert.equal(migrations.length, 1, 'Explicit migration 0015 must already exist; this runner never migrates');
const { handleWebAuth } = await import('../../lib/gongzhi/web-auth.ts');
const { handleGongzhiRequest } = await import('../../lib/gongzhi/http.ts');
const { GET: getConfig } = await import('../../app/api/gongzhi/config/route.ts');
const { GET: getHealth } = await import('../../app/api/gongzhi/health/route.ts');
const { POST: postRun, GET: getRun } = await import('../../app/api/gongzhi/runs/route.ts');
const { handleMcpPost, handleMcpUnsupportedMethod } = await import('../../lib/mcp.ts');
const unique = randomUUID().replaceAll('-', '');
let upstreamCalls = 0;
// Scoped closure per callback, never a mutable global identity or production env/header switch.
function upstream(account) {
  return async (url, init) => {
    upstreamCalls++;
    assert.equal(init.redirect, 'error');
    if (url === 'https://openapi.zhihu.com/access_token') {
      assert.equal(new URLSearchParams(init.body).get('code'), 'fixture-' + account);
      return Response.json({ access_token: 'fixture-only-' + account, token_type: 'Bearer', expires_in: 3600 });
    }
    assert.equal(url, 'https://openapi.zhihu.com/user');
    assert.equal(init.headers.Authorization, 'Bearer fixture-only-' + account);
    return Response.json({ hash_id: unique + account, fullname: 'OAuth协议测试' + account });
  };
}
const publicRoot = path.resolve('public');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
async function handle(request) {
  const url = new URL(request.url), route = url.pathname;
  if (route === '/api/gongzhi/auth/zhihu/start') return handleWebAuth(request, 'start');
  if (route === '/api/gongzhi/auth/session') return handleWebAuth(request, 'session');
  if (route === '/api/gongzhi/auth/logout') return handleWebAuth(request, 'logout');
  if (route === '/auth/zhihu/callback') {
    const code = url.searchParams.get('authorization_code');
    const account = code === 'fixture-A' ? 'A' : code === 'fixture-B' ? 'B' : null;
    return handleWebAuth(request, 'callback', account ? upstream(account) : async () => { throw new Error('Unexpected upstream call'); });
  }
  if (route === '/api/gongzhi/config') return getConfig();
  if (route === '/api/gongzhi/health') return getHealth();
  if (route === '/api/gongzhi/runs') return request.method === 'POST' ? postRun(request) : getRun(request);
  if (route === '/mcp') return request.method === 'POST' ? handleMcpPost(request) : handleMcpUnsupportedMethod(request);
  if (route.startsWith('/api/gongzhi/')) return handleGongzhiRequest(request, route.slice('/api/gongzhi/'.length).split('/'));
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  const pages = { '/zh': 'community/zh/index.html', '/zh/board': 'community/zh/board/index.html', '/zh/connect': 'community/zh/connect/index.html' };
  const file = path.resolve(publicRoot, pages[route.replace(/\/$/, '')] ?? '.' + decodeURIComponent(route));
  if (!file.startsWith(publicRoot + path.sep)) return new Response(null, { status: 404 });
  try {
    if (!(await stat(file)).isFile()) return new Response(null, { status: 404 });
    return new Response(await readFile(file), { headers: { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream' } });
  } catch { return new Response(null, { status: 404 }); }
}
const server = createServer(async (incoming, outgoing) => {
  try {
    if (incoming.headers.host !== new URL(base).host) { outgoing.writeHead(421).end(); return; }
    const chunks = []; let size = 0;
    for await (const chunk of incoming) { size += chunk.length; if (size > 1024 * 1024) throw new Error('Test HTTP limit'); chunks.push(chunk); }
    const method = incoming.method ?? 'GET';
    const response = await handle(new Request(base + incoming.url, { method, headers: incoming.headers,
      ...(['GET', 'HEAD'].includes(method) ? {} : { body: Buffer.concat(chunks) }) }));
    response.headers.forEach((value, name) => { if (name !== 'set-cookie') outgoing.setHeader(name, value); });
    const cookies = response.headers.getSetCookie(); if (cookies.length) outgoing.setHeader('set-cookie', cookies);
    outgoing.writeHead(response.status); outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500, { 'content-type': 'text/plain' }).end('Isolated test host failed'); }
});
server.listen(Number(new URL(base).port), '127.0.0.1', () => console.log('OAuth browser host ready: dedicated PG, explicit upstream fixture'));
async function stop() { server.closeAllConnections(); server.close(); await sql().end(); console.log('OAuth upstream fixture calls:', upstreamCalls); process.exit(0); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
