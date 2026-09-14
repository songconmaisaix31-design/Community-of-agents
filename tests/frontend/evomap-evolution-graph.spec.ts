import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

// Static browser acceptance. Real-space responses below are explicit HTTP test fixtures.
const root = path.resolve("public/community");
const evidence = path.join(tmpdir(), "gongzhi-evolution-f");
let server: Server, origin: string;
const unsafe = new Map<Page, string[]>();
const graph = { mode: "live", nodes: [{ id: "test-connected-agent", owner_id: "test-owner", kind: "external_agent", label: "已接入测试 Agent", mode: "live" }], edges: [] };
const record = { id: "test-record", speaker_id: "test-connected-agent", speaker: { id: "test-connected-agent", kind: "external_agent", name: "已接入测试 Agent" }, kind: "need", title: "测试中的真实空间记录", body: "仅为本地 HTTP fixture，用于验证参考角色不筛掉公开记录。", created_at: "2026-09-15T00:00:00Z" };
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  server = createServer(async (req, res) => {
    let p = new URL(req.url || "/", "http://localhost").pathname;
    if (p.startsWith("/api/")) { res.writeHead(503, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: false, mode: "live", error: { code: "unavailable", message: "隔离测试 API 不可用" } })); return; }
    if (p.startsWith("/community/")) p = p.slice("/community".length);
    if (p === "/zh") p += "/";
    if (p.endsWith("/")) p += "index.html";
    const file = path.resolve(root, "." + p);
    if (!file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
    try {
      const types: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".gif": "image/gif", ".ttf": "font/ttf" };
      res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }).end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + (server.address() as { port: number }).port;
});
test.afterAll(() => server.close());
test.beforeEach(({ page }) => {
  unsafe.set(page, []);
  page.on("request", r => { const u = new URL(r.url()); if (r.method() !== "GET" || u.origin !== origin || /\/(auth|mcp)(\/|$)|\/runs(?:\/|$)|\/auth\/start/.test(u.pathname)) unsafe.get(page)!.push(r.method() + " " + r.url()); });
  page.on("pageerror", e => unsafe.get(page)!.push(e.message));
});
test.afterEach(({ page }) => { expect(unsafe.get(page), "No external fetch, writes, auth start, model/MCP or runtime errors").toEqual([]); unsafe.delete(page); });
async function success(page: Page) {
  await page.route("**/api/gongzhi/agent-graph", r => r.fulfill({ json: { ok: true, mode: "live", data: graph } }));
  await page.route("**/api/gongzhi/board?*", r => r.fulfill({ json: { ok: true, mode: "live", data: { records: [record], next_cursor: null, mode: "live" } } }));
}

test("默认精确 /zh#agents 是100能力参考，真实失败可见且没有交流替代", async ({ page }) => {
  await page.goto(origin + "/zh#agents");
  await expect(page.getByRole("button", { name: "能力参考", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-capability-hint]")).toContainText("100 个能力参考角色，来自公开 Skill");
  await expect(page.locator("[data-agent-id]")).toHaveCount(100);
  await expect(page.locator(".cm-graph-wrap canvas")).toBeVisible();
  await expect(page.locator("[data-cap-service]")).toContainText("已接入视图暂不可用");
  await expect(page.locator("[data-cm-error-text]")).toContainText("没有用示例内容替代真实记录");
  await expect(page.locator(".cm-record")).toHaveCount(0);
  await expect(page.locator(".atlas-banner")).toHaveCount(0);
  await page.getByRole("searchbox", { name: "搜索能力参考" }).fill("容器工程");
  await expect(page.locator(".cm-agent-chips button:visible")).toHaveCount(1);
  await page.locator(".cm-agent-chips button:visible").click();
  await expect(page.getByRole("region", { name: "能力参考详情" })).toContainText("容器工程 Agent");
  await expect(page.getByRole("link", { name: "阅读 SKILL.md 原文 ↗" })).toHaveAttribute("href", /5ed4ad9f815c192ad4aac0a6e6b11640d2ec2a8f\/skills\/docker-expert\/SKILL.md$/);
  await expect(page.getByRole("link", { name: "阅读 SKILL.md 原文 ↗" })).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.locator("[data-agent-id]")).toHaveCount(100);
  await page.locator("[data-cm-graph]").screenshot({ path: path.join(evidence, "capabilities-desktop.png") });
});

test("已接入显式入口的503与空列表不回退，参考切换不会把角色放进真实名单", async ({ page }) => {
  await page.goto(origin + "/zh/?graph=registered#agents");
  await expect(page.getByRole("button", { name: "已接入 Agent", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-cm-graph-note]")).toContainText("隔离测试 API 不可用");
  await expect(page.locator("[data-agent-id]")).toHaveCount(0);
  await page.getByRole("button", { name: "能力参考", exact: true }).click();
  await expect(page.locator("[data-agent-id]")).toHaveCount(100);
  await page.getByRole("button", { name: "已接入 Agent", exact: true }).click();
  await expect(page.locator("[data-agent-id]")).toHaveCount(0);
  await expect(page.locator(".cm-graph-fallback")).toContainText("未用示例关系替代");
  await page.route("**/api/gongzhi/agent-graph", r => r.fulfill({ json: { ok: true, mode: "live", data: { nodes: [], edges: [], mode: "live" } } }));
  await page.reload();
  await expect(page.locator(".cm-graph-fallback")).toContainText("还没有公开登记的 Agent");
  await expect(page.locator("[data-agent-id]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "已接入 Agent", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("晚到真实响应不抢视图，能力选择不筛公告而公开定位回到已接入Agent", async ({ page }) => {
  await success(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/gongzhi/agent-graph", async r => { await gate; await r.fulfill({ json: { ok: true, mode: "live", data: graph } }); });
  await page.goto(origin + "/zh/?graph=registered#agents", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "能力参考", exact: true }).click();
  release();
  await expect(page.locator("[data-cap-service]")).toContainText("公开数据已读取");
  await expect(page.locator("[data-agent-id]")).toHaveCount(100);
  await page.locator(".cm-agent-chips button").first().click();
  await expect(page.locator(".cm-record")).toHaveCount(1);
  await expect(page.locator("[data-cm-speaker]")).toBeHidden();
  await page.locator('[data-locate-agent="test-connected-agent"]').click();
  await expect(page.getByRole("button", { name: "已接入 Agent", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-agent-id]")).toHaveCount(1);
  await expect(page.locator('[data-agent-id="test-connected-agent"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-cm-speaker]")).toBeVisible();
});

test("现有Cosmos画布在选择与切换中保留镜头，能力图恰好100有效点与零边", async ({ page }) => {
  await success(page); await page.goto(origin + "/zh/#agents");
  await expect(page.locator(".cm-graph-wrap canvas")).toBeVisible();
  await expect(page.locator("[data-cap-service]")).toContainText("公开数据已读取");
  await page.evaluate(() => {
    const w = window as any, original = w.GongzhiGraph;
    document.querySelector(".cm-graph-wrap canvas")!.setAttribute("data-retained", "yes");
    w.GongzhiGraph = { ...original, mount: (...args: any[]) => { w.evolutionGraphData = args[1]; return w.evolutionGraphInstance = original.mount(...args); } };
  });
  await page.getByRole("button", { name: "已接入 Agent", exact: true }).click();
  const naturalZoom = await page.evaluate(() => (window as any).evolutionGraphInstance.getZoomLevel());
  await page.evaluate(() => (window as any).evolutionGraphInstance.setZoomLevel(1.7, 0, false));
  const zoom = await page.evaluate(() => (window as any).evolutionGraphInstance.getZoomLevel());
  await page.getByRole("button", { name: "能力参考", exact: true }).click();
  await page.locator(".cm-agent-chips button").nth(20).click();
  await page.getByRole("searchbox", { name: "搜索能力参考" }).fill("不存在的专业");
  await expect(page.locator(".cm-agent-chips button:visible")).toHaveCount(0);
  const actual = await page.evaluate(() => ({
    nodes: (window as any).evolutionGraphData.nodes.length, edges: (window as any).evolutionGraphData.edges.length,
    valid: Array.from((window as any).evolutionGraphInstance.getPointPositions()).filter(Number.isFinite).length / 2,
    zoom: (window as any).evolutionGraphInstance.getZoomLevel()
  }));
  expect(actual).toEqual({ nodes: 100, edges: 0, valid: 100, zoom });
  await expect(page.locator('.cm-graph-wrap canvas[data-retained="yes"]')).toHaveCount(1);
  await page.getByRole("searchbox", { name: "搜索能力参考" }).fill("");
  const point = await page.evaluate((scale: number) => {
    const w = window as any, g = w.evolutionGraphInstance;
    g.setZoomLevel(scale, 0, false);
    const xy = g.getPointPositions(), bounds = document.querySelector(".cm-graph-wrap canvas")!.getBoundingClientRect();
    for (let i = 0; i < w.evolutionGraphData.nodes.length; i++) {
      const [x, y] = g.spaceToScreenPosition([xy[i * 2], xy[i * 2 + 1]]);
      if (x > 8 && x < bounds.width - 8 && y > 8 && y < bounds.height - 8 && g.findPointsInRect([[x - 5, y - 5], [x + 5, y + 5]]).length === 1) return { x, y, id: w.evolutionGraphData.nodes[i].id, label: w.evolutionGraphData.nodes[i].label };
    }
    return null;
  }, naturalZoom);
  expect(point, "A visible isolated capability point is available for actual canvas click").not.toBeNull();
  await page.locator(".cm-graph-wrap canvas").click({ position: { x: point!.x, y: point!.y } });
  await expect(page.locator(`[data-agent-id="${point!.id}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "能力参考详情" })).toContainText(point!.label);
  await expect(page.locator(".cm-record")).toHaveCount(1);
});

test("能力目录缺失保持不可用，未自动切换到真实接口成功数据", async ({ page }) => {
  await success(page);
  await page.route("**/atlas-agent-catalog.js", r => r.fulfill({ status: 404, body: "" }));
  await page.goto(origin + "/zh/#agents");
  await expect(page.locator("[data-capability-hint]")).toContainText("能力参考资料未载入");
  await expect(page.locator("[data-cap-service]")).toContainText("公开数据已读取");
  await expect(page.locator("[data-agent-id]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "能力参考", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "已接入 Agent", exact: true }).click();
  await expect(page.locator('[data-agent-id="test-connected-agent"]')).toHaveCount(1);
});

test("390宽与无WebGL时，能力搜索、键盘选择及进化页入口仍可用", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(type)) return null;
      return original.call(this, type, ...args);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto(origin + "/zh/#agents");
  await expect(page.locator(".cm-graph-fallback")).toBeVisible();
  await expect(page.locator(".cm-graph-wrap canvas")).toHaveCount(0);
  await page.getByRole("searchbox", { name: "搜索能力参考" }).fill("docker-expert");
  const choice = page.locator(".cm-agent-chips button:visible");
  await choice.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "能力参考详情" })).toContainText("容器工程 Agent");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator("[data-cm-graph]").screenshot({ path: path.join(evidence, "capabilities-mobile-fallback.png") });
  await page.getByRole("link", { name: "查看 Agent 进化机制 ↗" }).click();
  await expect(page).toHaveURL(origin + "/community/zh/evolution/index.html");
  await expect(page.getByText("理论设计", { exact: true })).toBeVisible();
});
