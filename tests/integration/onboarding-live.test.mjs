import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createExternalAgent } from '../../examples/agent/client.ts';

// Explicitly isolated real GoTrue/PG acceptance. Scripted records are not
// autonomous Agent collaboration. Credentials remain in the private host store.
test('isolated onboarding: real CLI, REST and official MCP SDK share identity and records', {
  skip: process.env.GONGZHI_ONBOARDING_ACCEPTANCE !== 'true', timeout: 120_000,
}, async t => {
  const origin = process.env.SITE_URL;
  assert.equal(origin, 'http://127.0.0.1:3069');
  assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:56541');
  assert.equal(process.env.GONGZHI_LOCAL_PROJECT, 'gongzhi-onboarding-i-20260914');
  const privateDir = process.env.GONGZHI_ONBOARDING_CREDENTIAL_DIR;
  assert.ok(privateDir);
  const run = randomUUID(), key = name => `i-onboarding:${run}:${name}`;
  const credentialPath = resolve(privateDir, `script-agent-${run}.json`);
  const sessions = [];
  t.after(async () => { for (const client of sessions) await client.auth.signOut({ scope: 'local' }); });
  const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  sessions.push(auth);
  const login = await auth.auth.signInWithPassword({
    email: process.env.GONGZHI_TEST_UNBOUND_EMAIL, password: process.env.GONGZHI_TEST_UNBOUND_PASSWORD,
  });
  assert.ok(!login.error && login.data.session, 'Official GoTrue login failed; details suppressed');
  const humanToken = login.data.session.access_token;
  const secrets = [humanToken];
  const api = async (token, path, method = 'GET', input) => {
    const response = await fetch(`${origin}/api/gongzhi/${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const ok = async (...args) => {
    const response = await api(...args);
    assert.equal(response.status, 200, `REST ${args[1]}: ${response.body.error?.code ?? 'unexpected status'}`);
    assert.equal(response.body.ok, true);
    return response.body.data;
  };
  const cli = (args, input, extra = {}) => new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'examples/agent/cli.ts', ...args], {
      cwd: process.cwd(), windowsHide: true,
      env: { ...process.env, GONGZHI_SELF_HOSTED_URL: origin, GONGZHI_EXTERNAL_AGENT_KEY: '',
        GONGZHI_AGENT_CREDENTIAL_FILE: credentialPath, ...extra },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    child.stdout.on('data', b => { out += b; }); child.stderr.on('data', b => { err += b; });
    child.once('error', reject);
    child.once('close', code => {
      try {
        assert.ok(secrets.every(secret => !out.includes(secret) && !err.includes(secret)), 'CLI exposed a credential');
        resolveResult({ code, value: JSON.parse(code === 0 ? out : err) });
      } catch { reject(new Error('CLI output invalid or unsafe; details suppressed')); }
    });
    child.stdin.end(input === undefined ? '' : JSON.stringify(input));
  });
  const human = (await ok(humanToken, 'owners', 'POST', { kind: 'human', name: 'Scripted integration acceptance owner' })).owner;
  const scopes = ['read', 'discuss', 'submit_result'];
  const grant = await ok(humanToken, 'authorizations', 'POST', { scopes, idempotency_key: key('grant') });
  secrets.push(grant.grant_token);
  const registered = await cli(['register', key('register')], undefined, { GONGZHI_AGENT_GRANT_TOKEN: grant.grant_token });
  assert.equal(registered.code, 0); assert.equal(registered.value.credential_saved, true);
  const credential = JSON.parse(await readFile(credentialPath, 'utf8'));
  const agentKey = credential.api_key;
  assert.ok(agentKey?.startsWith('crier_sk_')); secrets.push(agentKey);
  const sdk = new Client({ name: 'gongzhi-isolated-integration', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', origin), {
    requestInit: { headers: { Authorization: `Bearer ${agentKey}` } },
  });
  t.after(() => sdk.close());
  await sdk.connect(transport);
  const tool = async (name, args = {}) => sdk.callTool({ name, arguments: args });
  const projection = status => ({ speaker: status.owner.id, human: status.human_owner_id, scopes: [...status.scopes].sort() });
  const status = await ok(agentKey, 'agents/me');

  await t.test('default enrollment delivers a private key once; discovery never claims identity', async () => {
    assert.equal(status.owner.kind, 'external_agent'); assert.ok(status.owner.name);
    assert.equal(status.human_owner_id, human.id); assert.deepEqual([...status.scopes].sort(), [...scopes].sort());
    const replay = await ok(grant.grant_token, 'agents/register', 'POST', { idempotency_key: key('register') });
    assert.equal(replay.owner.id, status.owner.id); assert.equal(replay.credential_state, 'not_recoverable');
    assert.equal(Object.hasOwn(replay, 'api_key'), false);
    const discovery = await cli(['connection'], undefined, { GONGZHI_AGENT_CREDENTIAL_FILE: resolve(privateDir, 'does-not-exist.json') });
    assert.equal(discovery.code, 0); assert.equal(discovery.value.identity_verified, false);
    const fromCli = await cli(['status']); assert.equal(fromCli.code, 0);
    const fromMcp = await tool('agent_status'); assert.notEqual(fromMcp.isError, true);
    assert.deepEqual(projection(fromCli.value), projection(status));
    assert.deepEqual(projection(fromMcp.structuredContent.data), projection(status));
  });
  await t.test('human, grant, invalid and absent keys fail status; scopes cannot self-expand', async () => {
    for (const [token, httpStatus, errorCode] of [
      [humanToken, 401, 'unauthenticated'], [grant.grant_token, 401, 'unauthenticated'],
      ['crier_sk_invalid', 403, 'unbound_identity'], [undefined, 401, 'unauthenticated'],
    ]) {
      const response = await api(token, 'agents/me'); assert.equal(response.status, httpStatus);
      assert.equal(response.body.error.code, errorCode);
      const client = new Client({ name: 'gongzhi-negative', version: '1.0.0' }, { capabilities: {} });
      try {
        await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', origin), {
          requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        }));
        const result = await client.callTool({ name: 'agent_status', arguments: {} });
        assert.equal(result.isError, true); assert.equal(result.structuredContent.error.code, errorCode);
      } finally { await client.close(); }
    }
    assert.equal((await api(grant.grant_token, 'agents/register', 'POST', { idempotency_key: key('forged'), owner_id: human.id, scopes: ['publish_need'] })).body.error.code, 'invalid_request');
    const needInput = { title: 'Forbidden scope probe', body: 'Scripted negative acceptance', idempotency_key: key('forbidden') };
    assert.equal((await api(agentKey, 'needs', 'POST', needInput)).body.error.code, 'forbidden');
    assert.equal((await tool('create_need', needInput)).structuredContent.error.code, 'forbidden');
  });
  const need = await ok(humanToken, 'needs', 'POST', { title: `Scripted onboarding verification ${run}`, body: 'Isolated transport acceptance only; not autonomous Agent work.', idempotency_key: key('need') });
  await t.test('scripted CLI reply/result have identical REST, official MCP and board records', async () => {
    const reply = await cli(['reply'], { thread_id: need.id, category: 'reply', expected_revision: 1, body: 'Script-driven SDK/CLI readback verification, not independent Agent reasoning.', idempotency_key: key('reply') });
    assert.equal(reply.code, 0);
    const result = await cli(['submit'], { need_id: need.id, need_revision: 1, title: 'Scripted verification result', body: 'HTTP/MCP receipt verified; no real task execution or human adoption claimed.', idempotency_key: key('result') });
    assert.equal(result.code, 0);
    for (const id of [reply.value.id, result.value.result_id]) {
      const record = await ok(agentKey, `records/${id}`);
      assert.equal(record.speaker_id, status.owner.id); assert.equal(record.owner_id, human.id);
      const fromMcp = await tool('read_record', { id });
      assert.equal(fromMcp.structuredContent.data.id, id);
      assert.equal(fromMcp.structuredContent.data.body, record.body);
      assert.ok((await ok(agentKey, 'board?limit=100')).records.some(r => r.id === id));
    }
  });
  await t.test('one injected lost response stays unknown; readback reconciles the original key', async () => {
    let writes = 0;
    const input = { thread_id: need.id, category: 'reply', expected_revision: 1, body: `Scripted lost-response test ${run}`, idempotency_key: key('unknown') };
    const client = createExternalAgent({ baseUrl: origin, apiKey: agentKey, signal: AbortSignal.timeout(15_000), fetch: async (url, init) => {
      const response = await fetch(url, init);
      if (init.method === 'POST') { writes++; await response.arrayBuffer(); throw new Error('Injected response loss after real persistence'); }
      return response;
    } });
    await assert.rejects(client.postReply(input), error => error.error?.code === 'unknown' && error.error.retryable === false);
    assert.equal(writes, 1);
    const matches = (await ok(agentKey, `threads/${need.id}`)).records.filter(r => r.body === input.body);
    assert.equal(matches.length, 1);
    // Explicit reconciliation after readback, using the same request key and body.
    assert.equal((await ok(agentKey, 'discussions', 'POST', input)).id, matches[0].id);
  });
  await t.test('revocation denies CLI, REST and MCP while public history remains readable', async () => {
    await ok(humanToken, `authorizations/${grant.authorization.id}`, 'DELETE');
    assert.equal((await api(agentKey, 'agents/me')).body.error.code, 'revoked');
    assert.equal((await tool('agent_status')).structuredContent.error.code, 'revoked');
    const fromCli = await cli(['status']); assert.equal(fromCli.code, 1); assert.equal(fromCli.value.code, 'revoked');
    assert.equal((await ok(undefined, `records/${need.id}`)).id, need.id);
  });
});
