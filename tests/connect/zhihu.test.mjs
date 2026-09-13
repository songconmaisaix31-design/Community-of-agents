import test from 'node:test';
import assert from 'node:assert/strict';
import { createZhihuSearch, ZHIHU_SEARCH_URL } from '../../lib/gongzhi/zhihu/search.ts';

const item = { Title: 'Synthetic title', AuthorName: 'Synthetic author', ContentID: 'test-42', ContentType: 'Article', ContentText: 'Synthetic summary', Url: 'https://zhuanlan.zhihu.com/p/42?utm_source=test' };
const envelope = (items = [item]) => ({ Code: 0, Data: { Items: items, SearchHashId: 'synthetic-search', HasMore: false } });
const signal = () => new AbortController().signal;
const adapter = (request, more = {}) => createZhihuSearch({ accessSecret: 'synthetic-secret', enabled: true, fetch: request, ...more });

test('missing configuration is unavailable and makes no request', async () => {
  let calls = 0;
  const search = createZhihuSearch({ enabled: true, fetch: async () => { calls++; throw Error(); } });
  await assert.rejects(search.search('test', signal()), { code: 'unavailable' });
  assert.equal(calls, 0);
});

test('official query, headers, actual fields and retrieval time are preserved on cache hit', async () => {
  let calls = 0;
  let timestamp = 1_700_000_000_000;
  const search = adapter(async (url, init) => {
    calls++;
    assert.equal(url.origin + url.pathname, ZHIHU_SEARCH_URL);
    assert.equal(url.searchParams.get('Query'), 'test question');
    assert.equal(url.searchParams.get('Count'), '5');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-secret');
    assert.equal(init.headers['X-Request-Timestamp'], '1700000000');
    assert.equal(init.redirect, 'error');
    return Response.json(envelope());
  }, { now: () => timestamp });
  const first = await search.search(' test question ', signal());
  timestamp += 1000;
  const second = await search.search('test question', signal());
  assert.equal(calls, 1);
  assert.equal(second.cached, true);
  assert.equal(first.retrievedAt, second.retrievedAt);
  assert.deepEqual(first.data.Items[0], item);
  first.data.Items[0].Title = 'changed';
  assert.equal(second.data.Items[0].Title, 'Synthetic title');
  assert.equal(second.isSummary, true);
});

test('empty results are successful and cacheable; no source is invented', async () => {
  const search = adapter(async () => Response.json(envelope([])));
  const response = await search.search('nothing', signal());
  assert.deepEqual(response.data.Items, []);
  assert.equal((await search.search('nothing', signal())).cached, true);
});

test('missing or unsafe URLs are not generated from content IDs', async () => {
  const search = adapter(async () => Response.json(envelope([{ ...item, Url: '' }, { ...item, Url: 'javascript:alert(1)' }])));
  const response = await search.search('test', signal());
  for (const source of response.data.Items) {
    assert.equal(source.Url, undefined);
    assert.equal(source.ContentID, 'test-42');
  }
});

for (const [code, expected] of [[10001, 'invalid_query'], [20001, 'unauthorized'], [30001, 'rate_limited'], [90001, 'upstream_failed']]) {
  test(`official Code ${code} maps to ${expected}, never empty or cached`, async () => {
    let calls = 0;
    const search = adapter(async () => { calls++; return Response.json({ Code: code, Message: 'PRIVATE UPSTREAM DETAIL' }); });
    for (let i = 0; i < 2; i++) await assert.rejects(search.search('test', signal()), error => error.code === expected && !error.message.includes('PRIVATE'));
    assert.equal(calls, 2);
  });
}

test('HTTP rate limiting preserves retry-after without retrying', async () => {
  let calls = 0;
  const search = adapter(async () => { calls++; return new Response('', { status: 429, headers: { 'retry-after': '60' } }); });
  await assert.rejects(search.search('test', signal()), { code: 'rate_limited', retryAfter: '60' });
  assert.equal(calls, 1);
});

test('malformed successes fail instead of fabricating fields', async () => {
  const search = adapter(async () => Response.json(envelope([{ Title: 'only a title' }])));
  await assert.rejects(search.search('test', signal()), { code: 'invalid_response' });
});

test('same-run concurrent requests are deduplicated', async () => {
  let calls = 0;
  const search = adapter(async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return Response.json(envelope()); });
  const shared = signal();
  await Promise.all([search.search('test', shared), search.search('test', shared)]);
  assert.equal(calls, 1);
});

test('request cancellation reaches transport and never caches a success', async () => {
  const controller = new AbortController();
  const search = adapter(async (_url, init) => {
    controller.abort();
    assert.equal(init.signal.aborted, true);
    return Response.json(envelope());
  });
  await assert.rejects(search.search('test', controller.signal), { code: 'cancelled' });
});

test('deadline aborts transport and reports timed_out', async () => {
  const search = adapter(async (_url, init) => {
    // A real fetch holds an active I/O handle; keep the synthetic transport alive too.
    await new Promise((resolve, reject) => {
      const keepAlive = setTimeout(resolve, 100);
      init.signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(init.signal.reason); }, { once: true });
    });
    return Response.json(envelope());
  }, { timeoutMs: 5 });
  await assert.rejects(search.search('test', signal()), { code: 'timed_out' });
});
