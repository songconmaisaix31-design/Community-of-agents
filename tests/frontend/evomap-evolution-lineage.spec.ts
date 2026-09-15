import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

// Static host + explicit HTTP fixtures. Real-mode lineage responses below are test fixtures, not a backend.
const root = path.resolve("public/community");
const evidence = path.join(tmpdir(), "gongzhi-evolution-f");
const direct = "/community/zh/evolution/index.html";
let server: Server, origin: string;
const unsafe = new Map<Page, string[]>();

const time = "2026-09-15T00:00:00.000Z";
const agentA = { id: "agent-a", publisher_id: "agent-a", kind: "external_agent", name: "方法作者 A", capabilities: [], revoked_at: null, last_seen_at: null, created_at: time, mode: "live" };
const agentB = { id: "agent-b", publisher_id: "agent-b", kind: "external_agent", name: "借用者 B", capabilities: [], revoked_at: null, last_seen_at: null, created_at: time, mode: "live" };
const v1 = { id: "exp-lineage-1", owner_id: "agent-a", publisher_id: "agent-a", title: "测试方法 v1", body: "第一版方法正文：先对齐目标。", applicability: "适用条件一：室内小组。", tags: ["测试"], revision: 1, previous_version_id: null, sources: [{ id: "src-1", kind: "zhihu", title: "知乎经验原文", author: "原作者", url: "https://www.zhihu.com/question/1", retrieved_at: time, content_type: "summary" }], visibility: "public", created_at: time, mode: "live" };
const v2 = { ...v1, id: "exp-lineage-2", title: "测试方法 v2", body: "第二版方法正文：先核对限制。", applicability: "适用条件二：户外大组。", revision: 2, previous_version_id: "exp-lineage-1", sources: [] };
const feedback = { id: "fb-1", thread_id: "exp-lineage-1", reply_to_id: null, kind: "reply", title: "v1 使用反馈", body: "反馈正文：有效但需要调整。", speaker_id: "agent-b", owner_id: "agent-b", speaker: agentB, need_revision: null, created_at: time, mode: "live", experience_feedback: { experience_id: "exp-lineage-1", revision: 1, usage: "在新任务中按固定步骤使用。", outcome: "helpful" } };
const lineage = { root: v1, mode: "live", versions: [
  { experience: v1, feedback: [feedback], referenced_by: [{ result_id: "result-1", need_id: "need-1", speaker_id: "agent-b", usage: "结果引用 v1 方法。" }] },
  { experience: v2, feedback: [], referenced_by: [] }
] };
const single = { root: v1, mode: "live", versions: [{ experience: v1, feedback: [], referenced_by: [] }] };

function envelope(data: unknown) { return { ok: true, mode: "live", data }; }

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  server = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
    if (/^\/(api|auth|mcp)(\/|$)/.test(p)) { res.writeHead(503, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: false, mode: "live", error: { code: "unavailable", message: "隔离测试 API 不可用", retryable: true } })); return; }
    if (p.startsWith("/community/")) p = p.slice("/community".length);
    if (p.endsWith("/")) p += "index.html";
    const file = path.resolve(root, "." + p);
    if (!file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
    try {
      const types: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".gif": "image/gif", ".ttf": "font/ttf", ".woff2": "font/woff2" };
      res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }).end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + (server.address() as { port: number }).port;
});
test.afterAll(() => server.close());
test.beforeEach(({ page }) => {
  unsafe.set(page, []);
  page.on("request", r => {
    const u = new URL(r.url());
    const allowedApi = /^\/api\/gongzhi\/experiences(\/[^/]+\/lineage|\/search)?$/.test(u.pathname);
    if (r.method() !== "GET" || u.origin !== origin || (/\/(api|auth|mcp)(\/|$)/.test(u.pathname) && !allowedApi)) unsafe.get(page)!.push(r.method() + " " + r.url());
  });
  page.on("pageerror", e => unsafe.get(page)!.push(e.message));
});
test.afterEach(({ page }) => {
  expect(unsafe.get(page), "Only same-origin GET lineage/search fixtures; no writes, auth, MCP or runtime errors").toEqual([]);
  unsafe.delete(page);
});

async function routeLineage(page: Page, data: unknown) {
  await page.route("**/api/gongzhi/experiences/*/lineage", r => r.fulfill({ json: envelope(data) }));
}

test("真实谱系 fixture 渲染点图，节点点击看版本、反馈与结果详情", async ({ page }) => {
  await routeLineage(page, lineage);
  await page.goto(origin + direct + "?id=exp-lineage-1");
  await expect(page.locator("[data-lineage-status]")).toContainText("「测试方法 v1」：2 个版本 · 1 条借用反馈 · 1 个引用结果");
  await expect(page.locator("[data-lineage-graph] canvas")).toBeVisible();
  await expect(page.locator("[data-lineage-list] button")).toHaveCount(4);
  const snapshot = await page.evaluate(() => ({ nodes: (window as any).GongzhiEvolution.nodes.map((n: any) => n.id), edges: (window as any).GongzhiEvolution.edges.length }));
  expect(snapshot).toEqual({ nodes: ["v:exp-lineage-1", "v:exp-lineage-2", "f:fb-1", "r:result-1"], edges: 3 });
  await page.locator('[data-node-id="v:exp-lineage-2"]').click();
  const detail = page.locator("[data-lineage-detail]");
  await expect(detail).toContainText("第二版方法正文：先核对限制。");
  await expect(detail).toContainText("适用条件二：户外大组。");
  await expect(detail).toContainText("经验 ID：exp-lineage-2 · revision 2");
  await expect(page.locator('[data-node-id="v:exp-lineage-2"]')).toHaveAttribute("aria-pressed", "true");
  await detail.getByRole("button", { name: "查看上一版 v1 →" }).click();
  await expect(detail).toContainText("第一版方法正文：先对齐目标。");
  await expect(detail).toContainText("知乎经验原文（zhihu · 原作者）");
  await page.locator('[data-node-id="f:fb-1"]').click();
  await expect(detail).toContainText("借用反馈 · 有帮助");
  await expect(detail).toContainText("反馈正文：有效但需要调整。");
  await expect(detail).toContainText("借用者 B");
  await page.locator('[data-node-id="r:result-1"]').click();
  await expect(detail).toContainText("结果 result-1");
  await expect(detail).toContainText("结果引用 v1 方法。");
  // Actual canvas click selects the same node and repaints without resetting data.
  const point = await page.evaluate(() => {
    const g = (window as any).GongzhiEvolution, xy = g.instance.getPointPositions();
    const bounds = document.querySelector("[data-lineage-graph] canvas")!.getBoundingClientRect();
    for (let i = 0; i < g.nodes.length; i++) {
      const [x, y] = g.instance.spaceToScreenPosition([xy[i * 2], xy[i * 2 + 1]]);
      if (x > 8 && x < bounds.width - 8 && y > 8 && y < bounds.height - 8 && g.instance.findPointsInRect([[x - 5, y - 5], [x + 5, y + 5]]).length === 1) return { x, y, id: g.nodes[i].id };
    }
    return null;
  });
  expect(point, "A visible isolated lineage point is available for actual canvas click").not.toBeNull();
  await page.locator("[data-lineage-graph] canvas").click({ position: { x: point!.x, y: point!.y } });
  await expect(page.locator(`[data-node-id="${point!.id}"]`)).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-lineage]").screenshot({ path: path.join(evidence, "evolution-lineage-desktop.png") });
});

test("demo=atlas 用硬编码 v1/v2 示例，不请求真实接口", async ({ page }) => {
  const apiCalls: string[] = [];
  page.on("request", r => { if (/\/api\//.test(new URL(r.url()).pathname)) apiCalls.push(r.url()); });
  await page.goto(origin + direct + "?demo=atlas");
  await expect(page.locator("[data-lineage-status]")).toContainText("演示谱系：硬编码 v1/v2 示例");
  await expect(page.locator("[data-lineage-list] button")).toHaveCount(4);
  await page.locator('[data-node-id="f:demo-feedback-1"]').click();
  const detail = page.locator("[data-lineage-detail]");
  await expect(detail).toContainText("借用反馈 · 需要修改");
  await expect(detail).toContainText("演示 B（本机借用者）");
  await page.locator('[data-node-id="v:demo-group-plan-v2"]').click();
  await expect(detail).toContainText("演示");
  await expect(detail).toContainText("演示示例未引用真实知乎原文");
  expect(apiCalls).toEqual([]);
});

test("单版本空谱系与读取失败都明确可见，不用示例替代", async ({ page }) => {
  await routeLineage(page, single);
  await page.goto(origin + direct + "?id=exp-lineage-1");
  await expect(page.locator("[data-lineage-status]")).toContainText("单版本：还没有反馈或引用");
  await expect(page.locator("[data-lineage-list] button")).toHaveCount(1);
  await page.unroute("**/api/gongzhi/experiences/*/lineage");
  await page.route("**/api/gongzhi/experiences/*/lineage", r => r.fulfill({ status: 503, json: { ok: false, mode: "live", error: { code: "unavailable", message: "隔离测试 API 不可用", retryable: true } } }));
  await page.goto(origin + direct + "?id=exp-missing");
  await expect(page.locator("[data-lineage-status]")).toContainText("谱系读取失败：隔离测试 API 不可用");
  await expect(page.locator("[data-lineage-status]")).toContainText("未用示例内容替代");
  await expect(page.locator("[data-lineage-body]")).toBeHidden();
  await expect(page.locator("[data-lineage-graph] canvas")).toHaveCount(0);
});

test("页内输入与搜索选择入口带 id 跳转", async ({ page }) => {
  await routeLineage(page, lineage);
  await page.route("**/api/gongzhi/experiences/search?*", r => r.fulfill({ json: envelope({ mode: "live", items: [{ id: "exp-lineage-1", revision: 1, title: "测试方法 v1", summary: "摘要", applicability: "适用条件一", tags: ["测试"], owner_id: "agent-a", author: agentA, source_count: 1, previous_version_id: null, created_at: time, mode: "live" }] }) }));
  await page.goto(origin + direct);
  await expect(page.locator("[data-lineage-status]")).toContainText("输入经验 ID，或搜索后选择一条公开经验");
  await expect(page.locator("[data-lineage-body]")).toBeHidden();
  await page.locator("#ev-lineage-q").fill("测试方法");
  await page.getByRole("button", { name: "搜索经验", exact: true }).click();
  await expect(page.locator("[data-lineage-status]")).toContainText("匹配 1 条公开经验");
  await page.locator(".ev-lineage-pick").first().click();
  await expect(page).toHaveURL(new RegExp(escapeRegExp(direct) + "\\?id=exp-lineage-1"));
  await expect(page.locator("[data-lineage-status]")).toContainText("2 个版本");
  await page.goBack();
  await page.locator("#ev-lineage-id").fill("exp-lineage-1");
  await page.getByRole("button", { name: "查看谱系", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(escapeRegExp(direct) + "\\?id=exp-lineage-1"));
  await expect(page.locator("[data-lineage-list] button")).toHaveCount(4);
});

function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

test("390 宽降级为同一列表，无横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routeLineage(page, lineage);
  await page.goto(origin + direct + "?id=exp-lineage-1");
  await expect(page.locator("[data-lineage-graph-note]")).toContainText("窄屏以列表展示同一谱系");
  await expect(page.locator("[data-lineage-graph] canvas")).toHaveCount(0);
  await expect(page.locator("[data-lineage-list] button")).toHaveCount(4);
  await page.locator('[data-node-id="v:exp-lineage-2"]').click();
  await expect(page.locator("[data-lineage-detail]")).toContainText("第二版方法正文");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator("[data-lineage]").screenshot({ path: path.join(evidence, "evolution-lineage-mobile.png") });
});

test("无 WebGL 时降级列表，详情仍完整可用", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(type)) return null;
      return original.call(this, type, ...args);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await routeLineage(page, lineage);
  await page.goto(origin + direct + "?id=exp-lineage-1");
  await expect(page.locator("[data-lineage-graph-note]")).toContainText("WebGL");
  await expect(page.locator("[data-lineage-list] button")).toHaveCount(4);
  await page.locator('[data-node-id="r:result-1"]').click();
  await expect(page.locator("[data-lineage-detail]")).toContainText("结果 result-1");
});
