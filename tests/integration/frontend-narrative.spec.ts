import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async ({ context, page }) => {
  await context.route("**/*", route => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
});

async function demo(page: Page) {
  await page.goto("/demo/");
  await expect(page).toHaveURL(/\/demo\/space$/);
  await expect(page.locator(".bulletin-card[data-record-id=demo-discussion-b]")).toBeVisible();
}

test("native Next entry, community narrative, bulletin filters and complete thread", async ({ page }, info) => {
  const resources: string[] = [], errors: string[] = [];
  page.on("request", request => resources.push(request.url()));
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("body")).toContainText("共治");
  expect(await page.locator("body").innerText()).not.toMatch(/EvoMap|EVOX|交易收益|收益率|进化|积分/);
  await page.screenshot({ path: info.outputPath("entry-light.png"), fullPage: true });
  await page.locator('a[href="/demo/space"], a[href="/demo/"]').first().click();
  await expect(page.locator(".bulletin-card[data-record-id=demo-discussion-b]")).toBeVisible();
  await expect(page.locator("body")).toContainText("示例");
  await page.locator("#board").getByRole("button", { name: "经验", exact: true }).click();
  await expect(page.locator(".bulletin-card")).toHaveCount(1);
  await expect(page.locator(".bulletin-card .kind-pill")).toHaveText("经验");
  await page.locator("#board").getByRole("button", { name: "全部", exact: true }).click();
  await page.locator(".board-search input").fill("纸笔备选");
  // One title and the preceding reply body both contain this phrase.
  await expect(page.locator(".bulletin-card")).toHaveCount(2);
  expect(await page.locator(".bulletin-card").evaluateAll(cards => cards.map(card => card.getAttribute("data-record-id")).sort())).toEqual(["demo-discussion-a", "demo-discussion-b"]);
  await page.locator(".bulletin-card[data-record-id=demo-discussion-b] .record-open").click();
  await expect(page.getByRole("dialog")).toContainText("先确认活动边界");
  await expect(page.getByRole("dialog")).toContainText("为纸笔备选补充验收方法");
  await page.screenshot({ path: info.outputPath("complete-thread.png") });
  await page.getByRole("button", { name: "关闭面板", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(resources.filter(url => new URL(url).pathname.startsWith("/hugo/"))).toEqual([]);
  expect(resources.filter(url => !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))).toEqual([]);
  expect(errors).toEqual([]);
});

test("actual theme toggle and refreshed Agent records retain canvas and camera", async ({ page }, info) => {
  await demo(page);
  await expect(page.getByTestId("agent-canvas")).toHaveAttribute("data-state", "ready");
  await expect(page.locator(".agent-list [data-agent-id]")).toHaveCount(2);
  const canvas = await page.locator(".cosmos-host canvas").elementHandle();
  const camera = () => page.locator(".cosmos-host canvas").evaluate(element => {
    const value = (element as HTMLCanvasElement & { __zoom: { x: number; y: number; k: number } }).__zoom;
    return { x: value.x, y: value.y, k: value.k };
  });
  await page.getByRole("button", { name: "缩小点图", exact: true }).click();
  await page.locator(".cosmos-host canvas").scrollIntoViewIfNeeded();
  const box = (await page.locator(".cosmos-host canvas").boundingBox())!;
  const beforePan = await camera();
  await page.mouse.move(box.x + 35, box.y + 35); await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 45, { steps: 4 }); await page.mouse.up();
  const kept = await camera();
  expect(kept.k).toBe(beforePan.k);
  expect(Math.abs(kept.x - beforePan.x)).toBeGreaterThan(1);
  const expectKeptCamera = async () => {
    const current = await camera();
    expect(current.k).toBe(kept.k);
    // Observed translation roundoff is ~1e-13 px; scale stays exact.
    expect(Math.abs(current.x - kept.x)).toBeLessThan(1e-8);
    expect(Math.abs(current.y - kept.y)).toBeLessThan(1e-8);
  };
  for (const theme of ["dark", "light"]) {
    await page.getByRole("button", { name: theme === "dark" ? "切换到深色主题" : "切换到浅色主题", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expectKeptCamera();
    expect(await canvas!.evaluate(element => element.isConnected)).toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`demo-${theme}.png`), fullPage: true });
  }
  const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === "/demo/api/agent-graph");
  await page.getByRole("button", { name: "刷新公开记录", exact: true }).click();
  await refreshed;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  await expect(page.locator(".bulletin-card")).toHaveCount(6);
  await expectKeptCamera();
  await page.locator(".communication-list summary").click();
  await page.locator(".communication-list button").first().click();
  await expect(page.locator("[data-evidence-record]")).toHaveCount(2);
});

test("demo scope and unknown API fail closed while live remains unavailable without fixtures", async ({ page }, info) => {
  await demo(page);
  expect(await page.evaluate(async () => new URL((await navigator.serviceWorker.ready).scope).pathname)).toBe("/demo/");
  const missing = await page.evaluate(async () => { const response = await fetch("/demo/api/__narrative_unknown__"); return { status: response.status, body: await response.json() }; });
  expect(missing).toMatchObject({ status: 503, body: { ok: false, mode: "demo", error: { code: "unavailable" } } });
  await page.evaluate(() => localStorage.setItem("gongzhi.demo.narrative-canary", "示例私有草稿不应进入真实请求"));
  const liveResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/gongzhi/board");
  await page.goto("/network");
  const response = await liveResponse;
  expect(response.status()).toBe(503); expect(response.fromServiceWorker()).toBe(false);
  expect((await response.request().allHeaders()).authorization).toBeUndefined();
  expect(response.request().postData()).toBeNull();
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  await expect(page.getByRole("heading", { name: "真实公告暂时无法读取" })).toBeVisible();
  await expect(page.locator(".bulletin-card")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("示例私有草稿不应进入真实请求");
  await page.screenshot({ path: info.outputPath("live-unavailable.png"), fullPage: true });
});
