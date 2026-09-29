import test from 'node:test';
import assert from 'node:assert/strict';
import { createZhihuSearch } from '../../lib/gongzhi/zhihu/search.ts';

// Isolated HTTP fixtures only: no official service, credentials or experience database.
const question = 'https://www.zhihu.com/question/123';
const item = { ContentType: 'answer', ContentToken: '9007199254740993', Url: `${question}/answer/9007199254740993?utm_source=fixture`, Summary: 'Provider summary, not full text.' };
const page = (Items = [item], Paging = { IsEnd: true }) => ({ Code: 0, Data: { Items, Paging } });
const signal = () => new AbortController().signal;
const client = (fetch, extra = {}) => createZhihuSearch({ enabled: true, accessSecret: 'fixture-secret', fetch, ...extra });

test('official answers GET, attribution and cached retrieval time; default one page of five', async () => {
  let calls = 0;
  const now = Date.parse('2026-09-14T00:00:00Z');
  const adapter = client(async (url, init) => {
    calls++;
    assert.equal(url.origin + url.pathname, 'https://developer.zhihu.com/api/v1/content/question_answers');
    assert.deepEqual(Object.fromEntries(url.searchParams), { QuestionUrl: question, Offset: '0', Limit: '5' });
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer fixture-secret');
    assert.equal(init.headers['X-Request-Timestamp'], String(now / 1000));
    return Response.json(page());
  }, { now: () => now });
  const first = await adapter.questionAnswers(question, signal());
  assert.deepEqual(first.data, page().Data);
  assert.equal(first.isSummary, true);
  assert.equal(first.retrievedAt, '2026-09-14T00:00:00.000Z');
  first.data.Items[0].Summary = 'mutated by consumer';
  const cached = await adapter.questionAnswers(question, signal());
  assert.equal(cached.data.Items[0].Summary, item.Summary);
  assert.equal(cached.cached, true);
  assert.equal(cached.retrievedAt, first.retrievedAt);
  assert.equal(calls, 1);
  assert.equal('AuthorName' in cached.data.Items[0], false);
  assert.equal('Title' in cached.data.Items[0], false);
  assert.equal('Body' in cached.data.Items[0], false);
});

test('empty IsEnd=false page preserves exact int64 cursor/totals and never auto-fetches', async () => {
  let calls = 0;
  const adapter = client(async () => {
    calls++;
    return new Response('{"Code":0,"Data":{"Items":[],"Paging":{"IsEnd":false,"NextOffset":9007199254740993,"Totals":9223372036854775807}}}');
  });
  const result = await adapter.questionAnswers(question, signal());
  assert.deepEqual(result.data, { Items: [], Paging: { IsEnd: false, NextOffset: '9007199254740993', Totals: '9223372036854775807' } });
  assert.equal(calls, 1);
});

test('official supplied later offset is sent as decimal text, never rounded', async () => {
  const adapter = client(async url => {
    assert.equal(url.searchParams.get('Offset'), '9007199254740993');
    return Response.json(page([], { IsEnd: true }));
  });
  await adapter.questionAnswers(question, signal(), '9007199254740993');
});

for (const paging of [
  '{"IsEnd":false,"NextOffset":0}',
  '{"IsEnd":false,"NextOffset":-1}', '{"IsEnd":false,"NextOffset":1.5}',
  '{"IsEnd":false,"NextOffset":9223372036854775808}',
  '{"IsEnd":false,"NextOffset":"01"}', '{"IsEnd":false,"NextOffset":1e3}',
  '{"IsEnd":true,"Totals":9223372036854775808}', '{"IsEnd":"true"}',
]) {
  test(`malformed/incomplete paging fails and is not cached: ${paging}`, async () => {
    let calls = 0;
    const adapter = client(async () => { calls++; return new Response(`{"Code":0,"Data":{"Items":[],"Paging":${paging}}}`); });
    await assert.rejects(adapter.questionAnswers(question, signal()), { code: 'invalid_response' });
    await assert.rejects(adapter.questionAnswers(question, signal()), { code: 'invalid_response' });
    assert.equal(calls, 2);
  });
}

test('later page cursor must advance and invalid page is not cached', async () => {
  let calls = 0;
  const adapter = client(async () => { calls++; return Response.json(page([], { IsEnd: false, NextOffset: 5 })); });
  for (let attempt = 0; attempt < 2; attempt++) await assert.rejects(adapter.questionAnswers(question, signal(), '5'), { code: 'invalid_response' });
  assert.equal(calls, 2);
});

test('missing next cursor retains real page without claiming the end or inventing an offset', async () => {
  const adapter = client(async () => Response.json(page([item], { IsEnd: false })));
  const result = await adapter.questionAnswers(question, signal());
  assert.deepEqual(result.data.Items, [item]);
  assert.deepEqual(result.data.Paging, { IsEnd: false });
});

test('invalid question URL/offset/limit cannot send a request or select another endpoint', async () => {
  let calls = 0;
  const adapter = client(async () => { calls++; throw Error('unexpected fetch'); });
  for (const url of ['http://www.zhihu.com/question/123', 'https://www.zhihu.com.evil.invalid/question/123', 'https://user:pass@www.zhihu.com/question/123', 'https://@www.zhihu.com/question/123', 'https://www.zhihu.com:8443/question/123', 'https://api.zhihu.com/question/123', 'https://www.zhihu.com/answer/123', 'https://www.zhihu.com/question/123/answer/456', 'https://www.zhihu.com/a/../question/123', 'https://www.zhihu.com/question/%31', 'https://www.zhihu.com/question/0']) {
    await assert.rejects(adapter.questionAnswers(url, signal()), { code: 'invalid_query' });
  }
  for (const offset of ['-1', '9223372036854775808', '1.5', '1e3', '01', 9007199254740992]) await assert.rejects(adapter.questionAnswers(question, signal(), offset), { code: 'invalid_query' });
  for (const limit of [0, 51, 1.5]) await assert.rejects(adapter.questionAnswers(question, signal(), '0', limit), { code: 'invalid_query' });
  assert.equal(calls, 0);
});

test('answers missing configuration is unavailable with no transport, even after another configured client', async () => {
  let calls = 0;
  const fetch = async () => { calls++; return Response.json(page()); };
  await client(fetch).questionAnswers(question, signal());
  await assert.rejects(client(fetch, { accessSecret: '' }).questionAnswers(question, signal()), { code: 'unavailable' });
  assert.equal(calls, 1);
});

for (const [status, body, expected] of [
  [401, {}, 'unauthorized'], [403, {}, 'unauthorized'], [429, {}, 'rate_limited'], [503, {}, 'upstream_failed'],
  [200, { Code: 10001 }, 'invalid_query'], [200, { Code: 20001 }, 'unauthorized'],
  [200, { Code: 30001, Message: 'daily quota exhausted (fixture)' }, 'rate_limited'],
  [200, { Code: 30002 }, 'upstream_failed'], [200, { Code: 30003 }, 'upstream_failed'], [200, { Code: 90001 }, 'upstream_failed'],
]) {
  test(`answers HTTP ${status}/Code ${body.Code} stops without retries or fabricated empty page`, async () => {
    let calls = 0;
    const adapter = client(async () => { calls++; return Response.json(body, { status }); });
    await assert.rejects(adapter.questionAnswers(question, signal()), error => error.code === expected && !error.message.includes('fixture'));
    assert.equal(calls, 1);
  });
}

test('missing source fields and untrusted links fail; IDs never manufacture URLs', async () => {
  for (const invalid of [{ ...item, Url: '' }, { ...item, Url: 'https://outside.invalid/answer/123' }, { ...item, Url: 'https://user:pass@www.zhihu.com/answer/123' }, { ...item, Summary: undefined }, { ...item, ContentToken: 9007199254740992 }]) {
    await assert.rejects(client(async () => Response.json(page([invalid]))).questionAnswers(question, signal()), { code: 'invalid_response' });
  }
});

test('same signal/page coalesces concurrent requests', async () => {
  let calls = 0;
  const adapter = client(async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return Response.json(page()); });
  const sameSignal = signal();
  await Promise.all([adapter.questionAnswers(question, sameSignal), adapter.questionAnswers(question, sameSignal)]);
  assert.equal(calls, 1);
});

test('cancelled and timed out answer requests abort transport; cancelled responses cannot cache', async () => {
  const controller = new AbortController();
  let calls = 0;
  const adapter = client(async (_url, init) => {
    calls++;
    if (calls === 1) { controller.abort(); assert.equal(init.signal.aborted, true); }
    return Response.json(page());
  });
  await assert.rejects(adapter.questionAnswers(question, controller.signal), { code: 'cancelled' });
  await adapter.questionAnswers(question, signal());
  assert.equal(calls, 2);
  const keepAlive = setTimeout(() => {}, 200);
  try {
    const slow = client((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })), { timeoutMs: 5 });
    await assert.rejects(slow.questionAnswers(question, signal()), { code: 'timed_out' });
  } finally { clearTimeout(keepAlive); }
});
