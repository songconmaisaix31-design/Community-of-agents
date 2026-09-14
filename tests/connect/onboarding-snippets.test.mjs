import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAgentCredential, saveAgentCredential } from '../../examples/agent/credentials.ts';
import { readConnectInfo } from '../../lib/gongzhi/connect.ts';
import { handleMcpPost } from '../../lib/mcp.ts';

// Execute the published PowerShell + real curl commands against an isolated HTTP
// simulator. No real grant, database, model, public account or cloud write.
const skill = await readFile(new URL('../../docs/connect/agent-skill.md', import.meta.url), 'utf8');
const snippet = id => {
  const text = skill.split(`<!-- snippet:${id} -->`)[1];
  assert.ok(text, `missing published snippet ${id}`);
  return text.match(/```powershell\r?\n([\s\S]*?)\r?\n```/)[1];
};
const enabled = process.platform === 'win32';
async function shell(script, env, dir) {
  const file = join(dir, 'snippet.ps1');
  await writeFile(file, script);
  return new Promise((resolve, reject) => {
    const child = spawn('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', file], { cwd: dir, env: { ...process.env, ...env }, windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}
async function fixture(action) {
  const directory = await mkdtemp(join(tmpdir(), 'gongzhi-curl-snippet-'));
  const calls = [];
  let handler = (_req, res) => { res.writeHead(500); res.end(); };
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const part of req) body += part;
    calls.push({ url: req.url, authorization: req.headers.authorization, body });
    handler(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const env = { GONGZHI_SELF_HOSTED_URL: origin, GONGZHI_AGENT_GRANT_TOKEN: 'synthetic_grant_only', GONGZHI_REGISTRATION_KEY: 'stable-snippet-test', GONGZHI_AGENT_CREDENTIAL_FILE: join(directory, 'credential.json') };
  try { await action({ directory, origin, env, calls, respond: fn => { handler = fn; } }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
}
const issued = { ok: true, mode: 'live', data: { owner: { id: 'fixture-agent', kind: 'external_agent', mode: 'live' }, human_owner_id: 'fixture-owner', scopes: ['read', 'discuss'], credential_state: 'issued', api_key: 'synthetic_one_time_key' } };
const identity = { owner: { id: 'fixture-agent', kind: 'external_agent', mode: 'live', revoked_at: null }, human_owner_id: 'fixture-owner', scopes: ['read', 'discuss', 'submit_result'], mode: 'live' };

test('published curl registration privately saves a credential readable by the existing helper', { skip: !enabled }, async () => fixture(async f => {
  f.respond((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(issued)); });
  const result = await shell(snippet('curl-register'), f.env, f.directory);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].authorization, 'Bearer synthetic_grant_only');
  assert.deepEqual(JSON.parse(f.calls[0].body), { idempotency_key: 'stable-snippet-test' });
  assert.deepEqual(JSON.parse(result.stdout), { agent_id: 'fixture-agent', human_owner_id: 'fixture-owner', scopes: ['read', 'discuss'], credential_saved: true, mode: 'live' });
  assert.equal(await readAgentCredential(f.env.GONGZHI_AGENT_CREDENTIAL_FILE, f.origin), 'synthetic_one_time_key');
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic_one_time_key|synthetic_grant_only/);
  const repeat = await shell(snippet('curl-register'), f.env, f.directory);
  assert.notEqual(repeat.code, 0);
  assert.equal(f.calls.length, 1, 'existing file stops repeat registration before HTTP');
}));

for (const failure of ['revoked', 'response-lost', 'missing-receipt', 'redirect', 'not-recoverable']) {
  test(`published curl registration preserves ${failure}, no key leakage or automatic retry`, { skip: !enabled }, async () => fixture(async f => {
    f.respond((req, res) => {
      if (failure === 'response-lost') { req.socket.destroy(); return; }
      if (failure === 'revoked') { res.writeHead(403); res.end(JSON.stringify({ ok: false, mode: 'live', error: { code: 'revoked', message: 'synthetic_grant_only' } })); return; }
      if (failure === 'redirect') res.writeHead(307, { Location: `${f.origin}/must-not-follow` });
      res.end(JSON.stringify(failure === 'missing-receipt' ? { ok: true, mode: 'live', data: {} } : failure === 'not-recoverable' ? { ...issued, data: { ...issued.data, credential_state: 'not_recoverable', api_key: undefined } } : issued));
    });
    const result = await shell(snippet('curl-register'), f.env, f.directory);
    assert.notEqual(result.code, 0);
    assert.equal(f.calls.length, 1);
    assert.match(result.stderr, failure === 'revoked' ? /registration refused: revoked/ : /unknown:/);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic_one_time_key|synthetic_grant_only/);
    assert.doesNotMatch(result.stdout, /credential_saved/);
    await assert.rejects(readAgentCredential(f.env.GONGZHI_AGENT_CREDENTIAL_FILE, f.origin));
  }));
}

test('published registration refuses missing grant and unsafe target before HTTP; public read uses no key', { skip: !enabled }, async () => fixture(async f => {
  for (const override of [{ GONGZHI_AGENT_GRANT_TOKEN: '' }, { GONGZHI_SELF_HOSTED_URL: 'https://user:password@other.invalid/' }]) {
    const result = await shell(snippet('curl-register'), { ...f.env, ...override }, f.directory);
    assert.notEqual(result.code, 0);
  }
  assert.equal(f.calls.length, 0);
  f.respond((req, res) => { res.end(req.url === '/agent-skill.md' ? '# Fixture skill' : JSON.stringify({ ok: true, data: req.url === '/api/gongzhi/connect' ? readConnectInfo() : { records: [], next_cursor: null }, mode: 'live' })); });
  const result = await shell(snippet('public-powershell'), f.env, f.directory);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(f.calls.map(call => call.authorization), [undefined, undefined, undefined]);
  assert.match(result.stdout, /Fixture skill/);
  assert.match(result.stdout, /"records":\[\]/);
}));

for (const behavior of ['confirmed', 'forbidden', 'response-lost', 'wrong-thread', 'wrong-speaker']) {
  test(`published authenticated curl reply: ${behavior} preserves actual receipt/unknown boundary`, { skip: !enabled }, async () => fixture(async f => {
    await saveAgentCredential(f.env.GONGZHI_AGENT_CREDENTIAL_FILE, f.origin, 'synthetic_reply_key');
    const input = { thread_id: 'fixture-thread', reply_to_id: 'fixture-other-reply', category: 'reply', body: 'Only an isolated snippet test', expected_revision: 1, idempotency_key: 'fixture-write-key' };
    await writeFile(join(f.directory, 'reply.json'), JSON.stringify(input));
    const record = { id: 'fixture-receipt', thread_id: behavior === 'wrong-thread' ? 'other-thread' : input.thread_id, reply_to_id: input.reply_to_id, speaker_id: behavior === 'wrong-speaker' ? 'other-agent' : 'fixture-agent', owner_id: 'fixture-owner', mode: 'live' };
    f.respond((req, res) => {
      if (req.url === '/api/gongzhi/agents/me') { res.end(JSON.stringify({ ok: true, mode: 'live', data: identity })); return; }
      if (behavior === 'response-lost') { req.socket.destroy(); return; }
      if (behavior === 'forbidden') { res.writeHead(403); res.end(JSON.stringify({ ok: false, mode: 'live', error: { code: 'forbidden' } })); return; }
      res.end(JSON.stringify({ ok: true, mode: 'live', data: record }));
    });
    const result = await shell(snippet('curl-credential') + '\n' + snippet('curl-status') + '\n' + snippet('curl-reply'), f.env, f.directory);
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].authorization, 'Bearer synthetic_reply_key');
    assert.deepEqual(JSON.parse(f.calls[1].body), input);
    if (behavior === 'confirmed') {
      assert.equal(result.code, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1)).record_id, 'fixture-receipt');
    } else {
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, behavior === 'forbidden' ? /reply refused: forbidden/ : /unknown:/);
    }
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic_reply_key/);
  }));
}

test('published curl credential loading refuses another origin without a request', { skip: !enabled }, async () => fixture(async f => {
  await saveAgentCredential(f.env.GONGZHI_AGENT_CREDENTIAL_FILE, 'https://other-deployment.invalid', 'synthetic_other_key');
  const result = await shell(snippet('curl-credential'), f.env, f.directory);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /not bound to this deployment/);
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic_other_key/);
  assert.equal(f.calls.length, 0);
}));

for (const behavior of ['confirmed', 'revoked', 'malformed', 'wrong-kind', 'response-lost']) {
  test(`published curl status ${behavior} does not leak secrets or imply permission`, { skip: !enabled }, async () => fixture(async f => {
    await saveAgentCredential(f.env.GONGZHI_AGENT_CREDENTIAL_FILE, f.origin, 'synthetic_status_key');
    f.respond((req, res) => {
      if (behavior === 'response-lost') { req.socket.destroy(); return; }
      if (behavior === 'revoked') { res.writeHead(403); res.end(JSON.stringify({ ok: false, mode: 'live', error: { code: 'revoked', message: 'synthetic_status_key' } })); return; }
      if (behavior === 'malformed') { res.end('synthetic_status_key'); return; }
      res.end(JSON.stringify({ ok: true, mode: 'live', data: { ...identity, api_key: 'unexpected_response_key', owner: { ...identity.owner, kind: behavior === 'wrong-kind' ? 'human' : 'external_agent' } } }));
    });
    const result = await shell(snippet('curl-credential') + '\n' + snippet('curl-status'), f.env, f.directory);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, '/api/gongzhi/agents/me');
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic_status_key|unexpected_response_key/);
    if (behavior === 'confirmed') {
      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout).scopes, identity.scopes);
    } else {
      assert.notEqual(result.code, 0);
      assert.equal(result.stdout.trim(), '');
    }
  }));
}

for (const behavior of ['confirmed', 'wrong-revision', 'response-lost', 'without-scope']) {
  test(`published curl result ${behavior} preserves scope and exact receipt`, { skip: !enabled }, async () => fixture(async f => {
    await saveAgentCredential(f.env.GONGZHI_AGENT_CREDENTIAL_FILE, f.origin, 'synthetic_result_key');
    const input = { need_id: 'fixture-need', need_revision: 2, title: 'Fixture', body: 'Only simulated execution', sources: [], method_refs: [], idempotency_key: 'fixture-result-key' };
    await writeFile(join(f.directory, 'result.json'), JSON.stringify(input));
    f.respond((req, res) => {
      if (req.url === '/api/gongzhi/agents/me') { res.end(JSON.stringify({ ok: true, mode: 'live', data: { ...identity, scopes: behavior === 'without-scope' ? ['read'] : identity.scopes } })); return; }
      if (behavior === 'response-lost') { req.socket.destroy(); return; }
      res.end(JSON.stringify({ ok: true, mode: 'live', data: { id: 'fixture-result', owner_id: identity.human_owner_id, need_id: input.need_id, need_revision: behavior === 'wrong-revision' ? 1 : input.need_revision, mode: 'live' } }));
    });
    const result = await shell(snippet('curl-credential') + '\n' + snippet('curl-status') + '\n' + snippet('curl-result'), f.env, f.directory);
    assert.equal(f.calls.length, behavior === 'without-scope' ? 1 : 2);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic_result_key/);
    if (behavior === 'confirmed') {
      assert.equal(result.code, 0, result.stderr);
      assert.equal(f.calls[1].url, '/api/gongzhi/results');
      assert.deepEqual(JSON.parse(f.calls[1].body), input);
      assert.equal(JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1)).result_id, 'fixture-result');
    } else {
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, behavior === 'without-scope' ? /forbidden:/ : /unknown:/);
    }
  }));
}

test('published MCP status request reaches the real handler and missing Bearer is an error, not connected', async () => {
  const body = JSON.parse(skill.split('<!-- snippet:mcp-status -->')[1].match(/```json\r?\n([\s\S]*?)\r?\n```/)[1]);
  const response = await handleMcpPost(new Request('http://127.0.0.1/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' }, body: JSON.stringify(body) }));
  assert.equal(response.status, 200);
  const rpc = await response.json();
  assert.equal(rpc.id, body.id);
  assert.equal(rpc.result.isError, true);
  assert.equal(rpc.result.structuredContent.error.code, 'unauthenticated');
  assert.deepEqual(body.params.arguments, {});
});
