import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";

// 接入指南（/zh/connect）与首页快速接入：选项卡、复制、公开读取检查、移动端布局。
// 全部为 HTTP fixture 拦截的浏览器行为验证 —— 不是真实 Agent 登记或后端联调。
const evidence = path.join(tmpdir(), "gongzhi-evomap-connect");
mkdirSync(evidence, { recursive: true });
const repo = path.resolve(process.cwd(), "tests/frontend", "../..");
const root = path.join(repo, "public/community");
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".gif": "image/gif", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".txt": "text/plain" };

let server: Server | undefined, origin: string;
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    let url = (req.url || "/").split("?")[0];
    if (url === "/zh" || url === "/zh/") url = "/zh/index.html";
    else if (url.endsWith("/")) url += "index.html";
    if (!url.startsWith("/zh/") && !url.startsWith("/community/")) { res.writeHead(404); res.end(); return; }
    const rel = url.startsWith("/community/") ? url.slice("/community".length) : url;
    try {
      const data = await readFile(path.join(root, rel));
      res.writeHead(200, { "Content-Type": MIME[path.extname(rel)] || "application/octet-stream" });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server!.address() as { port: number }).port}`;
});
test.afterAll(() => server?.close());

const connectInfo = {
  contract_version: "test-v1",
  endpoints: { api: "/api/gongzhi", mcp: "/mcp", skill: "/agent-skill.md", register: "/api/gongzhi/agents/register", agent_status: "/api/gongzhi/agents/me" },
  mcp: { transport: "streamable-http", protocol_versions: ["2025-06-18"], sse: false, stateful: false },
  registration: { required: true, method: "POST", credential: "human_grant", key_delivery: "once" },
  authentication: { agent: "bearer_header", anonymous_public_reads: true },
};
function stubReads(page: Page, opts: { connectStatus?: number; boardData?: object } = {}) {
  return Promise.all([
    page.route("**/api/gongzhi/config", r => r.fulfill({ json: { ok: true, mode: "live", data: { contract_version: "gongzhi.v1", api_base: "/api/gongzhi", database_configured: true, auth: { available: false, url: null, public_key: null } } } })),
    page.route("**/api/gongzhi/connect", r => opts.connectStatus && opts.connectStatus >= 400
      ? r.fulfill({ status: opts.connectStatus, json: { ok: false, mode: "live", error: { code: "unavailable", message: "公开发现暂时不可用。", retryable: true } } })
      : r.fulfill({ json: { ok: true, mode: "live", data: connectInfo } })),
    page.route("**/api/gongzhi/board?*", r => r.fulfill({ json: { ok: true, mode: "live", data: opts.boardData ?? { records: [{ id: "n1" }, { id: "e1" }], next_cursor: null, mode: "live" } } })),
  ]);
}
function watchExternal(page: Page) {
  const bad: string[] = [];
  page.on("request", req => {
    const u = new URL(req.url());
    if (u.hostname !== "127.0.0.1") bad.push(req.url());
  });
  return bad;
}

test("connect 页：选项卡点击与方向键切换，面板互斥可见", async ({ page }) => {
  await stubReads(page);
  await page.goto(`${origin}/zh/connect/`);
  const mcp = page.getByRole("tab", { name: "MCP" });
  const curl = page.getByRole("tab", { name: "curl" });
  const cli = page.getByRole("tab", { name: "客户端 CLI" });
  await expect(mcp).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#cx-panel-mcp")).toBeVisible();
  await expect(page.locator("#cx-panel-curl")).toBeHidden();
  await curl.click();
  await expect(curl).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#cx-panel-curl")).toBeVisible();
  await expect(page.locator("#cx-panel-mcp")).toBeHidden();
  await curl.press("ArrowRight");
  await expect(cli).toBeFocused();
  await expect(cli).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#cx-panel-cli")).toBeVisible();
  await cli.press("ArrowLeft");
  await expect(curl).toBeFocused();
  await cli.press("Home");
  await expect(mcp).toBeFocused();
});

test("connect 页：ORIGIN 替换为同源地址，复制按钮写入剪贴板", async ({ page, context }) => {
  await stubReads(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await page.goto(`${origin}/zh/connect/`);
  await expect(page.locator("#cx-src-skill")).toHaveText(`${origin}/agent-skill.md`);
  await expect(page.locator("#cx-src-mcp-url")).toHaveText(`${origin}/mcp`);
  const prompt = await page.locator("#cx-src-prompt").textContent();
  expect(prompt).toContain(`${origin}/agent-skill.md`);
  expect(prompt).not.toContain("ORIGIN");
  await page.locator('[data-cx-copy="cx-src-skill"]').click();
  await expect(page.locator('[data-cx-copy="cx-src-skill"]')).toHaveText("已复制 ✓");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toBe(`${origin}/agent-skill.md`);
  await page.getByRole("tab", { name: "curl" }).click();
  await page.locator('[data-cx-copy="cx-src-curl-posix"]').click();
  const clip2 = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip2).toContain(`origin="${origin}"`);
  expect(clip2).toContain("curl -q --fail --silent --show-error");
});

test("connect 页：公开读取检查成功，明确不等于已登记 Agent", async ({ page }) => {
  await stubReads(page);
  const bad = watchExternal(page);
  await page.goto(`${origin}/zh/connect/`);
  await page.locator("[data-cx-check]").click();
  const out = page.locator("[data-cx-check-result]");
  await expect(out).toContainText("公开发现可读：契约 test-v1 · MCP streamable-http");
  await expect(out).toContainText("公告实际读取成功：当前读到 2 条公开记录");
  await expect(out).toContainText("不代表你的 Agent 已登记或在线");
  expect(bad).toEqual([]);
});

test("connect 页：公告 data 缺 records 不当作成功或 0 条", async ({ page }) => {
  await stubReads(page, { boardData: {} });
  await page.goto(`${origin}/zh/connect/`);
  await page.locator("[data-cx-check]").click();
  const out = page.locator("[data-cx-check-result]");
  await expect(out).toContainText("公告数据无法识别");
  await expect(out).not.toContainText("公告实际读取成功");
  await expect(page.locator("[data-cx-check]")).toBeEnabled();
});

test("connect 页：请求挂起有界超时，按钮恢复", async ({ page }) => {
  await page.route("**/api/gongzhi/config", r => r.fulfill({ json: { ok: true, mode: "live", data: { contract_version: "gongzhi.v1", api_base: "/api/gongzhi", database_configured: true, auth: { available: false, url: null, public_key: null } } } }));
  await page.route("**/api/gongzhi/connect", () => { /* 永不响应，模拟挂起 */ });
  await page.route("**/api/gongzhi/board?*", r => r.fulfill({ json: { ok: true, mode: "live", data: { records: [], next_cursor: null, mode: "live" } } }));
  await page.goto(`${origin}/zh/connect/`);
  await page.evaluate(() => { (window as unknown as { __CX_CHECK_TIMEOUT_MS: number }).__CX_CHECK_TIMEOUT_MS = 300; });
  await page.locator("[data-cx-check]").click();
  const out = page.locator("[data-cx-check-result]");
  await expect(out).toContainText("公开发现暂不可用：请求超过 300 毫秒 未响应。");
  await expect(out).toContainText("公告实际读取成功：当前读到 0 条公开记录");
  await expect(page.locator("[data-cx-check]")).toBeEnabled();
});

test("connect 页：页面不出现 Agent 密钥片段或粘贴入口", async ({ page }) => {
  await stubReads(page);
  await page.goto(`${origin}/zh/connect/`);
  const html = await page.content();
  expect(html).not.toContain("GONGZHI_AGENT_KEY");
  expect(html).not.toContain("Bearer $");
  await expect(page.locator(".cx-verify")).toContainText("agent_status");
  await expect(page.locator('.cx-verify a[href="/agent-skill.md"]')).toBeVisible();
});

test("connect 页：公开发现失败如实显示，公告结果保留", async ({ page }) => {
  await stubReads(page, { connectStatus: 503 });
  await page.goto(`${origin}/zh/connect/`);
  await page.locator("[data-cx-check]").click();
  const out = page.locator("[data-cx-check-result]");
  await expect(out).toContainText("公开发现暂不可用：公开发现暂时不可用。");
  await expect(out).toContainText("公告实际读取成功");
  await expect(out).not.toContainText("公开发现可读：");
  await expect(page.locator("[data-cx-check]")).toBeEnabled();
});

test("connect 页：移动端选项卡/复制可用且无横向溢出", async ({ page }) => {
  await stubReads(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/zh/connect/`);
  await expect(page.getByRole("tab", { name: "MCP" })).toBeVisible();
  await page.getByRole("tab", { name: "curl" }).click();
  await expect(page.locator("#cx-panel-curl")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator('[data-cx-copy="cx-src-curl-ps"]')).toBeVisible();
});

test("首页：快速接入带展示同源说明地址，可复制且链接到接入页", async ({ page, context }) => {
  await page.route("**/api/gongzhi/board?*", r => r.fulfill({ json: { ok: true, mode: "live", data: { records: [], next_cursor: null, mode: "live" } } }));
  await page.route("**/api/gongzhi/agent-graph", r => r.fulfill({ json: { ok: true, mode: "live", data: { mode: "live", nodes: [], edges: [] } } }));
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  const bad = watchExternal(page);
  await page.goto(`${origin}/zh/`);
  const band = page.locator("#quick-connect");
  await expect(band).toBeVisible();
  await expect(band.locator("#cx-src-quick")).toHaveText(`${origin}/agent-skill.md`);
  await band.locator('[data-cx-copy="cx-src-quick"]').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}/agent-skill.md`);
  await band.getByRole("link", { name: "MCP / curl / CLI 接入方式" }).click();
  await expect(page).toHaveURL(/\/zh\/connect\//);
  expect(bad).toEqual([]);
});
