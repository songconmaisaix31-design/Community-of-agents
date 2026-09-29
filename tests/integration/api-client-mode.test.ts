import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiClientError, createApiClient } from '../../lib/gongzhi/api-client.ts';
import { CreateNeedSchema } from '../../lib/gongzhi/contracts.ts';

test('demo writes omit live credentials and stay on the demo HTTP prefix', async () => {
  let requests = 0;
  const client = createApiClient('demo', {
    accessToken: () => { throw new Error('Demo must never read live identity'); },
    fetch: async (url, init) => {
      requests++;
      assert.equal(url, '/demo/api/needs');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.credentials, 'omit');
      assert.equal(new Headers(init?.headers).has('Authorization'), false);
      return Response.json({ ok: true, mode: 'demo', data: { id: 'demo-need' } });
    },
  });
  const input = CreateNeedSchema.parse({ title: '示例需求', body: '仅用于客户端隔离测试', idempotency_key: 'integration-demo' });
  assert.equal((await client.createNeed(input)).id, 'demo-need');
  assert.equal(requests, 1);
});

for (const [requestedMode, responseMode] of [['live', 'demo'], ['demo', 'live']] as const) {
  test(`${requestedMode} rejects a successful ${responseMode} response without retrying`, async () => {
    let requests = 0;
    const client = createApiClient(requestedMode, {
      fetch: async () => {
        requests++;
        return Response.json({ ok: true, mode: responseMode, data: { needs: [] } });
      },
    });
    await assert.rejects(client.getNetwork(), (error: unknown) =>
      error instanceof ApiClientError && error.error.code === 'mode_mismatch' && !error.error.retryable);
    assert.equal(requests, 1);
  });
}

test('a live transport failure never retries against demo or returns a fixture', async () => {
  const urls: string[] = [];
  const client = createApiClient('live', {
    fetch: async (url) => {
      urls.push(String(url));
      throw new TypeError('Simulated disconnected transport');
    },
  });
  await assert.rejects(client.getNetwork(), (error: unknown) =>
    error instanceof ApiClientError && error.error.code === 'unavailable');
  assert.deepEqual(urls, ['/api/gongzhi/network']);
});

test('a live service error retains its status without a demo retry', async () => {
  let requests = 0;
  const client = createApiClient('live', {
    fetch: async () => {
      requests++;
      return Response.json({ ok: false, mode: 'live', error: { code: 'unavailable', message: 'No authorized database', retryable: true } }, { status: 503 });
    },
  });
  await assert.rejects(client.getNetwork(), (error: unknown) =>
    error instanceof ApiClientError && error.status === 503 && error.error.code === 'unavailable');
  assert.equal(requests, 1);
});
