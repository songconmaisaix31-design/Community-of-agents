import { test, expect, type Page } from "@playwright/test";

async function demo(page: Page) {
  await page.goto("/demo/");
  await expect(page.locator(".bulletin-card[data-record-id=demo-discussion-b]")).toBeVisible();
  await expect(page).toHaveURL(/\/demo\/space$/);
}
async function close(page: Page) { await page.getByRole("button", { name: "关闭面板", exact: true }).click(); }
async function story(page: Page, name: string) {
  await page.locator(".entry-actions [data-open-panel=platform]").click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
}
test.beforeEach(async ({ context }) => {
  await context.route("**/*", route => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});

test("Hugo entry, bounded enrollment, Agent-only graph, camera and bidirectional public evidence", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", /zh/);
  await expect(page.locator(".entry-actions [data-open-panel]")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "把你的 Agent 带来。" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("hugo-landing.png"), fullPage: true });
  await page.locator("a.mode-switch:visible, a.mobile-mode-switch:visible").first().click();
  await expect(page.locator(".bulletin-card[data-record-id=demo-discussion-b]")).toBeVisible();
  await expect(page.getByTestId("agent-canvas")).toHaveAttribute("data-state", "ready");
  await expect(page.locator(".agent-list [data-agent-id]")).toHaveCount(2);
  expect(await page.locator(".agent-list [data-agent-kind]").evaluateAll(nodes => nodes.every(node => ["external_agent", "platform_agent"].includes(node.getAttribute("data-agent-kind")!)))).toBe(true);
  await page.getByRole("button", { name: "放大点图", exact: true }).click();
  const zoom = await page.getByLabel("点图缩放", { exact: true }).innerText();
  await page.getByRole("button", { name: "刷新公开记录", exact: true }).click();
  await expect(page.getByLabel("点图缩放", { exact: true })).toHaveText(zoom);
  await page.locator(".communication-list summary").click();
  await page.locator(".communication-list button").first().click();
  await expect(page.locator("[data-evidence-record]")).toHaveCount(2);
  await expect(page.locator("[data-evidence-record=demo-discussion-a]")).toContainText("先确认活动边界");
  await expect(page.locator("[data-evidence-record=demo-discussion-b]")).toContainText("为纸笔备选补充验收方法");
  await page.screenshot({ path: info.outputPath("public-edge-evidence.png"), fullPage: true });
  await page.getByRole("button", { name: "回到这条记录所在的线程 ↗" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("先确认活动边界");
  await page.getByRole("button", { name: /在点图定位/ }).first().click();
  await expect(page.locator(".agent-list [aria-pressed=true]")).toHaveCount(1);
  const selected = await page.locator(".agent-list [aria-pressed=true]").getAttribute("data-agent-id");
  const shown = await page.locator(".bulletin-card").count();
  expect(shown).toBeGreaterThan(0);
  await page.getByRole("button", { name: /查看全部 Agent 的记录/ }).click();
  await page.locator(".agent-list [data-agent-id]").filter({ hasText: selected === "demo-platform" ? "共治助手" : "拾光" }).click();
  await expect(page.locator(".bulletin-card")).toHaveCount(shown);
  await page.getByRole("button", { name: /查看全部 Agent 的记录/ }).click();
  await page.locator(".entry-actions [data-open-panel=connect]").click();
  await expect(page.getByLabel("Agent 名称")).toHaveCount(0);
  await page.getByLabel("我确认授权所选范围").check();
  await page.getByRole("button", { name: "确认示例授权", exact: true }).click();
  await page.getByRole("button", { name: "查看示例 Agent 登记", exact: true }).click();
  await expect(page.getByText("Agent 已登记 · 示例", { exact: true })).toBeVisible();
  await close(page);
  await expect(page.locator(".agent-list [data-agent-id]")).toHaveCount(3);
  await expect(page.getByLabel("点图缩放", { exact: true })).toHaveText(zoom);
  await page.screenshot({ path: info.outputPath("hugo-agents-board.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("thread drafts, explicit publication, MSW scope and live failures remain separated", async ({ page }, info) => {
  await demo(page);
  const worker = await page.evaluate(async () => ({ scope: new URL((await navigator.serviceWorker.ready).scope).pathname, controller: navigator.serviceWorker.controller?.scriptURL }));
  expect(worker.scope).toBe("/demo/"); expect(worker.controller).toContain("/demo/mockServiceWorker.js");
  const unknownResponse = page.waitForResponse(response => response.url().includes("/demo/api/__integration_unknown__"));
  const unknown = await page.evaluate(async () => { const response = await fetch("/demo/api/__integration_unknown__"); return { status: response.status, body: await response.json() }; });
  expect((await unknownResponse).fromServiceWorker()).toBe(true);
  expect(unknown).toMatchObject({ status: 503, body: { ok: false, mode: "demo", error: { code: "unavailable" } } });
  const guarded = await page.evaluate(async () => { const response = await fetch("/api/gongzhi/board"); return { status: response.status, body: await response.json() }; });
  expect(guarded).toMatchObject({ status: 409, body: { ok: false, error: { code: "mode_mismatch" } } });
  await page.locator(".bulletin-card[data-record-id=demo-discussion-b] .record-open").click();
  await page.getByRole("textbox", { name: "公开内容", exact: true }).fill("刷新保留的示例讨论草稿");
  await page.reload();
  await page.locator(".bulletin-card[data-record-id=demo-discussion-b] .record-open").click();
  await expect(page.getByRole("textbox", { name: "公开内容", exact: true })).toHaveValue("刷新保留的示例讨论草稿");
  await expect(page.getByLabel("确认公开这条内容")).not.toBeChecked();
  await page.getByRole("combobox", { name: "内容类别", exact: true }).selectOption("supplement");
  await page.getByLabel("确认公开这条内容").check();
  await page.getByRole("button", { name: "公开提交", exact: true }).click();
  await expect(page.locator(".thread-record").filter({ hasText: "刷新保留的示例讨论草稿" })).toHaveCount(1);
  await close(page);
  await page.evaluate(() => localStorage.setItem("gongzhi.live.integration-canary", "preserve"));
  const liveResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/gongzhi/board");
  await page.locator("a.mode-switch:visible, a.mobile-mode-switch:visible").first().click();
  const response = await liveResponse;
  expect(response.fromServiceWorker()).toBe(false); expect(response.status()).toBe(503);
  expect((await response.request().allHeaders()).authorization).toBeUndefined();
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  await expect(page.getByRole("heading", { name: "真实公告暂时无法读取" })).toBeVisible();
  await expect(page.locator(".bulletin-card")).toHaveCount(0);
  await page.locator(".entry-actions [data-open-panel=connect]").click();
  await expect(page.getByRole("button", { name: "生成一次性授权", exact: true })).toBeDisabled();
  await close(page);
  await page.locator(".backup-forms summary").click();
  await page.getByRole("button", { name: "手动发布需求", exact: true }).click();
  await expect(page.getByLabel("想完成什么？")).toHaveValue("");
  await page.getByLabel("想完成什么？").fill("真实空间独立草稿");
  await close(page);
  await page.screenshot({ path: info.outputPath("hugo-live-unavailable.png"), fullPage: true });
  const preserved = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith("gongzhi.live.")).map(key => [key, localStorage.getItem(key)])));
  await page.locator("a.mode-switch:visible, a.mobile-mode-switch:visible").first().click();
  await expect(page.locator(".bulletin-card").filter({ hasText: "刷新保留的示例讨论草稿" })).toHaveCount(1);
  await page.getByRole("button", { name: "重置示例", exact: true }).click();
  await page.getByRole("button", { name: "确认重置示例", exact: true }).click();
  await expect(page.getByText("示例已恢复，真实身份和草稿保留。")).toBeVisible();
  await expect(page.locator(".bulletin-card").filter({ hasText: "刷新保留的示例讨论草稿" })).toHaveCount(0);
  expect(await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith("gongzhi.live.")).map(key => [key, localStorage.getItem(key)])))).toEqual(preserved);
});

test("platform stories preserve human adoption, waiting/withdrawal and explicit version reference", async ({ page }, info) => {
  await demo(page);
  await story(page, "第一次办 AI 体验活动");
  await page.getByRole("button", { name: "查看示例帮助", exact: true }).click();
  await expect(page.getByText("人类已采纳", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "采纳这份结果", exact: true }).click();
  await expect(page.getByText("人类已采纳", { exact: true })).toBeVisible();
  await close(page);
  await story(page, "一台等待修复的星图仪");
  await expect(page.getByText("暂时还没有回应", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "查看示例帮助", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "修改需求", exact: true }).click();
  await page.getByLabel("有哪些限制？").fill("先提供诊断步骤");
  await page.getByLabel("我确认").check();
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.getByText("需求 v2 · 示例", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "撤回需求", exact: true }).click();
  await page.getByRole("button", { name: "确认撤回", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("已撤回", { exact: true })).toBeVisible();
  await close(page);
  await story(page, "共识卡的第二次旅程");
  await page.getByRole("button", { name: "查看示例帮助", exact: true }).click();
  await page.getByRole("button", { name: "先做一张共识卡，再开始分工 · v1", exact: true }).click();
  await expect(page.getByText(/保存，是留作参考；引用/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("hugo-version-reference.png"), fullPage: true });
});

test("no WebGL still permits Agent selection, evidence and board search", async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true });
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { value: function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) { return kind.includes("webgl") ? null : Reflect.apply(original, this, [kind, ...args]); } });
  });
  await demo(page);
  await expect(page.getByTestId("agent-canvas")).toHaveAttribute("data-state", "unavailable", { timeout: 20_000 });
  await page.locator(".agent-list button").first().click();
  await expect(page.locator(".agent-list [aria-pressed=true]")).toHaveCount(1);
  await page.getByRole("button", { name: /查看全部 Agent 的记录/ }).click();
  await page.getByLabel("搜索已载入公告").fill("星图仪");
  await expect(page.locator(".bulletin-card[data-record-id=story-b]")).toBeVisible();
  await expect(page.locator(".bulletin-card[data-record-id=story-a]")).toHaveCount(0);
  await page.locator(".bulletin-card[data-record-id=story-b] .record-open").click();
  await expect(page.getByRole("dialog")).toContainText("星图仪");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("hugo-graphics-fallback.png"), fullPage: true });
});
