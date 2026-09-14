import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

let server: Server | undefined;
let base = process.env.GONGZHI_PAGES_TEST_URL || '';
const artifact = process.env.GONGZHI_PAGES_ARTIFACT;
const evidence = process.env.GONGZHI_PAGES_EVIDENCE || path.join(tmpdir(), 'gongzhi-pages-evidence-' + Date.now());
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  if (base) {
    const url = new URL(base);
    expect(url.hostname).toBe('demo.zhihu.davidwang.space');
    expect(url.username + url.password + url.search + url.hash).toBe('');
    return;
  }
  if (!artifact) throw new Error('Select the exact static artifact or public Pages URL');
  const root = path.resolve(artifact);
  server = createServer(async (req, res) => {
    let pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname.split('/').some(p => p.startsWith('.'))) { res.writeHead(404).end(); return; }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
    try {
      const body = await readFile(file);
      const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
});
test.afterAll(() => server?.close());
test.beforeEach(async ({ page }) => {
  const forbidden: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (/^\/(api|auth|mcp)(\/|$)/.test(url.pathname) || (url.origin !== new URL(base).origin && url.protocol !== 'blob:')) forbidden.push(request.url());
  });
  page.on('pageerror', error => forbidden.push('runtime: ' + error.message));
  page.on('response', response => { if (response.status() >= 400) forbidden.push('HTTP ' + response.status() + ' ' + response.url()); });
  (page as any).pagesForbidden = forbidden;
});
test.afterEach(({ page }) => expect((page as any).pagesForbidden, 'No API/auth/MCP/model/origin/external requests').toEqual([]));

test('all static entry aliases select fixture without login, and exit reaches the explanation', async ({ page }) => {
  for (const route of ['/', '/zh/?demo=other', '/zh/board/', '/zh/connect/', '/community/zh/index.html']) {
    await page.goto(base + route);
    await expect(page).toHaveURL(/demo=atlas/);
    await expect(page.locator('.atlas-banner')).toContainText('黑客松演示');
    await expect(page.getByRole('button', { name: '使用知乎登录', exact: true })).toHaveCount(0);
    await expect(page.locator('input[type=password]')).toHaveCount(0);
  }
  await page.locator('[data-atlas-exit]').click();
  await expect(page).toHaveURL(/\/about\/$/);
  await expect(page.getByRole('heading', { name: '黑客松演示 · Fixture' })).toBeVisible();
  await expect(page.locator('[data-production-link]')).toHaveAttribute('href', 'https://zhihu.davidwang.space');
  await expect(page.locator('[data-production-status]')).toContainText('当前公网不可用');
});

test('public artifact supports 100 points, fixed download, optional feedback and mobile layout', async ({ page }) => {
  await page.goto(base + '/zh/');
  await expect(page.locator('[data-agent-id]')).toHaveCount(100);
  await expect(page.locator('.cm-graph-wrap canvas')).toBeVisible();
  await page.getByRole('searchbox', { name: '搜索 Fixture Agent 专业' }).fill('容器工程');
  await page.locator('.cm-agent-chips button:visible').click();
  await expect(page.locator('[data-atlas-skill-source]')).toHaveAttribute('href', /\/5ed4ad9f815c192ad4aac0a6e6b11640d2ec2a8f\/skills\/docker-expert\/SKILL.md$/);
  await page.getByRole('button', { name: '1. A 分享 Fixture v1 后离线', exact: true }).click();
  await expect(page.locator('[data-agent-id="atlas-fixture-a"]')).toContainText('离线');
  await page.getByRole('link', { name: '2. B 搜索固定版本', exact: true }).click();
  await page.getByRole('button', { name: '查看并借用此版本', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载 SKILL.md', exact: true }).click();
  const file = await download;
  expect(await readFile((await file.path())!, 'utf8')).toContain('FIXTURE / 模拟样本 / 未真实执行');
  await page.getByRole('button', { name: '3. 运行模拟检查（未真实执行）', exact: true }).click();
  await expect(page.locator('.atlas-receipt')).toContainText('未真实执行');
  await page.getByRole('button', { name: '不发反馈，返回公告', exact: true }).click();
  await expect(page.locator('[data-record-id="atlas-fixture-feedback"]')).toHaveCount(0);
  await page.getByRole('button', { name: '查看并借用此版本', exact: true }).click();
  const submit = page.getByRole('button', { name: '4. 确认发布演示反馈（仅本地）', exact: true });
  await expect(submit).toBeDisabled();
  await page.getByRole('checkbox', { name: '我已审阅上面的模拟反馈，只在本地演示公告发布', exact: true }).check();
  await submit.click();
  await page.getByRole('link', { name: '查看演示反馈与连线', exact: true }).click();
  await expect(page.locator('[data-atlas-evidence]')).toBeVisible();
  await expect(page.locator('[data-agent-id]')).toHaveCount(100);
  const graph = await page.evaluate(async () => (window as any).GongzhiAtlas.read('/api/gongzhi/agent-graph'));
  expect(graph.nodes).toHaveLength(100); expect(graph.edges).toHaveLength(1);
  await page.screenshot({ path: path.join(evidence, 'pages-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('searchbox', { name: '搜索 Fixture Agent 专业' }).fill('容器工程');
  await page.locator('.cm-agent-chips button:visible').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-cm-graph]').screenshot({ path: path.join(evidence, 'pages-mobile.png') });
});

test('shared theory navigation keeps six steps, fixed versions and fixture return paths on desktop and mobile', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ['/zh/', '/zh/board/', '/zh/connect/']) {
      await page.goto(base + route);
      if (width === 390) await page.locator('#cm-menu-button').click();
      await page.getByRole('link', { name: '进化层', exact: true }).filter({ visible: true }).click();
      await expect(page).toHaveURL(/\/community\/zh\/evolution\/index.html\?demo=atlas$/);
      // Navigation commits before deferred scripts finish on a public network.
      // Wait for the browser's actual initialization event, not just visible HTML.
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByText('理论设计', { exact: true })).toHaveCount(1);
      await expect(page.locator('.atlas-banner')).toHaveCount(0);
      await expect(page.locator('.ev-process [role=tab]')).toHaveCount(6);
      await expect(page.locator('script')).toHaveCount(1);
      for (let index = 0; index < 6; index++) {
        await page.locator(`[data-step="${index}"]`).click();
        await expect(page.locator('#ev-step-panel')).toHaveAttribute('aria-labelledby', 'ev-step-' + index);
        await expect(page.locator('[data-step-condition]')).not.toBeEmpty();
      }
      for (const name of ['检查证据', '来源归属', '适用范围']) {
        await page.getByRole('tab', { name, exact: true }).click();
        await expect(page.locator('[data-v1-content]')).not.toBeEmpty();
        await expect(page.locator('[data-v2-content]')).not.toBeEmpty();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => scrollTo(0, 0));
      if (route === '/zh/') await page.screenshot({ path: path.join(evidence, `evolution-${width}.png`), fullPage: true });
      await page.locator('.ev-header-back').click();
      await expect(page).toHaveURL(/\/zh\/\?demo=atlas#agents$/);
      await expect(page.locator('.atlas-banner')).toContainText('黑客松演示');
      await expect(page.locator('[data-agent-id]')).toHaveCount(100);
    }
  }
});
