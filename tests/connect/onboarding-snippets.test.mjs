import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAgentCredential } from '../../examples/agent/credentials.ts';

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
    const child = spawn('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', file], { env: { ...process.env, ...env }, windowsHide: true });
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
  f.respond((req, res) => { res.end(req.url === '/agent-skill.md' ? '# Fixture skill' : JSON.stringify({ ok: true, data: { records: [], next_cursor: null }, mode: 'live' })); });
  const result = await shell(snippet('public-powershell'), f.env, f.directory);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(f.calls.map(call => call.authorization), [undefined, undefined]);
  assert.match(result.stdout, /Fixture skill/);
  assert.match(result.stdout, /"records":\[\]/);
}));
