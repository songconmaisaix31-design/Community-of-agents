import { expect } from '@playwright/test';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { defineOAuthBrowserFlows } from '../frontend/evomap-oauth-flows';
const base = 'http://127.0.0.1:3091';
const evidence = path.join(tmpdir(), 'gongzhi-oauth-pg-screenshots-' + Date.now());
defineOAuthBrowserFlows({ base, evidence, async login(page, account) {
  await page.goto(base + '/zh/connect');
  // Real browser start response establishes its HttpOnly state cookie. The official
  // authorization page is not visited: this suite supplies an explicit upstream fixture.
  const flow = await page.evaluate(async () => {
    const response = await fetch('/api/gongzhi/auth/zhihu/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const body = await response.json();
    return { status: response.status, authorization: body.data?.authorization_url };
  });
  expect(flow.status).toBe(200);
  const authorization = new URL(flow.authorization);
  expect(authorization.origin).toBe('https://openapi.zhihu.com');
  expect(authorization.pathname).toBe('/authorize');
  const callback = base + '/auth/zhihu/callback?authorization_code=fixture-' + account + '&state=' + encodeURIComponent(authorization.searchParams.get('state')!);
  const returned = page.waitForResponse(r => new URL(r.url()).pathname === '/auth/zhihu/callback');
  const final = await page.goto(callback);
  expect((await returned).status()).toBe(303);
  expect(final?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe('/zh');
  expect(new URL(page.url()).searchParams.has('authorization_code')).toBe(false);
  const session = await page.evaluate(async () => (await (await fetch('/api/gongzhi/auth/session')).json()).data);
  expect(session.user?.provider).toBe('zhihu');
  expect(session.user?.name).toBe('OAuth协议测试' + account);
} });
console.log('OAuth upstream fixture + real PG browser screenshots:', evidence);
