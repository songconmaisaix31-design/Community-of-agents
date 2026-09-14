// Test-only preload for the actual CLI subprocess. Never delegates to native fetch.
// Only synthetic response files made by zhihu-method-cli.test.mjs are consumed.
import assert from 'node:assert/strict';
import { appendFile, readFile } from 'node:fs/promises';

const responses = JSON.parse(await readFile(process.env.GONGZHI_I_HTTP_FIXTURE, 'utf8'));
let index = 0;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  await appendFile(process.env.GONGZHI_I_HTTP_AUDIT, JSON.stringify({
    pathname: url.pathname, method: init?.method, count: url.searchParams.get('Count'),
  }) + '\n');
  assert.equal(url.origin, 'https://developer.zhihu.com');
  assert.equal(url.pathname, '/api/v1/content/zhihu_search');
  assert.equal(init?.method, 'GET');
  const response = responses[index++];
  assert.ok(response, 'Unexpected fetch: no fixture response remains');
  return new Response(JSON.stringify(response.body ?? {}), { status: response.status });
};
