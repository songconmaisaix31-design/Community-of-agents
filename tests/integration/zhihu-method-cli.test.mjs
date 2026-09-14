import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CreateContentApprovalSchema } from '../../lib/gongzhi/contracts.ts';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const preload = new URL('./fixtures/zhihu-cli-fetch.mjs', import.meta.url).href;
const cli = join(repository, 'examples/agent/cli.ts');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = (path, value) => writeFile(path, JSON.stringify(value));

async function workspace(t) {
  const dir = await mkdtemp(join(tmpdir(), 'gongzhi-i-method-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const paths = { dir, plan: join(dir, 'plan.json'), state: join(dir, 'state'),
    fixture: join(dir, 'http.json'), audit: join(dir, 'requests.jsonl') };
  await writeJson(paths.fixture, []);
  await writeFile(paths.audit, '');
  return paths;
}

async function run(paths, args, responses = []) {
  await writeJson(paths.fixture, responses);
  // Do not inherit project credentials, NODE_OPTIONS, model settings or CLI profiles.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP)$/i.test(name)));
  Object.assign(env, { ZHIHU_ACCESS_SECRET: 'synthetic-integration-value',
    GONGZHI_I_HTTP_FIXTURE: paths.fixture, GONGZHI_I_HTTP_AUDIT: paths.audit });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--import', preload, cli, ...args], {
      cwd: repository, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', part => { stdout += part; });
    child.stderr.on('data', part => { stderr += part; });
    const timer = setTimeout(() => { child.kill(); reject(Error('CLI subprocess exceeded 30 seconds')); }, 30_000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
  });
}

function receipt(result, code) {
  assert.equal(result.signal, null);
  assert.equal(result.code, code, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.trim().split('\n').length, 1);
  return JSON.parse(result.stdout);
}

const requests = async paths => (await readFile(paths.audit, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
const sources = [{
  id: '-9007199254740993', title: '合成摘要来源', author: '原作者甲（fixture）',
  url: 'https://www.zhihu.com/question/123/answer/456', retrieved_at: '2026-09-15T00:00:00.000Z',
  content_type: 'summary', excerpt: '合成摘要；并非真实知乎内容。',
}, {
  id: 'fixture-original-article', title: '合成全文来源', author: '原作者乙（fixture）',
  url: 'https://zhuanlan.zhihu.com/p/789', retrieved_at: '2026-09-15T00:00:00.000Z',
  content_type: 'full_text', excerpt: '操作者选择的合成短摘录；不复制全文。',
}];

test('CLI local sources -> method draft -> existing check-draft preserves attribution without approval or upload', async t => {
  const paths = await workspace(t);
  const source = join(paths.dir, 'sources.json'), method = join(paths.dir, 'method.md'), output = join(paths.dir, 'draft.json');
  const body = '---\ntitle: 合成方法草稿\napplicability: 仅限隔离测试\n---\n# 检查\n已检查合成文本的格式；没有执行真实排障或模型推理。\n原作者甲与乙的署名仍属于来源作者。';
  await writeJson(source, { sources });
  await writeFile(method, body);
  const drafted = receipt(await run(paths, ['draft-zhihu-experience', source, method, output, 'i-method-draft-1']), 0);
  assert.deepEqual(drafted, { draft_saved: true, action: 'publish_experience', sources: 2,
    redactions: 0, review_required: true, uploaded: false });
  const draft = await json(output);
  assert.deepEqual(Object.keys(draft).sort(), ['action', 'payload']);
  assert.deepEqual(CreateContentApprovalSchema.shape.content.parse(draft), draft);
  assert.deepEqual(draft.payload.sources, sources.map(source => ({ ...source, kind: 'zhihu' })));
  assert.equal(draft.payload.body, body);
  assert.equal(draft.payload.visibility, 'public');
  assert.equal(draft.payload.idempotency_key, 'i-method-draft-1');
  for (const field of ['approval_id', 'owner', 'speaker', 'record_id']) assert.equal(field in draft.payload, false);
  assert.deepEqual(receipt(await run(paths, ['check-draft', output]), 0), {
    action: 'publish_experience', valid: true, review_required: true, uploaded: false,
  });
  const repeated = await run(paths, ['draft-zhihu-experience', source, method, output, 'i-method-draft-2']);
  assert.equal(repeated.code, 1);
  assert.equal(JSON.parse(repeated.stderr).code, 'invalid_request');
  assert.deepEqual(await json(output), draft);
  assert.deepEqual(await requests(paths), []);
  assert.deepEqual((await readdir(paths.dir)).sort(), ['draft.json', 'http.json', 'method.md', 'requests.jsonl', 'sources.json']);
});

test('CLI rejects a falsely preapproved draft and creates no published record', async t => {
  const paths = await workspace(t);
  const file = join(paths.dir, 'unreviewed.json');
  await writeJson(file, { action: 'publish_experience', payload: {
    title: 'Fixture', body: 'Not approved', applicability: '', tags: [], sources: [],
    visibility: 'public', idempotency_key: 'i-unreviewed-1', approval_id: 'invented-approval',
  } });
  const result = await run(paths, ['check-draft', file]);
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).ok, false);
  assert.deepEqual(await requests(paths), []);
  assert.deepEqual((await readdir(paths.dir)).sort(), ['http.json', 'requests.jsonl', 'unreviewed.json']);
});

test('CLI fixture failures and explicit resume retain spent budget and return nonzero truthful receipts', async t => {
  const paths = await workspace(t);
  const plan = { batch_id: 'i-failure-resume', queries: ['合成查询'], max_requests: 2 };
  await writeJson(paths.plan, plan);
  const args = ['collect-zhihu-corpus', paths.plan, paths.state];
  const first = receipt(await run(paths, args, [{ status: 503 }]), 1);
  assert.equal(first.status, 'stopped');
  assert.equal(first.stop_reason, 'upstream_failed');
  assert.deepEqual(first.requests, { limit: 2, reserved: 1, settled: 1, failed: 1, remaining: 1 });
  const blocked = receipt(await run(paths, args), 1);
  assert.equal(blocked.stop_reason, 'previous_failure');
  assert.deepEqual(blocked.requests, first.requests);
  assert.equal((await requests(paths)).length, 1, 'No implicit retry');
  await writeJson(paths.plan, { ...plan, max_requests: 5000, retry_unresolved: true });
  const retried = receipt(await run(paths, args, [{ status: 503 }]), 1);
  assert.equal(retried.stop_reason, 'upstream_failed');
  assert.deepEqual(retried.requests, { limit: 2, reserved: 2, settled: 2, failed: 2, remaining: 0 });
  const exhausted = receipt(await run(paths, args), 1);
  assert.equal(exhausted.status, 'budget_exhausted');
  assert.equal(exhausted.stop_reason, 'budget_exhausted');
  assert.deepEqual(exhausted.requests, retried.requests);
  assert.equal(exhausted.records.total, 0);
  assert.deepEqual(await requests(paths), Array(2).fill({ pathname: '/api/v1/content/zhihu_search', method: 'GET', count: '10' }));
  const state = await json(join(paths.state, 'state.json'));
  assert.equal(state.limit, 2);
  assert.equal(state.reserved, 2);
  assert.equal(state.failed, 2);
  assert.deepEqual(await readdir(join(paths.state, 'pages')), []);
  await assert.rejects(readFile(join(paths.state, 'state.lock')), { code: 'ENOENT' });
});

test('CLI completed resume keeps canonical duplicate counts without another request', async t => {
  const paths = await workspace(t);
  await writeJson(paths.plan, { batch_id: 'i-completed-resume', queries: ['fixture'], max_requests: 1 });
  const item = { Title: '合成来源', AuthorName: 'Fixture author', ContentID: 'opaque-original',
    ContentType: 'Article', ContentText: '合成摘要。', Url: 'https://zhuanlan.zhihu.com/p/789?utm_source=fixture' };
  const args = ['collect-zhihu-corpus', paths.plan, paths.state];
  const first = receipt(await run(paths, args, [{ status: 200, body: { Code: 0, Data: {
    Items: [item, { ...item, ContentID: 'opaque-alias', Url: 'https://zhuanlan.zhihu.com/p/789#fixture' }],
    SearchHashId: 'fixture', HasMore: false,
  } } }]), 0);
  assert.equal(first.status, 'completed');
  assert.deepEqual(first.records, { total: 1, duplicates: 1 });
  const second = receipt(await run(paths, args), 0);
  assert.equal(second.status, 'completed');
  assert.deepEqual(second.records, first.records);
  assert.deepEqual(second.requests, first.requests);
  assert.equal((await requests(paths)).length, 1);
  const lines = (await readFile(join(paths.state, 'records.jsonl'), 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]);
  assert.equal(record.id, item.ContentID);
  assert.equal(record.author, item.AuthorName);
  assert.equal(record.url, item.Url);
  assert.equal(record.content_type, 'summary');
});
