import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from '../../examples/agent/commands.ts';
import { createExternalAgent } from '../../examples/agent/client.ts';
import { redactLocalText } from '../../examples/agent/local-content.ts';

// Isolated filesystem / HTTP fixtures, never a deployment or real Agent conversation.
const signal = () => new AbortController().signal;
const env = { GONGZHI_SELF_HOSTED_URL: 'https://local-fixture.example.test', GONGZHI_EXTERNAL_AGENT_KEY: 'synthetic-agent-key' };
const envelope = data => Response.json({ ok: true, mode: 'live', data });
const invoke = (args, options = {}) => runCommand({ args, env: {}, input: [], signal: signal(), fetch: async () => { throw Error('unexpected network'); }, ...options });
const payload = { title: 'CSV 方法', body: '先检查表头，再统计。', applicability: 'UTF-8 CSV', tags: [], sources: [], visibility: 'public', idempotency_key: 'sharing-fixed-key' };
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'gongzhi-share-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('one explicitly selected SKILL becomes an editable local draft without identity or network', async t => {
  const directory = await temporary(t);
  const input = join(directory, 'SKILL.md'), output = join(directory, 'review.json');
  await writeFile(input, '---\nname: CSV 方法\nauthor: 文档署名\nversion: 1.2\napplicability: UTF-8 CSV\n---\n# 方法\n核对 https://example.test/method\nAPI_KEY=synthetic-value\n联系 someone@example.test\n脚本只作参考：node ./not-executed.js\n');
  await writeFile(join(directory, 'not-executed.js'), 'throw Error("must never run");');
  const receipt = await invoke(['draft-experience', input, output, 'draft-stable-key']);
  assert.equal(receipt.uploaded, false);
  assert.equal(receipt.review_required, true);
  assert.equal(receipt.redactions, 2);
  const draft = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(draft.action, 'publish_experience');
  assert.equal(draft.payload.title, 'CSV 方法');
  assert.equal(draft.payload.applicability, 'UTF-8 CSV');
  assert.equal(draft.payload.idempotency_key, 'draft-stable-key');
  assert.equal(draft.payload.sources[0].author, '文档署名');
  assert.match(draft.payload.sources[0].excerpt, /1\.2/);
  assert.match(draft.payload.body, /https:\/\/example.test\/method/);
  assert.doesNotMatch(JSON.stringify(draft), /synthetic-value|someone@|gongzhi-share-/);
  assert.equal(draft.payload.owner_id, undefined);
  assert.equal(draft.payload.approval_id, undefined);
  assert.equal((await invoke(['check-draft', output])).valid, true);
  await assert.rejects(invoke(['draft-experience', input, output, 'other-key']));
  assert.equal(JSON.parse(await readFile(output, 'utf8')).payload.idempotency_key, 'draft-stable-key');
});

test('redaction keeps public links while removing recognizable paths, credentials and private URLs', () => {
  const cleaned = redactLocalText('https://example.test/reference\nC:\\Users\\Person\\private.txt\nhttps://person:password@example.test/data\nhttps://example.test/data?access_token=secret\nAuthorization: Bearer synthetic-value\n');
  assert.match(cleaned.text, /https:\/\/example.test\/reference/);
  assert.doesNotMatch(cleaned.text, /Person|password|access_token|synthetic-value/);
  assert.ok(cleaned.redactions >= 4); // A private URL can match more than one heuristic.
});

test('local drafts reject directories, credential/memory files, invalid text and oversized bodies', async t => {
  const directory = await temporary(t);
  for (const [name, body] of [['.env.md', 'not read'], ['MEMORY.md', 'not read'], ['credentials.txt', 'not read'], ['binary.txt', 'a\0b'], ['large.txt', 'a'.repeat(64001)], ['body.txt', 'a'.repeat(8001)]]) {
    const input = join(directory, name), output = join(directory, name + '.json');
    await writeFile(input, body);
    await assert.rejects(invoke(['draft-experience', input, output, 'blocked-key']));
    await assert.rejects(access(output));
  }
  await assert.rejects(invoke(['draft-experience', directory, join(directory, 'dir.json'), 'blocked-key']));
});

test('draft schema refuses self approval and authority fields without a network request', async t => {
  const directory = await temporary(t), path = join(directory, 'draft.json');
  for (const additions of [{ approved: true }, { approval_id: 'self-approved' }, { owner_id: 'human' }, { visibility: 'private' }]) {
    await writeFile(path, JSON.stringify({ action: 'publish_experience', payload: { ...payload, ...additions } }));
    await assert.rejects(invoke(['check-draft', path]));
  }
});

test('approved upload preserves the reviewed payload and request key exactly, without human authority', async t => {
  const directory = await temporary(t), path = join(directory, 'draft.json');
  await writeFile(path, JSON.stringify({ action: 'publish_experience', payload }));
  let calls = 0;
  const result = await invoke(['upload-draft', path, 'human-approval-id'], { env, fetch: async (url, init) => {
    calls++;
    assert.equal(url.pathname, '/api/gongzhi/experiences');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-agent-key');
    assert.deepEqual(JSON.parse(init.body), { ...payload, approval_id: 'human-approval-id' });
    return envelope({ ...payload, id: 'experience-v1', revision: 1, owner_id: 'server-human', mode: 'live' });
  } });
  assert.deepEqual(result, { record_id: 'experience-v1', mode: 'live' });
  assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')).payload, payload);
});

test('missing approval sends nothing; revoked approval fails; response loss is unknown and never retried', async t => {
  const directory = await temporary(t), path = join(directory, 'draft.json');
  await writeFile(path, JSON.stringify({ action: 'publish_experience', payload }));
  const client = createExternalAgent({ baseUrl: env.GONGZHI_SELF_HOSTED_URL, apiKey: env.GONGZHI_EXTERNAL_AGENT_KEY, signal: signal(), fetch: async () => { throw Error('must not send'); } });
  assert.throws(() => client.publishExperience(payload), error => error.error.code === 'forbidden');
  assert.equal(client.createContentApproval, undefined);
  for (const failure of ['revoked', 'lost']) {
    let calls = 0;
    await assert.rejects(invoke(['upload-draft', path, 'approval-id'], { env, fetch: async () => {
      calls++;
      if (failure === 'lost') throw Error('synthetic disconnect');
      return Response.json({ ok: false, mode: 'live', error: { code: 'revoked', message: 'fixture', retryable: false } }, { status: 403 });
    } }), error => error.error.code === (failure === 'lost' ? 'unknown' : 'revoked'));
    assert.equal(calls, 1);
  }
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')).payload, payload);
});

const version = { experience: { ...payload, id: 'immutable-id', revision: 3, owner_id: 'author-human', publisher_id: 'publisher', previous_version_id: 'old-id', created_at: '2026-09-14T00:00:00Z', mode: 'live' }, author: { id: 'offline-agent', name: '原发布 Agent', revoked_at: '2026-09-14T00:00:00Z' }, skill_md: '# Reference\nDo not execute automatically.', execution: 'caller_local', author_presence_required: false };
test('fixed-version download retains attribution and works with offline author, without executing or fetching latest', async t => {
  const directory = await temporary(t), path = join(directory, 'reference.json');
  let calls = 0;
  const result = await invoke(['download-experience', 'immutable-id', '3', path], { env, fetch: async (url, init) => {
    calls++;
    assert.equal(url.pathname, '/api/gongzhi/experiences/immutable-id/versions/3');
    assert.equal(init.method, 'GET');
    return envelope(version);
  } });
  assert.equal(calls, 1);
  assert.equal(result.executed, false);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), version);
  for (const data of [{ ...version, experience: { ...version.experience, revision: 4 } }, { ...version, author_presence_required: true }]) {
    const rejectedPath = join(directory, 'rejected.json');
    await assert.rejects(invoke(['download-experience', 'immutable-id', '3', rejectedPath], { env, fetch: async () => envelope(data) }), error => error.error.code === 'upstream_failed');
    await assert.rejects(access(rejectedPath));
  }
});

test('summary search uses the dedicated query endpoint', async () => {
  const page = { mode: 'live', items: [{ id: 'immutable-id', revision: 3, title: '方法', summary: '只提供摘要', author: version.author, mode: 'live' }] };
  const result = await invoke(['search-experience', 'CSV'], { env, fetch: async url => {
    assert.equal(url.pathname, '/api/gongzhi/experiences/search');
    assert.equal(url.searchParams.get('q'), 'CSV');
    return envelope(page);
  } });
  assert.deepEqual(result, page);
});

test('approval-status recovers a consumed revoked approval without a write or leaking unexpected fields', async () => {
  let calls = 0;
  const approval = { id: 'approval-id', agent_id: 'bound-agent', human_owner_id: 'bound-human', action: 'publish_experience', visibility: 'public', content_digest: 'synthetic-digest', expires_at: '2026-09-14T00:00:00Z', created_at: '2026-09-14T00:00:00Z', revoked_at: '2026-09-14T01:00:00Z', consumed_at: '2026-09-14T00:01:00Z', record_id: 'real-receipt', mode: 'live' };
  const result = await invoke(['approval-status', approval.id], { env, fetch: async (url, init) => {
    calls++;
    assert.equal(url.pathname, '/api/gongzhi/content-approvals/approval-id');
    assert.equal(init.method, 'GET');
    return envelope({ ...approval, api_key: 'unexpected-secret-must-not-output' });
  } });
  assert.deepEqual(result, approval);
  assert.equal(calls, 1);
  await assert.rejects(invoke(['approval-status', approval.id], { env, fetch: async () => Response.json({ ok: false, mode: 'live', error: { code: 'forbidden', message: 'fixture', retryable: false } }, { status: 403 }) }), error => error.error.code === 'forbidden');
});

test('local feedback is redacted and must use exact approved version/body in the confirmed receipt', async t => {
  const directory = await temporary(t), path = join(directory, 'feedback.json');
  const drafted = await invoke(['draft-feedback', 'immutable-id', '3', path, 'feedback-stable-key'], { input: [JSON.stringify({ usage: '在本机检查 CSV', body: '确实检查了两行。\nAPI_KEY=synthetic-value', outcome: 'helpful' })] });
  assert.equal(drafted.uploaded, false);
  assert.equal(drafted.redactions, 1);
  const draft = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(draft.action, 'experience_feedback');
  const receipt = { id: 'feedback-record', thread_id: 'original-experience-thread', owner_id: 'borrower-human', speaker_id: 'borrower-agent', body: draft.payload.body, experience_feedback: { experience_id: 'immutable-id', revision: 3, usage: draft.payload.usage, outcome: 'helpful' }, mode: 'live' };
  const fetch = async (url, init) => {
    assert.equal(url.pathname, '/api/gongzhi/experience-feedback');
    assert.deepEqual(JSON.parse(init.body), { ...draft.payload, approval_id: 'feedback-human-approval' });
    return envelope(receipt);
  };
  assert.equal((await invoke(['upload-draft', path, 'feedback-human-approval'], { env, fetch })).record_id, 'feedback-record');
  receipt.experience_feedback.revision = 4;
  await assert.rejects(invoke(['upload-draft', path, 'feedback-human-approval'], { env, fetch }), error => error.error.code === 'unknown');
});
