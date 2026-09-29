import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectZhihuCorpus } from '../../examples/agent/zhihu-corpus.ts';

// Isolated HTTP fixtures and temp directories only: no official service, credential or database.
const repository = fileURLToPath(new URL('../../', import.meta.url));
const signal = new AbortController().signal;
const question = 'https://www.zhihu.com/question/123';
const searchItem = {
  Title: 'Fixture search title', AuthorName: 'Fixture search author', ContentID: 'search-1',
  ContentType: 'Article', ContentText: 'Fixture search summary, not real Zhihu content.',
  Url: 'https://zhuanlan.zhihu.com/p/1?utm_source=fixture',
};
const answerA = { ContentType: 'answer', ContentToken: 'answer-a', Url: `${question}/answer/a`, Summary: 'Fixture answer summary A.' };
const answerB = { ...answerA, ContentToken: 'answer-b', Url: `${question}/answer/b`, Summary: 'Fixture answer summary B.' };
const searchEnvelope = (Items = [searchItem]) => ({ Code: 0, Data: { Items, SearchHashId: 'fixture-hash', HasMore: false } });
const answersEnvelope = (Items = [answerA], Paging = { IsEnd: true }) => ({ Code: 0, Data: { Items, Paging } });
const now = () => Date.parse('2026-09-15T00:00:00.000Z');

async function workspace(plan) {
  const dir = await mkdtemp(join(tmpdir(), 'gongzhi-zhihu-corpus-'));
  const planPath = join(dir, 'plan.json');
  const stateDir = join(dir, 'state');
  await writeFile(planPath, JSON.stringify(plan));
  return { dir, planPath, stateDir };
}

const collect = (paths, fetch, extra = {}) => collectZhihuCorpus({
  planPath: paths.planPath, stateDir: paths.stateDir, accessSecret: 'fixture-secret',
  signal, fetch, now, minIntervalMs: 0, ...extra,
});

async function records(paths) {
  try {
    const text = await readFile(join(paths.stateDir, 'records.jsonl'), 'utf8');
    return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

/** Real subprocess entrypoint; every fixture below completes without any HTTP call. */
function runCli(args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', join(repository, 'examples', 'agent', 'cli.ts'), ...args], {
      cwd: repository, env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('CLI fixture timed out')); }, 60_000);
    child.on('error', reject);
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

const stateFor = (overrides) => JSON.stringify({
  version: 1, limit: 5000, reserved: 0, settled: 0, failed: 0,
  status: 'running', stop_reason: null, queries: [], questions: [],
  inflight: null, records: 0, duplicates: 0, updated_at: '2026-09-15T00:00:00.000Z',
  ...overrides,
});

test('missing secret or malformed plan makes no request and leaves no state behind', async () => {
  const paths = await workspace({ batch_id: 'fixture-1', queries: ['fixture query'] });
  let calls = 0;
  const fetch = async () => { calls++; throw Error('must not fetch'); };
  try {
    await assert.rejects(collect(paths, fetch, { accessSecret: '  ' }), e => e.error.code === 'unavailable');
    await assert.rejects(readFile(join(paths.stateDir, 'state.json')));
    for (const plan of [
      { batch_id: 'fixture-1' },
      { batch_id: 'fixture-1', queries: ['ok'], max_requests: 5001 },
      { batch_id: 'fixture-1', queries: ['ok'], retry_unresolved: 'yes' },
      { batch_id: 'fixture-1', queries: ['ok'], extra: true },
      { batch_id: 'fixture-1', questions: ['https://www.zhihu.com/answer/1'] },
      { batch_id: '', queries: ['ok'] },
    ]) {
      await writeFile(paths.planPath, JSON.stringify(plan));
      await assert.rejects(collect(paths, fetch), e => e.error.code === 'invalid_request');
    }
    assert.equal(calls, 0);
    await assert.rejects(readFile(join(paths.stateDir, 'state.json')));
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('serial batch dedupes queries, follows only official cursors and keeps results outside Git', async () => {
  const paths = await workspace({ batch_id: 'fixture-2', queries: ['fixture query', 'fixture query'], questions: [question] });
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url: url.href, authorization: init.headers.Authorization });
    if (url.pathname.endsWith('/zhihu_search')) return Response.json(searchEnvelope());
    const offset = url.searchParams.get('Offset');
    if (offset === '0') return new Response(`{"Code":0,"Data":{"Items":[${JSON.stringify(answerA)}],"Paging":{"IsEnd":false,"NextOffset":9007199254740993,"Totals":3}}}`);
    if (offset === '9007199254740993') return Response.json(answersEnvelope([answerA, answerB], { IsEnd: true }));
    throw Error(`unexpected offset ${offset}`);
  };
  try {
    const receipt = await collect(paths, fetch);
    assert.equal(receipt.status, 'completed');
    assert.equal(receipt.stop_reason, null);
    assert.deepEqual(receipt.requests, { limit: 5000, reserved: 3, settled: 3, failed: 0, remaining: 4997 });
    assert.deepEqual(receipt.records, { total: 3, duplicates: 1 });
    assert.deepEqual(receipt.queries, { done: 1, pending: 0, failed: 0 });
    assert.deepEqual(receipt.questions, { done: 1, pending: 0, failed: 0, incomplete: 0, truncated: 0 });
    assert.equal(requests.length, 3);
    assert.equal(requests.filter(request => request.url.includes('/zhihu_search')).length, 1);
    assert.equal(new URL(requests[0].url).searchParams.get('Count'), '10');
    assert.equal(new URL(requests[1].url).searchParams.get('Offset'), '0');
    assert.equal(new URL(requests[2].url).searchParams.get('Offset'), '9007199254740993');
    assert.ok(requests.every(request => request.authorization === 'Bearer fixture-secret'));
    const lines = await records(paths);
    assert.deepEqual(lines.map(record => record.id), ['search-1', 'answer-a', 'answer-b']);
    assert.equal(lines[0].retrieved_at, '2026-09-15T00:00:00.000Z');
    assert.equal(lines[0].content_type, 'summary');
    assert.equal(lines[0].author, 'Fixture search author');
    assert.equal(lines[1].excerpt, 'Fixture answer summary A.');
    assert.equal(lines[1].provenance.offset, '0');
    assert.ok(lines.every(record => record.excerpt.length <= 1000));
    const state = JSON.parse(await readFile(join(paths.stateDir, 'state.json'), 'utf8'));
    assert.equal(state.status, 'completed');
    assert.equal(state.limit, 5000);
    const pages = await readdir(join(paths.stateDir, 'pages'));
    assert.equal(pages.length, 3);
    assert.ok(pages.every(name => /^\d{5}-(zhihu_search|question_answers)\.json$/.test(name)));
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('failures count against the budget, stop the batch, and only an explicit resume retries them', async () => {
  const paths = await workspace({ batch_id: 'fixture-3', queries: ['first', 'second'], max_requests: 3 });
  let firstCalls = 0;
  try {
    const first = await collect(paths, async () => { firstCalls++; return new Response('', { status: 503 }); });
    assert.equal(firstCalls, 1);
    assert.equal(first.status, 'stopped');
    assert.equal(first.stop_reason, 'upstream_failed');
    assert.deepEqual(first.requests, { limit: 3, reserved: 1, settled: 1, failed: 1, remaining: 2 });
    assert.deepEqual(first.queries, { done: 0, pending: 1, failed: 1 });
    let idleCalls = 0;
    const blocked = await collect(paths, async () => { idleCalls++; throw Error('must not fetch'); });
    assert.equal(idleCalls, 0);
    assert.equal(blocked.status, 'stopped');
    assert.equal(blocked.stop_reason, 'previous_failure');
    assert.deepEqual(blocked.requests, { limit: 3, reserved: 1, settled: 1, failed: 1, remaining: 2 });
    await writeFile(paths.planPath, JSON.stringify({ batch_id: 'fixture-3', queries: ['first', 'second'], max_requests: 5000, retry_unresolved: true }));
    let resumedCalls = 0;
    const resumed = await collect(paths, async () => {
      resumedCalls++;
      return Response.json(searchEnvelope([{ ...searchItem, ContentID: `resumed-${resumedCalls}`, Url: `https://zhuanlan.zhihu.com/p/resumed-${resumedCalls}` }]));
    });
    assert.equal(resumedCalls, 2);
    assert.equal(resumed.requests.limit, 3);
    assert.equal(resumed.requests.reserved, 3);
    assert.equal(resumed.status, 'completed');
    assert.deepEqual((await records(paths)).map(record => record.id), ['resumed-1', 'resumed-2']);
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('budget exhaustion stops before the next request and cannot be reset by a larger plan', async () => {
  const paths = await workspace({ batch_id: 'fixture-4', queries: ['one', 'two'], max_requests: 1 });
  let calls = 0;
  try {
    const first = await collect(paths, async () => { calls++; return Response.json(searchEnvelope()); });
    assert.equal(calls, 1);
    assert.equal(first.status, 'budget_exhausted');
    assert.deepEqual(first.requests, { limit: 1, reserved: 1, settled: 1, failed: 0, remaining: 0 });
    await writeFile(paths.planPath, JSON.stringify({ batch_id: 'fixture-4', queries: ['one', 'two'], max_requests: 5000 }));
    const second = await collect(paths, async () => { calls++; throw Error('must not fetch'); });
    assert.equal(calls, 1);
    assert.equal(second.status, 'budget_exhausted');
    assert.equal(second.requests.limit, 1);
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

for (const [status, code] of [[429, 'rate_limited'], [401, 'unauthorized']]) {
  test(`HTTP ${status} stops the batch immediately with no automatic retry`, async () => {
    const paths = await workspace({ batch_id: `fixture-${status}`, queries: ['one', 'two'] });
    let calls = 0;
    try {
      const receipt = await collect(paths, async () => {
        calls++;
        return new Response('', { status, ...(status === 429 ? { headers: { 'retry-after': '60' } } : {}) });
      });
      assert.equal(calls, 1);
      assert.equal(receipt.status, 'stopped');
      assert.equal(receipt.stop_reason, code);
      assert.equal(receipt.requests.failed, 1);
      assert.equal(receipt.queries.pending, 1);
      const state = JSON.parse(await readFile(join(paths.stateDir, 'state.json'), 'utf8'));
      assert.equal(state.queries[0].error, code);
      assert.equal(state.queries[1].state, 'pending');
    } finally { await rm(paths.dir, { recursive: true, force: true }); }
  });
}

test('a malformed official page is a failure, never an empty result', async () => {
  const paths = await workspace({ batch_id: 'fixture-malformed', queries: ['bad'] });
  try {
    const receipt = await collect(paths, async () => Response.json({ Code: 0, Data: { Items: 'not-an-array', SearchHashId: 'fixture', HasMore: false } }));
    assert.equal(receipt.status, 'stopped');
    assert.equal(receipt.stop_reason, 'invalid_response');
    assert.deepEqual(receipt.records, { total: 0, duplicates: 0 });
    assert.deepEqual(await records(paths), []);
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('an official empty page is recorded as a real successful result', async () => {
  const paths = await workspace({ batch_id: 'fixture-empty', queries: ['nothing'] });
  try {
    const receipt = await collect(paths, async () => Response.json({ Code: 0, Data: { Items: [], SearchHashId: 'fixture', HasMore: false } }));
    assert.equal(receipt.status, 'completed');
    assert.deepEqual(receipt.records, { total: 0, duplicates: 0 });
    assert.equal(receipt.queries.done, 1);
    const page = JSON.parse(await readFile(join(paths.stateDir, 'pages', '00001-zhihu_search.json'), 'utf8'));
    assert.deepEqual(page.response.data.Items, []);
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('a non-final page without an official cursor is retained, marked incomplete and never guessed', async () => {
  const paths = await workspace({ batch_id: 'fixture-cursor', questions: [question] });
  let calls = 0;
  try {
    const receipt = await collect(paths, async () => { calls++; return Response.json(answersEnvelope([answerA], { IsEnd: false })); });
    assert.equal(calls, 1);
    assert.equal(receipt.status, 'stopped');
    assert.equal(receipt.stop_reason, 'pagination_incomplete');
    assert.deepEqual(receipt.questions, { done: 0, pending: 0, failed: 0, incomplete: 1, truncated: 0 });
    assert.equal((await records(paths)).length, 1);
    const rerun = await collect(paths, async () => { calls++; throw Error('must not fetch'); });
    assert.equal(calls, 1);
    assert.equal(rerun.status, 'stopped');
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('the per-question page cap stops pagination without inventing a cursor', async () => {
  const paths = await workspace({ batch_id: 'fixture-cap', questions: [question], max_pages_per_question: 1 });
  let calls = 0;
  try {
    const receipt = await collect(paths, async () => { calls++; return Response.json(answersEnvelope([answerA], { IsEnd: false, NextOffset: 5 })); });
    assert.equal(calls, 1);
    assert.equal(receipt.questions.truncated, 1);
    assert.equal(receipt.status, 'completed');
    const state = JSON.parse(await readFile(join(paths.stateDir, 'state.json'), 'utf8'));
    assert.equal(state.questions[0].state, 'done');
    assert.equal(state.questions[0].offset, '5');
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('cancellation preserves fetched records and the durable reservation for an explicit resume', async () => {
  const paths = await workspace({ batch_id: 'fixture-cancel', queries: ['one', 'two'] });
  const controller = new AbortController();
  let calls = 0;
  try {
    const first = await collect(paths, async () => {
      calls++;
      controller.abort();
      throw Error('aborted transport');
    }, { signal: controller.signal });
    assert.equal(calls, 1);
    assert.equal(first.status, 'stopped');
    assert.equal(first.stop_reason, 'cancelled');
    assert.equal(first.requests.reserved, 1);
    assert.deepEqual(await records(paths), []);
    await writeFile(paths.planPath, JSON.stringify({ batch_id: 'fixture-cancel', queries: ['one', 'two'], retry_unresolved: true }));
    let resumedCalls = 0;
    const resumed = await collect(paths, async () => {
      resumedCalls++;
      return Response.json(searchEnvelope([{ ...searchItem, ContentID: `after-cancel-${resumedCalls}`, Url: `https://zhuanlan.zhihu.com/p/after-cancel-${resumedCalls}` }]));
    });
    assert.equal(resumed.status, 'completed');
    assert.equal(resumed.requests.reserved, 3);
    assert.deepEqual((await records(paths)).map(record => record.id), ['after-cancel-1', 'after-cancel-2']);
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('a page already written before the crash is replayed without a second request', async () => {
  const paths = await workspace({ batch_id: 'fixture-replay', queries: ['fixture query'] });
  let calls = 0;
  try {
    await mkdir(join(paths.stateDir, 'pages'), { recursive: true });
    await writeFile(join(paths.stateDir, 'state.json'), JSON.stringify({
      version: 1, batch_id: 'fixture-replay', limit: 5000, reserved: 1, settled: 0, failed: 0,
      status: 'running', stop_reason: null,
      queries: [{ query: 'fixture query', state: 'pending', error: null, retrieved_at: null }],
      questions: [], inflight: { kind: 'query', index: 0, reservation: 1 },
      records: 0, duplicates: 0, updated_at: '2026-09-15T00:00:00.000Z',
    }));
    await writeFile(join(paths.stateDir, 'pages', '00001-zhihu_search.json'), JSON.stringify({
      endpoint: 'zhihu_search', request: { Query: 'fixture query', Count: '5' }, retrieved_at: '2026-09-15T00:00:00.000Z',
      response: { data: searchEnvelope().Data, retrievedAt: '2026-09-15T00:00:00.000Z', cached: false, isSummary: true },
      records: [{
        id: 'search-1', kind: 'zhihu', title: 'Fixture search title', author: 'Fixture search author',
        url: 'https://zhuanlan.zhihu.com/p/1?utm_source=fixture', retrieved_at: '2026-09-15T00:00:00.000Z',
        content_type: 'summary', excerpt: 'Fixture search summary, not real Zhihu content.',
        provenance: { endpoint: 'zhihu_search', query: 'fixture query' },
      }],
    }));
    const receipt = await collect(paths, async () => { calls++; throw Error('must not fetch'); });
    assert.equal(calls, 0);
    assert.equal(receipt.status, 'completed');
    assert.deepEqual(receipt.requests, { limit: 5000, reserved: 1, settled: 1, failed: 0, remaining: 4999 });
    assert.deepEqual(receipt.records, { total: 1, duplicates: 0 });
    assert.deepEqual((await records(paths)).map(record => record.id), ['search-1']);
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('an unresolved in-flight request stops for review and retries only when the operator opts in', async () => {
  const paths = await workspace({ batch_id: 'fixture-unknown', queries: ['fixture query'] });
  let calls = 0;
  try {
    await mkdir(paths.stateDir, { recursive: true });
    await writeFile(join(paths.stateDir, 'state.json'), JSON.stringify({
      version: 1, batch_id: 'fixture-unknown', limit: 5000, reserved: 1, settled: 0, failed: 0,
      status: 'running', stop_reason: null,
      queries: [{ query: 'fixture query', state: 'pending', error: null, retrieved_at: null }],
      questions: [], inflight: { kind: 'query', index: 0, reservation: 1 },
      records: 0, duplicates: 0, updated_at: '2026-09-15T00:00:00.000Z',
    }));
    const blocked = await collect(paths, async () => { calls++; throw Error('must not fetch'); });
    assert.equal(calls, 0);
    assert.equal(blocked.status, 'stopped');
    assert.equal(blocked.stop_reason, 'unknown_inflight');
    await writeFile(paths.planPath, JSON.stringify({ batch_id: 'fixture-unknown', queries: ['fixture query'], retry_unresolved: true }));
    const resumed = await collect(paths, async () => { calls++; return Response.json(searchEnvelope()); });
    assert.equal(calls, 1);
    assert.equal(resumed.status, 'completed');
    assert.equal(resumed.requests.reserved, 2);
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('an active lock is never removed and refuses the second collector without requests', async () => {
  const paths = await workspace({ batch_id: 'fixture-lock', queries: ['one'] });
  const lockPath = join(paths.stateDir, 'state.lock');
  let calls = 0;
  try {
    await mkdir(paths.stateDir, { recursive: true });
    await writeFile(lockPath, JSON.stringify({ pid: process.pid, started_at: 'fixture' }));
    await assert.rejects(collect(paths, async () => { calls++; throw Error('must not fetch'); }), e => e.error.code === 'invalid_request');
    assert.equal(calls, 0);
    assert.match(await readFile(lockPath, 'utf8'), new RegExp(`"pid":${process.pid}`));
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('a stale lock is never auto-removed and blocks concurrent invocations until manual recovery', async () => {
  const paths = await workspace({ batch_id: 'fixture-stale-lock', queries: ['one'] });
  const lockPath = join(paths.stateDir, 'state.lock');
  let calls = 0;
  const fetch = async () => { calls++; throw Error('must not fetch'); };
  try {
    await mkdir(paths.stateDir, { recursive: true });
    await writeFile(lockPath, JSON.stringify({ pid: 999999999, started_at: 'fixture' }));
    const outcomes = await Promise.allSettled([collect(paths, fetch), collect(paths, fetch)]);
    for (const outcome of outcomes) {
      assert.equal(outcome.status, 'rejected');
      assert.equal(outcome.reason.error.code, 'invalid_request');
    }
    assert.equal(calls, 0);
    assert.match(await readFile(lockPath, 'utf8'), /999999999/);
    // Manual recovery after confirming no collector runs: delete the lock, then proceed.
    await rm(lockPath);
    const recovered = await collect(paths, async () => { calls++; return Response.json(searchEnvelope()); });
    assert.equal(recovered.status, 'completed');
    assert.equal(calls, 1);
    // A normal run releases only its own lock.
    await assert.rejects(readFile(lockPath));
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('a duplicate result is counted once and the cumulative count survives completed resumes', async () => {
  const paths = await workspace({ batch_id: 'fixture-dup-resume', queries: ['dup'] });
  let calls = 0;
  try {
    const first = await collect(paths, async () => {
      calls++;
      return Response.json(searchEnvelope([
        { ...searchItem, ContentID: 'dup-a', Url: 'https://zhuanlan.zhihu.com/p/dup' },
        { ...searchItem, ContentID: 'dup-b', Url: 'https://zhuanlan.zhihu.com/p/dup?utm_source=same' },
      ]));
    });
    assert.equal(first.status, 'completed');
    assert.deepEqual(first.records, { total: 1, duplicates: 1 });
    const second = await collect(paths, async () => { calls++; throw Error('must not fetch'); });
    const third = await collect(paths, async () => { calls++; throw Error('must not fetch'); });
    assert.equal(calls, 1);
    assert.equal(second.status, 'completed');
    assert.equal(third.status, 'completed');
    assert.deepEqual(second.records, { total: 1, duplicates: 1 });
    assert.deepEqual(third.records, { total: 1, duplicates: 1 });
    assert.equal(JSON.parse(await readFile(join(paths.stateDir, 'state.json'), 'utf8')).duplicates, 1);
    assert.equal((await records(paths)).length, 1);
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('a state directory under any Git worktree marker is refused so raw text never enters Git', async () => {
  const paths = await workspace({ batch_id: 'fixture-git', queries: ['one'] });
  let calls = 0;
  try {
    await mkdir(paths.stateDir, { recursive: true });
    await writeFile(join(paths.stateDir, '.git'), 'gitdir: fixture');
    await assert.rejects(collect(paths, async () => { calls++; throw Error('must not fetch'); }), e => e.error.code === 'invalid_request');
    assert.equal(calls, 0);
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('a state directory inside this checkout is refused', async () => {
  const paths = await workspace({ batch_id: 'fixture-inside', queries: ['one'] });
  const inside = join(process.cwd(), '.zhihu-corpus-fixture');
  let calls = 0;
  try {
    await assert.rejects(collectZhihuCorpus({
      planPath: paths.planPath, stateDir: inside, accessSecret: 'fixture-secret', signal, now, minIntervalMs: 0,
      fetch: async () => { calls++; throw Error('must not fetch'); },
    }), e => e.error.code === 'invalid_request');
    assert.equal(calls, 0);
    await assert.rejects(readFile(join(inside, 'state.json')));
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('a symlinked state file is refused instead of followed', async (t) => {
  const paths = await workspace({ batch_id: 'fixture-symlink', queries: ['one'] });
  let calls = 0;
  try {
    await mkdir(paths.stateDir, { recursive: true });
    await writeFile(join(paths.dir, 'outside.json'), '{}');
    try { await symlink(join(paths.dir, 'outside.json'), join(paths.stateDir, 'state.json'), 'file'); }
    catch { t.skip('symlink creation not permitted on this host'); return; }
    await assert.rejects(collect(paths, async () => { calls++; throw Error('must not fetch'); }), e => e.error.code === 'invalid_request');
    assert.equal(calls, 0);
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('cross-endpoint content is deduped by canonical URL across tracking variants and resume', async () => {
  const paths = await workspace({ batch_id: 'fixture-url-dedupe', queries: ['cross-endpoint'], questions: [question] });
  const sameContent = { ContentType: 'answer', ContentToken: 'answer-token-999', Url: `${question}/answer/a`, Summary: 'Fixture same content, different endpoint ID.' };
  const otherAnswer = { ContentType: 'answer', ContentToken: 'answer-token-b', Url: `${question}/answer/b`, Summary: 'Fixture distinct answer.' };
  let calls = 0;
  try {
    const first = await collect(paths, async url => {
      calls++;
      if (url.pathname.endsWith('/zhihu_search')) {
        return Response.json(searchEnvelope([{ ...searchItem, ContentID: 'search-777', Url: `${question}/answer/a?utm_source=search&share_code=fixture` }]));
      }
      return new Response('', { status: 503 });
    });
    assert.equal(calls, 2);
    assert.equal(first.status, 'stopped');
    assert.equal(first.stop_reason, 'upstream_failed');
    assert.deepEqual((await records(paths)).map(record => record.id), ['search-777']);
    await writeFile(paths.planPath, JSON.stringify({ batch_id: 'fixture-url-dedupe', queries: ['cross-endpoint'], questions: [question], retry_unresolved: true }));
    const resumed = await collect(paths, async url => {
      calls++;
      assert.ok(url.pathname.endsWith('/question_answers'));
      return Response.json(answersEnvelope([sameContent, otherAnswer], { IsEnd: true }));
    });
    assert.equal(resumed.status, 'completed');
    assert.deepEqual(resumed.records, { total: 2, duplicates: 1 });
    const lines = await records(paths);
    assert.deepEqual(lines.map(record => record.id), ['search-777', 'answer-token-b']);
    assert.equal(lines[0].url, `${question}/answer/a?utm_source=search&share_code=fixture`);
    assert.equal(lines[0].provenance.endpoint, 'zhihu_search');
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('equal opaque IDs on different endpoints without URLs stay distinct while same-endpoint duplicates merge', async () => {
  const paths = await workspace({ batch_id: 'fixture-fallback-key', queries: ['same-id'] });
  const base = { kind: 'zhihu', title: 'Fixture', retrieved_at: '2026-09-15T00:00:00.000Z', content_type: 'summary', excerpt: 'Fixture excerpt.' };
  try {
    await mkdir(paths.stateDir, { recursive: true });
    await writeFile(join(paths.stateDir, 'records.jsonl'), [
      JSON.stringify({ ...base, id: 'same-id', provenance: { endpoint: 'zhihu_search', query: 'earlier' } }),
      JSON.stringify({ ...base, id: 'same-id', provenance: { endpoint: 'question_answers', question_url: question, offset: '0' } }),
    ].join('\n') + '\n');
    await writeFile(join(paths.stateDir, 'state.json'), JSON.stringify({
      version: 1, batch_id: 'fixture-fallback-key', limit: 5000, reserved: 2, settled: 2, failed: 0,
      status: 'stopped', stop_reason: 'upstream_failed',
      queries: [{ query: 'same-id', state: 'failed', error: 'upstream_failed', retrieved_at: null }],
      questions: [], inflight: null, records: 2, duplicates: 0, updated_at: '2026-09-15T00:00:00.000Z',
    }));
    await writeFile(paths.planPath, JSON.stringify({ batch_id: 'fixture-fallback-key', queries: ['same-id'], retry_unresolved: true }));
    const receipt = await collect(paths, async () => Response.json(searchEnvelope([{ ...searchItem, ContentID: 'same-id', Url: undefined }])));
    assert.equal(receipt.status, 'completed');
    assert.equal(receipt.records.total, 2);
    assert.equal(receipt.records.duplicates, 1);
    assert.equal((await records(paths)).length, 2);
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('a torn tail is repaired on a byte boundary and Chinese rows survive repeated resumes', async () => {
  const paths = await workspace({ batch_id: 'fixture-utf8', queries: ['first', 'second'] });
  const kept = {
    id: 'search-cn-1', kind: 'zhihu', title: '中文标题', author: '知乎作者',
    url: 'https://zhuanlan.zhihu.com/p/777', retrieved_at: '2026-09-15T00:00:00.000Z',
    content_type: 'summary', excerpt: '中文摘要 emoji 🚀 保留完整', provenance: { endpoint: 'zhihu_search', query: 'first' },
  };
  const torn = JSON.stringify({ ...kept, id: 'torn-tail', excerpt: '半截行 🧩' }).slice(0, 60);
  let calls = 0;
  try {
    await mkdir(paths.stateDir, { recursive: true });
    await writeFile(join(paths.stateDir, 'records.jsonl'), JSON.stringify(kept) + '\n' + torn);
    await writeFile(join(paths.stateDir, 'state.json'), JSON.stringify({
      version: 1, batch_id: 'fixture-utf8', limit: 5000, reserved: 2, settled: 1, failed: 0,
      status: 'stopped', stop_reason: 'upstream_failed',
      queries: [
        { query: 'first', state: 'done', error: null, retrieved_at: '2026-09-15T00:00:00.000Z' },
        { query: 'second', state: 'failed', error: 'upstream_failed', retrieved_at: null },
      ],
      questions: [], inflight: null, records: 1, duplicates: 0, updated_at: '2026-09-15T00:00:00.000Z',
    }));
    await writeFile(paths.planPath, JSON.stringify({ batch_id: 'fixture-utf8', queries: ['first', 'second'], retry_unresolved: true }));
    const first = await collect(paths, async () => {
      calls++;
      return Response.json(searchEnvelope([{ ...searchItem, ContentID: 'search-cn-2', Url: 'https://zhuanlan.zhihu.com/p/777?utm_source=resume' }]));
    });
    assert.equal(calls, 1);
    assert.equal(first.status, 'completed');
    assert.deepEqual(first.records, { total: 1, duplicates: 1 });
    const lines = (await readFile(join(paths.stateDir, 'records.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(lines.length, 1);
    assert.equal(lines[0].excerpt, '中文摘要 emoji 🚀 保留完整');
    const second = await collect(paths, async () => { calls++; throw Error('must not fetch'); });
    const third = await collect(paths, async () => { calls++; throw Error('must not fetch'); });
    assert.equal(calls, 1);
    assert.equal(second.status, 'completed');
    assert.equal(third.status, 'completed');
    assert.equal((await readFile(join(paths.stateDir, 'records.jsonl'), 'utf8')).trim().split('\n').length, 1);
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('a symlinked parent pointing into another Git worktree is refused after resolution', async (t) => {
  const paths = await workspace({ batch_id: 'fixture-symlink-git', queries: ['one'] });
  const target = join(paths.dir, 'linked-worktree');
  const link = join(paths.dir, 'linked-entry');
  let calls = 0;
  try {
    await mkdir(target, { recursive: true });
    await writeFile(join(target, '.git'), 'gitdir: fixture');
    try { await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch { t.skip('symlink creation not permitted on this host'); return; }
    await assert.rejects(collectZhihuCorpus({
      planPath: paths.planPath, stateDir: join(link, 'state'), accessSecret: 'fixture-secret', signal, now, minIntervalMs: 0,
      fetch: async () => { calls++; throw Error('must not fetch'); },
    }), e => e.error.code === 'invalid_request');
    assert.equal(calls, 0);
    await assert.rejects(readFile(join(target, 'state', 'state.json')));
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('a symlinked replay page is refused instead of followed', async (t) => {
  const paths = await workspace({ batch_id: 'fixture-page-symlink', queries: ['fixture query'] });
  let calls = 0;
  try {
    await mkdir(join(paths.stateDir, 'pages'), { recursive: true });
    await writeFile(join(paths.stateDir, 'state.json'), JSON.stringify({
      version: 1, batch_id: 'fixture-page-symlink', limit: 5000, reserved: 1, settled: 0, failed: 0,
      status: 'running', stop_reason: null,
      queries: [{ query: 'fixture query', state: 'pending', error: null, retrieved_at: null }],
      questions: [], inflight: { kind: 'query', index: 0, reservation: 1 },
      records: 0, duplicates: 0, updated_at: '2026-09-15T00:00:00.000Z',
    }));
    await writeFile(join(paths.dir, 'outside-page.json'), JSON.stringify({ endpoint: 'zhihu_search', request: {}, retrieved_at: '2026-09-15T00:00:00.000Z', response: {}, records: [] }));
    try { await symlink(join(paths.dir, 'outside-page.json'), join(paths.stateDir, 'pages', '00001-zhihu_search.json'), 'file'); }
    catch { t.skip('symlink creation not permitted on this host'); return; }
    await assert.rejects(collect(paths, async () => { calls++; throw Error('must not fetch'); }), e => e.error.code === 'invalid_request');
    assert.equal(calls, 0);
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('a resume with a different plan is refused instead of mixing batches or budgets', async () => {
  const paths = await workspace({ batch_id: 'fixture-mismatch', queries: ['one'] });
  let calls = 0;
  try {
    await collect(paths, async () => { calls++; return Response.json(searchEnvelope()); });
    assert.equal(calls, 1);
    await writeFile(paths.planPath, JSON.stringify({ batch_id: 'fixture-mismatch', queries: ['one', 'extra'] }));
    await assert.rejects(collect(paths, async () => { calls++; throw Error('must not fetch'); }), e => e.error.code === 'invalid_request');
    await writeFile(paths.planPath, JSON.stringify({ batch_id: 'other-batch', queries: ['one'] }));
    await assert.rejects(collect(paths, async () => { calls++; throw Error('must not fetch'); }), e => e.error.code === 'invalid_request');
    assert.equal(calls, 1);
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('the actual CLI entrypoint exits 0 for a completed batch and prints only the receipt', async () => {
  const paths = await workspace({ batch_id: 'fixture-cli-done', queries: ['done'] });
  try {
    await mkdir(paths.stateDir, { recursive: true });
    await writeFile(join(paths.stateDir, 'state.json'), stateFor({
      batch_id: 'fixture-cli-done', reserved: 1, settled: 1, status: 'completed',
      queries: [{ query: 'done', state: 'done', error: null, retrieved_at: '2026-09-15T00:00:00.000Z' }], records: 1,
    }));
    await writeFile(join(paths.stateDir, 'records.jsonl'), JSON.stringify({
      id: 'done-1', kind: 'zhihu', title: 'Fixture', url: 'https://zhuanlan.zhihu.com/p/done',
      retrieved_at: '2026-09-15T00:00:00.000Z', content_type: 'summary', excerpt: 'Fixture.',
      provenance: { endpoint: 'zhihu_search', query: 'done' },
    }) + '\n');
    const result = await runCli(['collect-zhihu-corpus', paths.planPath, paths.stateDir], { ...process.env, ZHIHU_ACCESS_SECRET: 'fixture-secret' });
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.status, 'completed');
    assert.equal(receipt.records.total, 1);
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('the actual CLI entrypoint exits nonzero for a stopped batch while keeping the receipt', async () => {
  const paths = await workspace({ batch_id: 'fixture-cli-stopped', queries: ['one', 'two'], max_requests: 1 });
  try {
    await mkdir(paths.stateDir, { recursive: true });
    await writeFile(join(paths.stateDir, 'state.json'), stateFor({
      batch_id: 'fixture-cli-stopped', limit: 1, reserved: 1, settled: 0, failed: 0,
      queries: [
        { query: 'one', state: 'pending', error: null, retrieved_at: null },
        { query: 'two', state: 'pending', error: null, retrieved_at: null },
      ],
    }));
    const result = await runCli(['collect-zhihu-corpus', paths.planPath, paths.stateDir], { ...process.env, ZHIHU_ACCESS_SECRET: 'fixture-secret' });
    assert.equal(result.code, 1);
    assert.equal(result.stderr, '');
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.status, 'budget_exhausted');
    assert.equal(receipt.requests.reserved, 1);
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});

test('the actual CLI entrypoint fails closed without the project secret and writes nothing', async () => {
  const paths = await workspace({ batch_id: 'fixture-cli-nosecret', queries: ['one'] });
  const env = { ...process.env };
  delete env.ZHIHU_ACCESS_SECRET;
  try {
    const result = await runCli(['collect-zhihu-corpus', paths.planPath, paths.stateDir], env);
    assert.equal(result.code, 1);
    assert.deepEqual(JSON.parse(result.stderr), { ok: false, code: 'unavailable', retryable: false });
    assert.equal(result.stdout, '');
    await assert.rejects(readFile(join(paths.stateDir, 'state.json')));
  } finally { await rm(paths.dir, { recursive: true, force: true }); }
});
