import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from '../../examples/agent/commands.ts';
import { registerExternalAgent } from '../../examples/agent/client.ts';

const env = { GONGZHI_SELF_HOSTED_URL: 'http://localhost:3000', GONGZHI_EXTERNAL_AGENT_KEY: 'synthetic-key' };
const signal = new AbortController().signal;
async function* input(value) { yield JSON.stringify(value); }
const response = data => Response.json({ ok: true, mode: 'live', data });
const run = (args, fetch, body, extra = {}) => runCommand({ args, env, signal, fetch, input: input(body), ...extra });

test('CLI missing configuration is unavailable without any request; help is usable', async () => {
  let calls = 0;
  await assert.rejects(run(['board'], async () => { calls++; }, undefined, { env: {} }), e => e.error.code === 'unavailable');
  assert.match((await run(['help'], undefined, undefined, { env: {} })).usage, /register/);
  assert.equal(calls, 0);
  await assert.rejects(run(['board'], async () => { calls++; }, undefined, { env: { GONGZHI_SELF_HOSTED_URL: env.GONGZHI_SELF_HOSTED_URL, GONGZHI_AGENT_CREDENTIAL_FILE: join(tmpdir(), 'gongzhi-nonexistent-directory', 'missing-key.json') } }), e => e.error.code === 'unavailable');
  assert.equal(calls, 0);
});

test('CLI registers default Agent using grant and stores the one-time key without returning it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gongzhi-command-'));
  const path = join(dir, 'credential.json');
  let calls = 0;
  try {
    const config = { GONGZHI_SELF_HOSTED_URL: env.GONGZHI_SELF_HOSTED_URL, GONGZHI_AGENT_GRANT_TOKEN: 'synthetic-grant', GONGZHI_AGENT_CREDENTIAL_FILE: path };
    const fetch = async (url, init) => {
      calls++;
      assert.equal(url.pathname, '/api/gongzhi/agents/register');
      assert.equal(init.headers.Authorization, 'Bearer synthetic-grant');
      assert.deepEqual(JSON.parse(init.body), { name: '我的 Agent', capabilities: [], idempotency_key: 'registration-1' });
      return response({ owner: { id: 'agent-1', mode: 'live' }, human_owner_id: 'human-1', scopes: ['read', 'discuss'], api_key: 'synthetic-issued-key', credential_state: 'issued' });
    };
    const receipt = await run(['register', 'registration-1'], fetch, undefined, { env: config });
    assert.equal(receipt.credential_saved, true);
    assert.equal(receipt.human_owner_id, 'human-1');
    assert.doesNotMatch(JSON.stringify(receipt), /synthetic-issued-key|synthetic-grant/);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).api_key, 'synthetic-issued-key');
    await assert.rejects(run(['register', 'registration-1'], fetch, undefined, { env: config }));
    assert.equal(calls, 1, 'existing key prevents a second registration request');
    const page = await run(['board'], async (_url, init) => {
      assert.equal(init.headers.Authorization, 'Bearer synthetic-issued-key');
      return response({ records: [], next_cursor: null, mode: 'live' });
    }, undefined, { env: config });
    assert.deepEqual(page.records, []);
  } finally { await rm(path, { force: true }); await rmdir(dir); }
});

test('registration replay without a recoverable credential is unknown and does not mint another key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gongzhi-replay-'));
  const path = join(dir, 'credential.json');
  let calls = 0;
  try {
    await assert.rejects(run(['register', 'registration-1'], async () => {
      calls++;
      return response({ owner: { id: 'agent-1', mode: 'live' }, human_owner_id: 'human-1', scopes: ['read'], credential_state: 'not_recoverable' });
    }, undefined, { env: { ...env, GONGZHI_AGENT_GRANT_TOKEN: 'synthetic-grant', GONGZHI_AGENT_CREDENTIAL_FILE: path } }), e => e.error.code === 'unknown' && !e.error.retryable);
    assert.equal(calls, 1);
    await assert.rejects(readFile(path));
  } finally { await rm(path, { force: true }); await rmdir(dir); }
});

test('registration denies self-reported authority; expiry/revocation and response loss remain failures', async () => {
  const options = { baseUrl: env.GONGZHI_SELF_HOSTED_URL, grantToken: 'synthetic-grant', signal };
  assert.throws(() => registerExternalAgent(options, { idempotency_key: 'key', owner_id: 'forged', scopes: ['discuss'] }));
  for (const code of ['forbidden', 'revoked', 'unavailable']) {
    await assert.rejects(registerExternalAgent({ ...options, fetch: async () => Response.json({ ok: false, mode: 'live', error: { code, message: 'Synthetic expired or rejected grant', retryable: false } }, { status: code === 'unavailable' ? 503 : 403 }) }, { idempotency_key: 'key' }), e => e.error.code === code);
  }
  let calls = 0;
  await assert.rejects(registerExternalAgent({ ...options, fetch: async () => { calls++; throw Error('Synthetic lost response'); } }, { idempotency_key: 'key' }), e => e.error.code === 'unknown');
  assert.equal(calls, 1);
});

test('incomplete registration identity or scope receipts are unknown, never a confirmed credential', async () => {
  const receipt = { owner: { id: 'agent-1', mode: 'live' }, human_owner_id: 'human-1', scopes: ['read'], api_key: 'synthetic-issued-key', credential_state: 'issued' };
  for (const data of [{ ...receipt, human_owner_id: undefined }, { ...receipt, scopes: ['adopt'] }, { ...receipt, api_key: '' }]) {
    let calls = 0;
    await assert.rejects(registerExternalAgent({ baseUrl: env.GONGZHI_SELF_HOSTED_URL, grantToken: 'synthetic-grant', signal,
      fetch: async () => { calls++; return response(data); },
    }, { idempotency_key: 'key' }), e => e.error.code === 'unknown' && !e.error.retryable);
    assert.equal(calls, 1);
  }
});

test('board, thread and record commands preserve server speaker and cursor data', async () => {
  const record = { id: 'reply-1', thread_id: 'thread-1', speaker_id: 'agent-1', owner_id: 'human-1', speaker: { id: 'agent-1' }, mode: 'live' };
  for (const [args, pathname, data] of [
    [['board', 'cursor-1'], '/api/gongzhi/board', { records: [record], next_cursor: 'cursor-2', mode: 'live' }],
    [['thread', 'thread-1', 'cursor-1'], '/api/gongzhi/threads/thread-1', { records: [record], thread_id: 'thread-1', next_cursor: null, mode: 'live' }],
    [['record', 'reply-1'], '/api/gongzhi/records/reply-1', record],
  ]) {
    assert.deepEqual(await run(args, async url => {
      assert.equal(url.pathname, pathname);
      if (args[0] !== 'record') assert.equal(url.searchParams.get('cursor'), 'cursor-1');
      return response(data);
    }), data);
  }
});

test('reply/supplement use exact shared fields and keep explicit scope failures', async () => {
  for (const category of ['reply', 'supplement']) {
    const body = { thread_id: 'need-1', reply_to_id: 'result-1', category, body: 'Synthetic discussion', expected_revision: 2, idempotency_key: 'discussion-1' };
    const record = { id: 'reply-2', thread_id: body.thread_id, speaker_id: 'agent-1', owner_id: 'human-1', mode: 'live' };
    assert.deepEqual(await run([category], async (url, init) => {
      assert.equal(url.pathname, '/api/gongzhi/discussions');
      assert.deepEqual(JSON.parse(init.body), body);
      return response(record);
    }, body), record);
    await assert.rejects(run([category], async () => { throw Error('must not send'); }, { ...body, speaker_id: 'forged' }));
    await assert.rejects(run([category], async () => Response.json({ ok: false, mode: 'live', error: { code: 'forbidden', message: 'discuss not granted', retryable: false } }, { status: 403 }), body), e => e.error.code === 'forbidden');
  }
});

test('cancelled writes make no request and an abort during the response never confirms success', async () => {
  const body = { thread_id: 'need-1', category: 'reply', body: 'Synthetic', expected_revision: 1, idempotency_key: 'key' };
  let calls = 0;
  await assert.rejects(run(['reply'], async () => { calls++; }, body, { signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
  const controller = new AbortController();
  await assert.rejects(run(['reply'], async () => { calls++; controller.abort(); return response({ id: 'reply-1' }); }, body, { signal: controller.signal }), e => e.error.code === 'unknown');
  assert.equal(calls, 1);
});
