import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { TaskOAuthProvider, connectTaskMcp } from '../../examples/agent/mcp-oauth.ts';

// Local protocol simulator only: no project DB, real browser identity or public AS.
async function fixture(run, { missingMetadata = false, wrongResource = false, deny = false, scopes = ['read'] } = {}) {
  const calls = [];
  let challenge, redirect, state, base;
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const part of req) raw += part;
    calls.push({ path: req.url, method: req.method, auth: req.headers.authorization, raw });
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (['/metadata/resource', '/.well-known/oauth-protected-resource/mcp'].includes(req.url)) return json(200, { resource: base + (wrongResource ? '/other' : '/mcp'), authorization_servers: [base], scopes_supported: ['read', 'discuss'] });
    if (req.url === '/.well-known/oauth-authorization-server') return missingMetadata ? json(404, {}) : json(200, {
      issuer: base, authorization_endpoint: base + '/unusual/consent', token_endpoint: base + '/unusual/exchange',
      registration_endpoint: base + '/unusual/clients', response_types_supported: ['code'], grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
    });
    if (req.url === '/unusual/clients') {
      const body = JSON.parse(raw);
      assert.equal(body.token_endpoint_auth_method, 'none'); assert.deepEqual(body.grant_types, ['authorization_code']);
      assert.equal(body.scope, scopes.join(' '));
      return json(201, { ...body, client_id: 'fixture-client' });
    }
    if (req.url === '/unusual/exchange') {
      const body = new URLSearchParams(raw);
      assert.equal(body.get('resource'), base + '/mcp'); assert.equal(body.get('client_id'), 'fixture-client');
      assert.equal(body.get('redirect_uri'), redirect); assert.equal(body.get('code'), 'fixture-code');
      assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), challenge);
      assert.equal(body.get('client_secret'), null);
      return json(200, { access_token: 'fixture-access-token', token_type: 'Bearer', expires_in: 60, scope: scopes.join(' ') });
    }
    if (req.url !== '/mcp') return json(404, {});
    if (req.headers.authorization !== 'Bearer fixture-access-token') {
      res.writeHead(401, { 'WWW-Authenticate': `Bearer resource_metadata="${base}/metadata/resource", scope="read"` }); return res.end();
    }
    if (req.method === 'GET') { res.writeHead(405); return res.end(); }
    const message = JSON.parse(raw);
    if (message.id === undefined) { res.writeHead(202); return res.end(); }
    if (message.method === 'initialize') return json(200, { jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'protocol-fixture', version: '1' } } });
    if (message.method === 'tools/call') return json(200, { jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'fixture identity only' }], structuredContent: { mode: 'fixture' } } });
    return json(200, { jsonrpc: '2.0', id: message.id, result: { tools: [] } });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const options = {
    serverUrl: base + '/mcp', redirectUrl: 'http://127.0.0.1:18765/callback', scopes,
    openAuthorization(url) {
      assert.equal(url.origin + url.pathname, base + '/unusual/consent');
      assert.equal(url.searchParams.get('resource'), base + '/mcp'); assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      assert.equal(url.searchParams.get('scope'), scopes.join(' '));
      challenge = url.searchParams.get('code_challenge'); redirect = url.searchParams.get('redirect_uri'); state = url.searchParams.get('state');
      assert.ok(state);
    },
    async receiveCallback() { return `${redirect}?${deny ? 'error=access_denied' : 'code=fixture-code'}&state=${state}`; },
  };
  try { await run({ options, calls }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('official SDK follows 401 PRM, AS metadata, DCR, S256 exchange and authenticated MCP', async () => fixture(async ({ options, calls }) => {
  const session = await connectTaskMcp(options);
  try {
    await session.client.listTools();
    const result = await session.client.callTool({ name: 'agent_status', arguments: {} });
    assert.equal(result.structuredContent.mode, 'fixture');
    for (const path of ['/metadata/resource', '/.well-known/oauth-authorization-server', '/unusual/clients', '/unusual/exchange']) assert.ok(calls.some(c => c.path === path));
    assert.equal(calls.filter(c => c.path === '/unusual/exchange').length, 1);
    assert.ok(calls.filter(c => c.raw.includes('tools/')).every(c => c.auth === 'Bearer fixture-access-token'));
    assert.ok(!calls.some(c => ['/authorize', '/token', '/register'].includes(c.path)));
  } finally { await session.close(); }
}));

test('host explicitly requests discuss through SDK auth scope and receives a new human callback', async () => fixture(async ({ options, calls }) => {
  const session = await connectTaskMcp(options);
  try {
    assert.equal(calls.filter(c => c.path === '/unusual/exchange').length, 1);
    assert.ok(calls.some(c => c.path === '/.well-known/oauth-protected-resource/mcp'));
    await session.client.listTools();
  } finally { await session.close(); }
}, { scopes: ['read', 'discuss'] }));

for (const [name, config] of [['missing AS metadata', { missingMetadata: true }], ['wrong resource', { wrongResource: true }], ['human rejection', { deny: true }]]) {
  test(`stops before token exchange on ${name}`, async () => fixture(async ({ options, calls }) => {
    await assert.rejects(connectTaskMcp(options));
    assert.ok(!calls.some(c => c.path === '/unusual/exchange'));
    assert.ok(!calls.some(c => ['/authorize', '/token', '/register'].includes(c.path)));
  }, config));
}

test('callback validates state, exact receiver, duplicates and one-time consumption', async () => {
  const provider = new TaskOAuthProvider({ serverUrl: 'https://example.test/mcp', redirectUrl: 'http://127.0.0.1:1234/callback', openAuthorization() {} });
  const state = provider.state(); provider.saveCodeVerifier('test-verifier');
  await provider.redirectToAuthorization(new URL('https://example.test/consent'));
  for (const callback of [`http://127.0.0.1:1234/callback?code=c&state=wrong`, `http://127.0.0.1:9999/callback?code=c&state=${state}`, `http://127.0.0.1:1234/callback?code=c&state=${state}&state=${state}`]) assert.throws(() => provider.consumeCallback(callback));
  const callback = `http://127.0.0.1:1234/callback?code=c&state=${state}`;
  assert.equal(provider.consumeCallback(callback), 'c'); assert.throws(() => provider.consumeCallback(callback));
  provider.invalidateCredentials('all'); assert.throws(() => provider.codeVerifier()); assert.equal(provider.tokens(), undefined);
});

test('callback rejects duplicate codes and error/code ambiguity', async () => {
  for (const query of ['code=a&code=b', 'code=a&error=access_denied']) {
    const provider = new TaskOAuthProvider({ serverUrl: 'https://example.test/mcp', redirectUrl: 'http://localhost:1234/cb', openAuthorization() {} });
    const state = provider.state(); await provider.redirectToAuthorization(new URL('https://example.test/consent'));
    assert.throws(() => provider.consumeCallback(`http://localhost:1234/cb?${query}&state=${state}`));
  }
});
