import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { ExperienceFeedbackPayloadSchema } from "../../lib/gongzhi/contracts";

// Product fixture mode, served as static assets. No real API or identity is provisioned.
const root = path.resolve("public/community");
const evidence = path.join(tmpdir(), "gongzhi-atlas-fixture-f");
let server: Server, origin: string;
const calls = new Map<Page, string[]>();
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    let p = decodeURIComponent(url.pathname);
    if (p.startsWith("/api/") || p.startsWith("/auth/")) { res.writeHead(503, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: false, mode: "live", error: { code: "unavailable", message: "测试真实接口不可用", retryable: true } })); return; }
    if (p.startsWith("/community/")) p = p.slice("/community".length);
    if (p.endsWith("/")) p += "index.html";
    const file = path.resolve(root, "." + p);
    if (!file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
    try {
      const body = await readFile(file);
      const types: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".gif": "image/gif", ".ttf": "font/ttf" };
      res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }); res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + (server.address() as { port: number }).port;
});
test.afterAll(() => server.close());
test.beforeEach(({ page }) => {
  calls.set(page, []);
  page.on("request", request => {
    const u = new URL(request.url());
    if (/^\/(api|auth|mcp)(\/|$)/.test(u.pathname) || (u.origin !== origin && u.protocol !== "blob:")) calls.get(page)!.push(request.method() + " " + request.url());
  });
});
test.afterEach(({ page }, info) => {
  if (!info.title.startsWith("live")) expect(calls.get(page), "Fixture must make zero real API/auth/model or external requests").toEqual([]);
  calls.delete(page);
});
async function share(page: Page) {
  await page.goto(origin + "/zh/?demo=atlas");
  await page.getByRole("button", { name: "1. A 分享 v1 后离线", exact: true }).click();
  await expect(page.locator('[data-agent-id="atlas-fixture-a"]')).toContainText("离线");
}
async function borrow(page: Page) {
  await page.getByRole("link", { name: "2. B 搜索固定版本", exact: true }).click();
  await page.locator('[data-ex-library] input[type=search]').fill("活动");
  await page.locator('[data-ex-library] form').getByRole("button").click();
  await expect(page.locator(".ex-card")).toHaveCount(1);
  await page.getByRole("button", { name: "查看并借用此版本", exact: true }).click();
  await expect(page.locator(".cm-dialog")).toContainText("第 1 版");
}
async function simulate(page: Page) {
  await page.getByRole("button", { name: "3. 查看检查结果（演示）", exact: true }).click();
  await expect(page.locator(".atlas-receipt")).toContainText("检查结果 · 演示");
}
async function post(page: Page) {
  const submit = page.getByRole("button", { name: "4. 确认分享反馈（演示）", exact: true });
  await expect(submit).toBeDisabled();
  await page.getByRole("checkbox", { name: "我已审阅上述反馈，仅在演示中发布", exact: true }).check();
  await submit.click();
  await expect(page.locator(".atlas-receipt")).toContainText("演示反馈已在本地公告中");
}

test("fixture：100 节点、分享后离线、固定 v1 下载、条件变化模拟与不发反馈", async ({ page }) => {
  await page.goto(origin + "/zh/?demo=atlas");
  await expect(page.getByRole("complementary", { name: "演示状态" })).toContainText("操作仅保留在本浏览器");
  await expect(page.locator("[data-agent-id]")).toHaveCount(100);
  await expect(page.locator(".cm-record")).toHaveCount(1);
  await expect(page.locator("[data-atlas-evidence]")).toHaveCount(0);
  await share(page); await borrow(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 SKILL.md", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("SKILL.md");
  const skill = await readFile((await file.path())!, "utf8");
  expect(skill).toContain("演示资料 / 模拟样本 / 未真实执行"); expect(skill).toContain("revision: 1");
  await expect(page.locator(".atlas-check")).toContainText("12 人 / 户外 / 30 分钟");
  await simulate(page);
  await page.getByRole("button", { name: "不发反馈，返回公告", exact: true }).click();
  await expect(page.locator(".cm-record")).toHaveCount(2);
  await expect(page.locator('[data-record-id="atlas-fixture-feedback"]')).toHaveCount(0);
  await page.reload(); await expect(page.locator(".cm-record")).toHaveCount(2);
  await page.screenshot({ path: path.join(evidence, "fixture-borrow-board.png"), fullPage: true });
});

test("fixture：100 个专业与固定 Skill 来源可搜索，同一身份详情且不自动交流", async ({ page }) => {
  await page.goto(origin + "/zh/?demo=atlas#agents");
  const catalog = await page.evaluate(() => (window as any).GongzhiAtlasCatalog);
  expect(catalog).toHaveLength(100);
  for (const field of ["id", "name", "specialty"]) expect(new Set(catalog.map((p: any) => p[field])).size).toBe(100);
  expect(new Set(catalog.map((p: any) => p.source.id)).size).toBe(100);
  for (const p of catalog) {
    expect(p.name).toMatch(/^知乎 .+ 专家 Agent$/);
    expect(p.source.url).toBe(`https://github.com/sickn33/agentic-awesome-skills/blob/5ed4ad9f815c192ad4aac0a6e6b11640d2ec2a8f/${p.source.path}/SKILL.md`);
    expect(p.source.license_url).toContain("/LICENSE-CONTENT");
  }
  await page.getByRole("searchbox", { name: "搜索 Agent 专业" }).fill("容器工程");
  await expect(page.locator("[data-atlas-search-count]")).toContainText("匹配 1 / 100");
  await page.locator('.cm-agent-chips button:visible').click();
  await expect(page.getByRole("region", { name: "Agent 专业详情" })).toContainText("知乎 容器工程 专家 Agent");
  await expect(page.locator("[data-atlas-skill-source]")).toHaveAttribute("href", /\/skills\/docker-expert\/SKILL.md$/);
  await expect(page.locator(".atlas-profile")).toContainText("知乎原文与方法分享需单独取得内容许可");
  const graph = await page.evaluate(async () => (window as any).GongzhiAtlas.read("/api/gongzhi/agent-graph"));
  expect(graph.nodes).toHaveLength(100); expect(graph.edges).toHaveLength(0);
  await page.getByRole("searchbox", { name: "搜索 Agent 专业" }).fill("无此专业");
  await expect(page.locator("[data-atlas-search-count]")).toContainText("匹配 0 / 100");
  await page.getByRole("button", { name: "重置演练", exact: true }).click();
  const after = await page.evaluate(async () => (window as any).GongzhiAtlas.read("/api/gongzhi/agent-graph"));
  expect(after.nodes).toHaveLength(100); expect(after.edges).toHaveLength(0);
});

for (const resource of ["atlas-agent-catalog.js", "atlas-fixture.js"]) {
  test(`fixture：${resource} 加载失败也不初始化真实 API 或身份`, async ({ page }) => {
    await page.route("**/" + resource, r => r.fulfill({ status: 404, body: "" }));
    await page.goto(origin + "/zh/?demo=atlas");
    await expect(page.getByRole("alert")).toContainText("演示模式 · 资源未就绪");
    await expect(page.getByRole("link", { name: "进入真实空间", exact: true })).toHaveAttribute("href", "/zh/?view=live");
    await expect(page.locator(".cm-record")).toHaveCount(0);
    await expect(page.locator("[data-agent-id]")).toHaveCount(0);
    await page.goto(origin + "/zh/board/?demo=atlas");
    await expect(page.getByRole("alert")).toContainText("未连接真实服务");
    await expect(page.locator("[data-ex-results]")).toContainText("演示资源加载失败");
  });
}

test("fixture：反馈明确同意、只增加本地记录、准确 v1 连线与双向选择", async ({ page }) => {
  await share(page); await borrow(page); await simulate(page); await post(page);
  await page.getByRole("link", { name: "查看演示反馈与连线", exact: true }).click();
  await expect(page.locator('[data-agent-id="atlas-fixture-b"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cm-record")).toHaveCount(2);
  await page.getByRole("button", { name: "查看连线依据：B → A / v1", exact: true }).click();
  await expect(page.locator(".cm-dialog .cm-thread-record")).toHaveCount(2);
  await expect(page.locator(".cm-dialog")).toContainText("知乎 实施规划 专家 Agent");
  await expect(page.locator(".cm-dialog .ex-feedback")).toContainText("12 人、户外、30 分钟");
  await page.getByRole("button", { name: "回到原经验第 1 版", exact: true }).click();
  await expect(page.locator(".cm-dialog")).toContainText("固定 v1");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "查看全部 Agent 的记录 ×", exact: true }).click();
  await expect(page.locator(".cm-record")).toHaveCount(3);
  await page.locator('[data-locate-agent="atlas-fixture-a"]').click();
  await expect(page.locator('[data-agent-id="atlas-fixture-a"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cm-record")).toHaveCount(1);
  await page.locator('[data-agent-id="atlas-fixture-b"]').click();
  await expect(page.locator(".cm-record")).toHaveCount(2);
  const data = await page.evaluate(async () => (window as any).GongzhiAtlas.read("/api/gongzhi/board"));
  const feedback = data.records.find((r: any) => r.id === "atlas-fixture-feedback");
  expect(ExperienceFeedbackPayloadSchema.parse(feedback.experience_feedback).revision).toBe(1);
  expect(feedback.speaker_id).toBe("atlas-fixture-b"); expect(feedback.mode).toBe("demo");
  await expect(page.locator(".cm-graph-wrap canvas")).toBeVisible();
  await page.locator("[data-cm-graph]").screenshot({ path: path.join(evidence, "fixture-100-agent-graph.png") });
});

test("fixture：重置全部进度与连线但保留真实存储", async ({ page }) => {
  await share(page);
  await page.evaluate(() => localStorage.setItem("gongzhi-real-sentinel", "untouched"));
  await borrow(page); await simulate(page); await post(page);
  await page.getByRole("button", { name: "重置演练", exact: true }).click();
  await expect(page.locator(".cm-dialog")).toHaveCount(0);
  await expect(page.locator(".cm-record")).toHaveCount(1);
  await expect(page.locator(".ex-card")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".atlas-steps")).toContainText("A 等待分享");
  expect(await page.evaluate(() => localStorage.getItem("gongzhi-real-sentinel"))).toBe("untouched");
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("gongzhi.demo.atlas.v1")!));
  expect(stored).toEqual({ shared: false, borrowed: false, checked: false, feedback: false });
});

test("fixture：手机键盘导航保持模式，接入页面不初始化身份", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/zh/?demo=atlas");
  await page.locator("#cm-menu-button").click();
  const board = page.locator('#cm-mobile-nav a').filter({ hasText: /^公告板$/ });
  await board.focus(); await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/zh\/board\/\?demo=atlas/);
  await page.locator("#cm-menu-button").click();
  await page.locator('#cm-mobile-nav a').filter({ hasText: /^接入指南$/ }).click();
  await expect(page).toHaveURL(/\/zh\/connect\/\?demo=atlas/);
  await expect(page.locator(".atlas-banner")).toBeVisible();
  await expect(page.getByRole("button", { name: "使用知乎登录", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "浏览 100 位专业 Agent", exact: true }).click();
  await page.getByRole("searchbox", { name: "搜索 Agent 专业" }).fill("容器工程");
  await page.locator('.cm-agent-chips button:visible').click();
  await expect(page.locator("[data-atlas-skill-source]")).toBeVisible();
  await expect(page.locator(".atlas-profile")).toContainText("知乎 容器工程 专家 Agent");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator("[data-cm-graph]").screenshot({ path: path.join(evidence, "fixture-mobile.png") });
});

test("fixture：WebGL 不可用仍可借用和选择 Agent", async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: any, ...args: any[]) {
      if (String(kind).includes("webgl")) return null;
      return get.apply(this, [kind, ...args] as any);
    } as any;
  });
  await share(page);
  await expect(page.locator(".cm-graph-fallback")).toBeVisible();
  await page.locator('[data-agent-id="atlas-fixture-a"]').click();
  await expect(page.locator(".cm-record")).toHaveCount(1);
  await borrow(page); await simulate(page);
});

test("fixture：实际 Canvas 选点联动公告，更新保留镜头，拒绝其他版本", async ({ page }) => {
  await page.goto(origin + "/zh/?demo=atlas#agents");
  await expect(page.locator(".cm-graph-wrap canvas")).toBeVisible();
  await page.evaluate(() => {
    const graph = (window as any).GongzhiGraph;
    const mount = graph.mount;
    // Bundle exports are getters; wrap the public facade without changing the renderer.
    (window as any).GongzhiGraph = { ...graph, mount: (...args: any[]) => {
      const instance = mount(...args); (window as any).atlasTestGraph = instance; return instance;
    } };
  });
  await page.getByRole("button", { name: "1. A 分享 v1 后离线", exact: true }).click();
  await page.waitForFunction(() => (window as any).atlasTestGraph?.isReady);
  const points = await page.evaluate(() => {
    const g = (window as any).atlasTestGraph;
    return g.getPointPositions().reduce((all: number[][], _: number, i: number, xy: number[]) => {
      if (i % 2 === 0) all.push(g.spaceToScreenPosition([xy[i], xy[i + 1]])); return all;
    }, []);
  });
  expect(points).toHaveLength(100);
  const canvas = page.locator(".cm-graph-wrap canvas");
  await canvas.click({ position: { x: points[0][0], y: points[0][1] } });
  await expect(page.locator('[data-agent-id="atlas-fixture-a"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cm-record")).toHaveCount(1);
  const zoom = await page.evaluate(() => {
    const g = (window as any).atlasTestGraph; g.zoom(g.getZoomLevel() * 1.2, 0, false); return g.getZoomLevel();
  });
  await page.locator('[data-record-id="atlas-fixture-method"]').click();
  await page.getByRole("button", { name: "读取此经验的固定版本并借用", exact: true }).click();
  await simulate(page); await post(page); await page.keyboard.press("Escape");
  await expect(page.locator("[data-atlas-evidence]")).toBeVisible();
  expect(await page.evaluate(() => (window as any).atlasTestGraph.getZoomLevel())).toBeCloseTo(zoom, 5);
  const rejected = await page.evaluate(async () => {
    try { await (window as any).GongzhiAtlas.client.readExperienceVersion("atlas-fixture-method", 2); return false; } catch { return true; }
  });
  expect(rejected).toBe(true);
  await page.getByRole("button", { name: "重置演练", exact: true }).click();
  await expect(page.locator("[data-atlas-evidence]")).toHaveCount(0);
  await expect(page.locator("[data-agent-id]")).toHaveCount(100);
  await expect(page.locator('[data-agent-id][aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator(".cm-record")).toHaveCount(1);
});

test("live：退出后真实失败不使用残留 fixture，非 atlas 参数不启用演练", async ({ page }) => {
  await share(page);
  expect(calls.get(page)).toEqual([]);
  await page.getByRole("link", { name: "进入真实空间", exact: true }).click();
  await expect(page).toHaveURL(origin + "/zh/?view=live");
  await expect(page.locator("[data-cm-error-text]")).toContainText("没有用示例内容替代真实记录");
  await expect(page.locator(".atlas-banner")).toHaveCount(0);
  await expect(page.locator(".cm-record")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "体验 Agent 协作", exact: true })).toBeVisible();
  expect(calls.get(page)!.some(c => c.includes("/api/gongzhi/board"))).toBe(true);
  await page.goto(origin + "/zh/?demo=other");
  await expect(page.locator(".atlas-banner")).toHaveCount(0);
  await expect(page.locator("[data-cm-error-text]")).toContainText("没有用示例内容替代真实记录");
});
