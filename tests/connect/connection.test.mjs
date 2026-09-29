import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConnectInfo } from '../../lib/gongzhi/connect.ts';
import { runCommand } from '../../examples/agent/commands.ts';
import { saveAgentCredential } from '../../examples/agent/credentials.ts';

// Isolated HTTP response fixtures, not real registration or public connectivity.
const env = { GONGZHI_SELF_HOSTED_URL: 'http://127.0.0.1:3999', GONGZHI_EXTERNAL_AGENT_KEY: 'synthetic-private-key' };
const signal = AbortSignal.timeout(60_000);
const response = data => Response.json({ ok: true, data, mode: 'live' });
const status = {
  owner: { id: 'agent-1', publisher_id: 'publisher-1', kind: 'external_agent', name: 'Fixture Agent', capabilities: ['review'], revoked_at: null, last_seen_at: null, created_at: '2026-09-14T00:00:00Z', mode: 'live' },
  human_owner_id: 'human-1', scopes: ['discuss'], mode: 'live',
};
const run = (command, fetch, override = {}) => runCommand({ args: [command], env, input: [], signal, fetch, ...override });

test('connection uses Core discovery anonymously, ignores a missing credential file and emits no secrets', async () => {
  let calls = 0;
  const result = await run('connection', async (url, init) => {
    calls++;
    assert.equal(url.pathname, '/api/gongzhi/connect');
    assert.equal(init.headers.Authorization, undefined);
    assert.equal(init.redirect, 'error');
    assert.equal(init.signal, signal);
    return response({ ...readConnectInfo(), api_key: 'unexpected-secret' });
  }, { env: { ...env, GONGZHI_AGENT_GRANT_TOKEN: 'synthetic-grant', GONGZHI_AGENT_CREDENTIAL_FILE: join(tmpdir(), 'never-read-this-file.json') } });
  assert.equal(calls, 1);
  assert.equal(result.identity_verified, false);
  assert.equal(result.endpoints.agent_status, `${env.GONGZHI_SELF_HOSTED_URL}/api/gongzhi/agents/me`);
  assert.equal(result.mcp_template.url, `${env.GONGZHI_SELF_HOSTED_URL}/mcp`);
  assert.match(result.template_notice, /not a directly importable/);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-private-key|synthetic-grant|unexpected-secret|Bearer /);
});

test('discovery refuses injected endpoints, unsupported contracts and malformed replies', async () => {
  const info = readConnectInfo();
  for (const data of [null, {}, { ...info, contract_version: 'other' }, { ...info, endpoints: { ...info.endpoints, mcp: 'https://other.invalid/mcp' } }, { ...info, endpoints: { ...info.endpoints, mcp: '//other.invalid/mcp' } }, { ...info, mcp: { ...info.mcp, protocol_versions: ['secret'] } }]) {
    await assert.rejects(run('connection', async () => response(data)), e => e.error.code === 'upstream_failed');
  }
});

test('status uses only the bound private key and server scopes, including an identity without read scope', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gongzhi-status-'));
  const path = join(directory, 'key.json');
  try {
    await saveAgentCredential(path, env.GONGZHI_SELF_HOSTED_URL, 'synthetic-saved-key');
    const result = await run('status', async (url, init) => {
      assert.equal(url.pathname, '/api/gongzhi/agents/me');
      assert.equal(init.headers.Authorization, 'Bearer synthetic-saved-key');
      return response({ ...status, api_key: 'unexpected-secret', owner: { ...status.owner, token_hash: 'unexpected-hash' } });
    }, { env: { GONGZHI_SELF_HOSTED_URL: env.GONGZHI_SELF_HOSTED_URL, GONGZHI_AGENT_CREDENTIAL_FILE: path } });
    assert.deepEqual(result, status);
    assert.doesNotMatch(JSON.stringify(result), /synthetic-saved-key|unexpected-secret|unexpected-hash/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('missing credentials stop status before HTTP; revoked credentials never fall back to anonymous discovery', async () => {
  let calls = 0;
  const fetch = async url => {
    calls++;
    assert.equal(url.pathname, '/api/gongzhi/agents/me');
    return Response.json({ ok: false, mode: 'live', error: { code: 'revoked', message: 'Synthetic revoked', retryable: false } }, { status: 403 });
  };
  await assert.rejects(run('status', fetch, { env: { GONGZHI_SELF_HOSTED_URL: env.GONGZHI_SELF_HOSTED_URL } }), e => e.error.code === 'unavailable');
  assert.equal(calls, 0);
  await assert.rejects(run('status', fetch), e => e.error.code === 'revoked');
  assert.equal(calls, 1);
});

test('status never confirms malformed, human, revoked or invented-scope identity data', async () => {
  for (const data of [null, {}, { ...status, human_owner_id: '' }, { ...status, scopes: ['adopt'] }, { ...status, mode: 'demo' }, { ...status, owner: { ...status.owner, kind: 'human' } }, { ...status, owner: { ...status.owner, revoked_at: '2026-09-14T00:00:00Z' } }]) {
    await assert.rejects(run('status', async () => response(data)), e => e.error.code === 'upstream_failed');
  }
});

test('status accepts empty capability strings permitted by the shared registration contract', async () => {
  const data = { ...status, owner: { ...status.owner, capabilities: [''] } };
  assert.deepEqual(await run('status', async () => response(data)), data);
});

test('connection/status cancellation, unavailable responses and transport loss do not retry', async () => {
  for (const command of ['connection', 'status']) {
    let calls = 0;
    const fetch = async () => { calls++; throw Error('synthetic disconnect'); };
    await assert.rejects(run(command, fetch, { signal: AbortSignal.abort() }));
    assert.equal(calls, 0);
    await assert.rejects(run(command, fetch), e => e.error.code === 'unavailable');
    assert.equal(calls, 1);
  }
});
