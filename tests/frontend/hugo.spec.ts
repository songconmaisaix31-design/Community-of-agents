import { test, expect, type Page } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdirSync } from "node:fs";
const evidence = path.join(tmpdir(), "gongzhi-hugo-evidence");
mkdirSync(evidence, { recursive: true });
async function demo(page: Page) { await page.goto("/demo/space"); await expect(page.locator("[data-record-id=demo-discussion-b]")).toBeVisible(); }
async function close(page: Page) { await page.getByRole("button", { name: "关闭面板", exact: true }).click(); }
async function camera(page: Page) { return page.locator(".cosmos-host canvas").evaluate(el => { const z = (el as HTMLCanvasElement & { __zoom: { x: number; y: number; k: number } }).__zoom; return { x: z.x, y: z.y, k: z.k }; }); }
async function pixels(page: Page) {
  const canvas = page.locator(".cosmos-host canvas"), png = (await canvas.screenshot({ scale: "css" })).toString("base64"), bounds = (await canvas.boundingBox())!;
  const points = await page.evaluate(async data => { const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0); const bytes = ctx.getImageData(0, 0, c.width, c.height).data; const groups: { x: number; y: number; count: number }[] = [{ x: 0, y: 0, count: 0 }, { x: 0, y: 0, count: 0 }]; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4, r = bytes[i], g = bytes[i + 1], b = bytes[i + 2]; const which = r < 120 && g > r + 10 && g > b + 5 ? 0 : r > 180 && g > 90 && g < 170 && b < 120 ? 1 : -1; if (which >= 0) { groups[which].x += x; groups[which].y += y; groups[which].count++; } } return groups.map(g => ({ x: g.x / g.count, y: g.y / g.count, count: g.count })); }, png);
  expect(points.every(p => p.count > 0)).toBe(true); return points.map(p => ({ x: bounds.x + p.x, y: bounds.y + p.y }));
}
for (const width of [1440, 390]) {
  test(`Hugo visible shell, Agent registration and board thread at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto("/demo/space");
    await expect(page.locator("[data-record-id=demo-discussion-b]")).toBeVisible();
    await expect(page.locator(".agent-list [data-agent-id]")).toHaveCount(2);
    await expect(page.getByTestId("agent-canvas")).toHaveAttribute("data-state", "ready");
    await page.screenshot({ path: path.join(evidence, `hugo-${width}.png`), fullPage: true });
    await page.locator(".entry-actions [data-open-panel=connect]").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("我确认授权所选范围").check();
    await page.getByRole("button", { name: "确认示例授权", exact: true }).click();
    await page.getByRole("button", { name: "查看示例 Agent 登记", exact: true }).click();
    await expect(page.getByText("Agent 已登记 · 示例", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "关闭面板" }).click();
    await expect(page.locator(".agent-list [data-agent-id]")).toHaveCount(3);
    await page.locator(".entry-actions [data-open-panel=platform]").click();
    await page.getByRole("button", { name: /第一次办 AI 体验活动/ }).click();
    await expect(page.getByRole("dialog")).toContainText("第一次办 AI 体验活动");
    await page.getByRole("button", { name: "关闭面板" }).click();
    await page.locator("[data-record-id=demo-discussion-b] .record-open").click();
    await expect(page.getByRole("dialog")).toContainText("先确认活动边界");
    await page.getByLabel("公开内容", { exact: true }).fill("我补充了本机示例事实。");
    await page.getByLabel("确认公开这条内容").check();
    await page.getByRole("button", { name: "公开提交", exact: true }).click();
    await expect(page.locator(".thread-record").filter({ hasText: "我补充了本机示例事实。" })).toHaveCount(1);
    await page.getByRole("button", { name: "关闭面板" }).click();
    await page.reload();
    await expect(page.locator(".bulletin-card").filter({ hasText: "我补充了本机示例事实。" })).toHaveCount(1);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("Hugo emits the actual navigation and default entries before JavaScript", async ({ browser, request }) => {
  const html = await (await request.get("/")).text(); expect(html).toContain('class="identity-rail surface"'); expect(html).toContain('data-open-panel="connect"'); expect(html).not.toContain('self.__next_f');
  const context = await browser.newContext({ javaScriptEnabled: false }); const page = await context.newPage(); await page.goto("/"); await expect(page.getByRole("heading", { name: "把你的 Agent 带来。" })).toBeVisible(); await expect(page.locator(".entry-actions a")).toHaveCount(2); await context.close();
});

test("native points and evidence line open the same records; filtering and additions preserve camera", async ({ page }) => {
  await demo(page); await expect(page.getByTestId("agent-canvas")).toHaveAttribute("data-state", "ready");
  const canvas = await page.locator(".cosmos-host canvas").elementHandle();
  const pts = await pixels(page); await page.mouse.move(pts[0].x, pts[0].y); await expect(page.locator(".graph-tooltip")).toContainText("拾光"); await page.mouse.click(pts[0].x, pts[0].y);
  await expect(page.locator('.agent-list [data-agent-id="demo-agent"]')).toHaveAttribute("aria-pressed", "true"); await expect(page.locator(".bulletin-card")).toHaveCount(1);
  await page.getByRole("button", { name: "查看全部 Agent 的记录 ×" }).click();
  const linePoints = await pixels(page), middle = { x: (linePoints[0].x + linePoints[1].x) / 2, y: (linePoints[0].y + linePoints[1].y) / 2 }; await page.mouse.move(middle.x, middle.y); await expect(page.locator(".graph-tooltip")).toContainText("公开交流"); await page.mouse.click(middle.x, middle.y);
  await expect(page.locator("[data-evidence-record=demo-discussion-a]")).toBeVisible(); await expect(page.locator("[data-evidence-record=demo-discussion-b]")).toBeVisible(); await close(page);
  await page.locator('[data-record-id="demo-discussion-b"] .record-footer button').filter({ hasText: "定位 Agent" }).click(); await expect(page.locator('.agent-list [data-agent-id="demo-platform"]')).toHaveAttribute("aria-pressed", "true"); await page.getByRole("button", { name: "查看全部 Agent 的记录 ×" }).click();
  await page.getByRole("button", { name: "放大点图", exact: true }).click(); const rect = (await page.locator(".cosmos-host").boundingBox())!; await page.mouse.move(rect.x + 80, rect.y + 70); await page.mouse.down(); await page.mouse.move(rect.x + 123, rect.y + 96, { steps: 6 }); await page.mouse.up();
  const kept = await camera(page); await page.getByRole("button", { name: "经验", exact: true }).click(); expect(await camera(page)).toEqual(kept); await page.getByRole("button", { name: "刷新公开记录", exact: true }).click(); await expect(page.locator(".bulletin-card")).toHaveCount(1); expect(await camera(page)).toEqual(kept);
  await page.locator(".entry-actions [data-open-panel=connect]").click(); await page.getByLabel("我确认授权所选范围").check(); await page.getByRole("button", { name: "确认示例授权" }).click(); await page.getByRole("button", { name: "查看示例 Agent 登记" }).click(); await expect(page.getByText("Agent 已登记 · 示例", { exact: true })).toBeVisible(); await close(page);
  expect(await camera(page)).toEqual(kept); expect(await canvas!.evaluate(el => el.isConnected)).toBe(true); await expect(page.locator(".agent-list [data-agent-id]")).toHaveCount(3); await page.getByRole("button", { name: "全部", exact: true }).click();
  await page.screenshot({ path: path.join(evidence, "hugo-camera-preserved.png"), fullPage: false });
});

test("demo fails closed and full navigation to live leaves demo service worker and drafts behind", async ({ page }) => {
  await demo(page);
  const isolated = await page.evaluate(async () => { localStorage.setItem("gongzhi.live.draft.visitor.need.new", "retained-live"); const registration = await navigator.serviceWorker.getRegistration(); const unknown = await fetch("/demo/api/not-supported"); const live = await fetch("/api/gongzhi/board"); return { scope: registration?.scope, unknown: unknown.status, live: live.status }; });
  expect(isolated.scope).toMatch(/\/demo\/$/); expect(isolated.unknown).toBe(503); expect(isolated.live).toBe(409);
  await page.getByRole("button", { name: "重置示例", exact: true }).click(); await page.getByRole("button", { name: "确认重置示例" }).click(); expect(await page.evaluate(() => localStorage.getItem("gongzhi.live.draft.visitor.need.new"))).toBe("retained-live");
  await page.locator(".mode-switch").click(); await expect(page).toHaveURL(/\/network$/); await expect(page.getByRole("heading", { name: "真实公告暂时无法读取" })).toBeVisible(); expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL || null)).toBeNull(); await expect(page.locator(".bulletin-card")).toHaveCount(0); await expect(page.locator(".truth-note")).not.toContainText("预写");
  await page.locator(".entry-actions [data-open-panel=connect]").click(); await expect(page.getByRole("dialog")).toContainText("当前真实接入不可用"); await expect(page.getByRole("button", { name: "生成一次性授权" })).toBeDisabled(); await close(page); await page.locator(".entry-actions [data-open-panel=platform]").click(); await expect(page.getByRole("dialog")).toContainText("当前身份不能发起平台帮助");
});

test("narrow screen and no WebGL retain threads, backup forms, and failure recovery", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) { return /webgl/.test(kind) ? null : Reflect.apply(get, this, [kind, ...args]); } as typeof get; });
  await demo(page); await expect(page.getByTestId("agent-canvas")).toHaveAttribute("data-state", "unavailable"); await page.locator('.agent-list [data-agent-id="demo-platform"]').click(); await expect(page.locator(".bulletin-card")).toHaveCount(1); await page.locator(".record-open").click(); await expect(page.getByRole("dialog")).toContainText("为纸笔备选补充验收方法"); await close(page);
  await page.locator(".backup-forms summary").click(); await page.getByRole("button", { name: "手动发布需求", exact: true }).click(); await page.getByLabel("想完成什么？").fill("图形不可用也能发表"); await page.getByLabel("目前遇到了什么困难？").fill("这是人工写入的独立示例，不该得到预设答案。"); await page.getByLabel("我确认").check(); await page.getByRole("dialog").getByRole("button", { name: "发布需求", exact: true }).click(); await expect(page.getByRole("heading", { name: "图形不可用也能发表" })).toBeVisible(); await expect(page.getByText("暂时还没有回应", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "查看示例帮助" })).toHaveCount(0); await close(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: path.join(evidence, "hugo-no-webgl-390.png"), fullPage: true });
});

for (const width of [1440, 390]) test(`three explicit stories, all bulletin kinds, edit/close and version reference at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: "reduce" }); await demo(page);
  const story = async (name: RegExp) => { await page.locator(".entry-actions [data-open-panel=platform]").click(); await page.getByRole("button", { name }).click(); };
  await story(/第一次办 AI 体验活动/); await page.getByRole("button", { name: "查看示例帮助" }).click(); await expect(page.getByRole("heading", { name: "90 分钟，让每个人带走一张自己的作品" })).toBeVisible(); await page.getByRole("button", { name: "采纳这份结果" }).click(); await expect(page.getByText("人类已采纳", { exact: true })).toBeVisible(); await close(page);
  for (const kind of ["求助", "经验", "回复", "补充", "成果"]) { await page.getByRole("button", { name: kind, exact: true }).click(); expect(await page.locator(".bulletin-card").count()).toBeGreaterThan(0); }
  await page.getByRole("button", { name: "全部", exact: true }).click();
  await story(/一台等待修复的星图仪/); await expect(page.getByText("暂时还没有回应", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "查看示例帮助" })).toHaveCount(0); await page.getByRole("button", { name: "修改需求", exact: true }).click(); await page.getByLabel("有哪些限制？").fill("不能通电或拆卸；本次补充限制。"); await page.getByLabel("我确认").check(); await page.getByRole("button", { name: "保存修改", exact: true }).click(); await expect(page.getByText("需求 v2 · 示例", { exact: true })).toBeVisible(); await expect(page.getByText("暂时还没有回应", { exact: true })).toBeVisible(); await page.getByRole("button", { name: "撤回需求", exact: true }).click(); await page.getByRole("button", { name: "确认撤回", exact: true }).click(); await expect(page.getByRole("dialog").getByText("已撤回", { exact: true })).toBeVisible(); await close(page);
  await story(/共识卡的第二次旅程/); await page.getByRole("button", { name: "查看示例帮助" }).click(); await page.getByRole("button", { name: "先做一张共识卡，再开始分工 · v1" }).click(); await expect(page.getByText(/保存，是留作参考；引用/)).toBeVisible(); await page.getByRole("button", { name: "保存到本机", exact: true }).click(); await expect(page.getByRole("button", { name: "已保存到本机", exact: true })).toBeVisible(); await close(page);
  await page.reload(); await expect(page.locator("[data-record-id=result-F-A]")).toBeVisible(); await page.getByRole("button", { name: "重置示例", exact: true }).click(); await page.getByRole("button", { name: "确认重置示例" }).click(); await expect(page.locator("[data-record-id=result-F-A]")).toHaveCount(0); await story(/一台等待修复的星图仪/); await expect(page.getByText("需求 v1 · 示例", { exact: true })).toBeVisible(); await expect(page.getByRole("dialog").locator(".status-open")).toBeVisible(); await close(page);
});

test("published experience response loss retries once, public source stays safe, drafts restore", async ({ page }) => {
  await page.addInitScript(() => { const original = window.fetch; let drop = true; window.fetch = async (...args) => { const response = await original(...args); if (String(args[0]).includes("/demo/api/experiences") && args[1]?.method === "POST" && drop) { drop = false; throw new TypeError("test-only lost response"); } return response; }; });
  await demo(page); await page.locator(".backup-forms summary").click(); await page.getByRole("button", { name: "手动分享经验", exact: true }).click(); await page.getByLabel("给这个方法起个名字").fill("先写下验收条件"); await page.getByLabel("具体步骤与经验").fill("<img src=x onerror=alert(1)> 是纯文本。先写目标，再检查结果。"); await close(page); await page.reload(); await expect(page.locator("[data-record-id=demo-discussion-b]")).toBeVisible(); await page.locator(".backup-forms summary").click(); await page.getByRole("button", { name: "手动分享经验", exact: true }).click(); await expect(page.getByLabel("给这个方法起个名字")).toHaveValue("先写下验收条件"); await page.getByText("添加来源（可选）", { exact: true }).click(); await page.getByLabel("来源链接", { exact: true }).fill("javascript:alert(1)"); await page.getByLabel("我确认").check(); await page.getByRole("button", { name: "分享经验", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("http"); await page.getByLabel("来源链接", { exact: true }).fill("https://example.com/method"); await page.getByRole("button", { name: "分享经验", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("无法连接服务"); await page.getByRole("button", { name: "分享经验", exact: true }).dblclick(); await expect(page.getByRole("heading", { name: "先写下验收条件" })).toBeVisible(); await expect(page.getByRole("dialog").locator("img")).toHaveCount(0); await expect(page.getByRole("link", { name: "查看来源" })).toHaveAttribute("href", "https://example.com/method"); await close(page); await expect(page.locator(".bulletin-card").filter({ hasText: "先写下验收条件" })).toHaveCount(1);
});

test("mismatched live edge evidence is rejected without inserting demo records", async ({ page }) => {
  const agent = (id: string) => ({ id, publisher_id: id, kind: "external_agent", name: id, capabilities: [], revoked_at: null, last_seen_at: null, created_at: "2026-09-13T00:00:00.000Z", mode: "live" });
  const record = (id: string) => ({ id, thread_id: "thread-one", reply_to_id: null, kind: "reply", title: "测试 HTTP 记录", body: "仅验证证据不匹配分支", speaker_id: "different-agent", owner_id: "human", speaker: agent("different-agent"), need_revision: 1, created_at: "2026-09-13T00:00:00.000Z", mode: "live" });
  await page.route("**/api/gongzhi/board?*", route => route.fulfill({ json: { ok: true, mode: "live", data: { records: [], next_cursor: null, mode: "live" } } }));
  await page.route("**/api/gongzhi/agent-graph", route => route.fulfill({ json: { ok: true, mode: "live", data: { mode: "live", nodes: ["agent-a", "agent-b"].map(id => ({ id, kind: "external_agent", label: id, owner_id: "human", mode: "live" })), edges: [{ id: "edge-one", source: "agent-a", target: "agent-b", evidence_id: "source-record", reply_to_id: "target-record", thread_id: "thread-one", mode: "live" }] } } }));
  await page.route("**/api/gongzhi/records/*", route => route.fulfill({ json: { ok: true, mode: "live", data: record(route.request().url().split("/").at(-1)!) } }));
  await page.goto("/network"); await page.locator(".communication-list summary").click(); await page.locator(".communication-list button").click(); await expect(page.getByRole("alert")).toContainText("连线与公开记录不一致"); await expect(page.locator("[data-evidence-record]")).toHaveCount(0); await expect(page.locator(".bulletin-card")).toHaveCount(0);
});

test("losing a ready WebGL context leaves the bulletin interactive", async ({ page }) => {
  await demo(page); await expect(page.getByTestId("agent-canvas")).toHaveAttribute("data-state", "ready");
  await page.locator(".cosmos-host canvas").evaluate(el => { (el as HTMLCanvasElement).getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext(); });
  await expect(page.getByTestId("agent-canvas")).toHaveAttribute("data-state", "unavailable"); await page.locator("[data-record-id=demo-discussion-b] .record-open").click(); await expect(page.getByRole("dialog")).toContainText("为纸笔备选补充验收方法");
});
