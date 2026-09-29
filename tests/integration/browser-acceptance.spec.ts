import { test, expect, type Page } from "@playwright/test";

async function demo(page: Page) {
  await page.goto("/demo/");
  await expect(page.getByTestId("record-story-a")).toBeVisible();
  await expect(page).toHaveURL(/\/demo\/space$/);
}
async function close(page: Page) {
  await page.getByRole("button", { name: "关闭面板", exact: true }).click();
}

test.beforeEach(async ({ context }) => {
  // Fresh Playwright contexts never use the user's browser profile or credentials.
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ? route.continue() : route.abort();
  });
});

test("natural entry, three forms, human adoption and exact experience reference", async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page).toHaveTitle("共治｜Agent 互助网络");
  await expect(page.getByRole("heading", { name: /一个人的难题，\s*也许是另一颗星的光。/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath("landing.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("link", { name: "探索示例星群" }).click();
  await expect(page.getByTestId("record-story-a")).toBeVisible();
  await expect.poll(async () => {
    if (await page.getByRole("button", { name: "放大星图", exact: true }).isEnabled()) return "ready";
    return await page.getByText("当前设备无法打开星图", { exact: true }).isVisible() ? "fallback" : "pending";
  }, { timeout: 20_000, message: "Graph must become interactive or explicitly fall back" }).not.toBe("pending");
  if (await page.getByRole("button", { name: "放大星图", exact: true }).isEnabled()) {
    await page.getByRole("button", { name: "放大星图", exact: true }).click();
    await page.getByRole("button", { name: "缩小星图", exact: true }).click();
    await page.getByRole("button", { name: "显示全部星点", exact: true }).click();
    info.annotations.push({ type: "graphics", description: "Cosmos ready; zoom and fit controls exercised" });
  } else info.annotations.push({ type: "graphics", description: "Explicit graphics fallback; successful Cosmos interaction is unverified" });
  await page.screenshot({ path: info.outputPath("demo-space.png"), fullPage: true, animations: "disabled" });

  await page.getByRole("button", { name: "接入我的 Agent", exact: true }).click();
  await page.getByLabel("Agent 名称").fill("本机验收助手");
  await page.getByLabel("它能提供哪些帮助？").fill("信息整理，活动策划");
  await page.getByRole("button", { name: "建立示例绑定" }).click();
  await expect(page.getByText("示例绑定已保存；没有真实连接。")).toBeVisible();
  await expect(page.getByText("尚无在线活动记录", { exact: true })).toBeVisible();
  await expect(page.locator(".secret-box")).toHaveCount(0);
  await close(page);

  await page.getByRole("button", { name: "发布需求", exact: true }).click();
  await page.getByLabel("想完成什么？").fill("一场新的本地活动");
  await page.getByLabel("目前遇到了什么困难？").fill("需要一份适合六人的活动清单。");
  await page.getByLabel("我确认").check();
  await page.getByRole("dialog").getByRole("button", { name: "发布需求", exact: true }).click();
  await expect(page.getByRole("heading", { name: "一场新的本地活动", exact: true })).toBeVisible();
  await expect(page.getByText("暂时还没有回应", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "查看示例帮助" })).toHaveCount(0);
  await close(page);

  await page.getByRole("button", { name: "分享经验", exact: true }).click();
  await page.getByLabel("给这个方法起个名字").fill("先列清单再讨论");
  await page.getByLabel("具体步骤与经验").fill("每人先写三项，再合并重复项，最后记录决定。");
  await page.getByLabel("我确认").check();
  await page.getByRole("dialog").getByRole("button", { name: "分享经验", exact: true }).click();
  await expect(page.getByRole("heading", { name: "先列清单再讨论" })).toBeVisible();
  await expect(page.getByText(/作者经验 · 没有提供外部来源/)).toBeVisible();
  await close(page);

  await page.getByTestId("record-story-a").click();
  await expect(page.getByText("暂时还没有回应", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "查看示例帮助" }).click();
  await expect(page.getByRole("heading", { name: "90 分钟，让每个人带走一张自己的作品" })).toBeVisible();
  await expect(page.getByText("人类已采纳", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "采纳这份结果" }).click();
  await expect(page.getByText("人类已采纳", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("human-accepted.png"), fullPage: true, animations: "disabled" });
  await close(page);

  await page.getByTestId("record-experience-c-v1").click();
  await expect(page.getByText("目前没有引用记录。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "保存到本机", exact: true }).click();
  await expect(page.getByRole("button", { name: "已保存到本机", exact: true })).toBeVisible();
  await expect(page.getByText("目前没有引用记录。", { exact: true })).toBeVisible();
  await close(page);
  await page.getByTestId("record-story-c").click();
  await page.getByRole("button", { name: "查看示例帮助" }).click();
  await page.getByRole("button", { name: "先做一张共识卡，再开始分工 · v1" }).click();
  await expect(page.getByText(/保存，是留作参考；引用/)).toBeVisible();
  await expect(page.getByRole("button", { name: "用共识卡 v1 组织一次读书会复盘" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("version-reference.png"), fullPage: true, animations: "disabled" });
  expect(errors).toEqual([]);
});

test("refresh keeps drafts; waiting needs can be revised and withdrawn; stale help cannot be adopted", async ({ page }, info) => {
  test.setTimeout(90_000);
  await demo(page);
  await page.getByRole("button", { name: "发布需求", exact: true }).click();
  await page.getByLabel("想完成什么？").fill("刷新后保留的草稿");
  await page.getByLabel("目前遇到了什么困难？").fill("这段内容还没有发布。");
  await page.reload();
  await expect(page.getByTestId("record-story-b")).toBeVisible();
  await page.getByRole("button", { name: "发布需求", exact: true }).click();
  await expect(page.getByLabel("想完成什么？")).toHaveValue("刷新后保留的草稿");
  await expect(page.getByLabel("目前遇到了什么困难？")).toHaveValue("这段内容还没有发布。");
  await expect(page.getByLabel("我确认")).not.toBeChecked();
  await close(page);
  await page.getByTestId("record-story-b").click();
  await expect(page.getByText("暂时还没有回应", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "查看示例帮助" })).toHaveCount(0);
  await page.getByRole("button", { name: "修改需求", exact: true }).click();
  await page.getByLabel("有哪些限制？").fill("仅周末可维修，请先提供诊断步骤。");
  await page.getByLabel("我确认").check();
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.getByText("需求 v2 · 示例", { exact: true })).toBeVisible();
  await expect(page.getByText("暂时还没有回应", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "撤回需求", exact: true }).click();
  await page.getByRole("button", { name: "确认撤回", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("已撤回", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("waiting-revised-withdrawn.png"), fullPage: true, animations: "disabled" });
  await close(page);
  await page.getByTestId("record-story-a").click();
  await page.getByRole("button", { name: "查看示例帮助" }).click();
  await expect(page.getByRole("button", { name: "采纳这份结果" })).toBeVisible();
  await page.getByRole("button", { name: "修改需求", exact: true }).click();
  await page.getByLabel("有哪些限制？").fill("人数调整为六人。");
  await page.getByLabel("我确认").check();
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.getByText("这是旧版需求的结果，不能被当前 v2 采纳。")).toBeVisible();
  await expect(page.getByRole("button", { name: "采纳这份结果" })).toHaveCount(0);
});

test("actual MSW scope, unknown routes, full live navigation and demo-only reset", async ({ page }, info) => {
  test.setTimeout(90_000);
  await demo(page);
  const registration = await page.evaluate(async () => {
    const active = await navigator.serviceWorker.ready;
    return { scope: new URL(active.scope).pathname, controller: navigator.serviceWorker.controller?.scriptURL };
  });
  expect(registration.scope).toBe("/demo/");
  expect(registration.controller).toContain("/demo/mockServiceWorker.js");
  const unknownResponse = page.waitForResponse((response) => response.url().includes("/demo/api/__integration_unknown__"));
  const unknown = await page.evaluate(async () => {
    const response = await fetch("/demo/api/__integration_unknown__");
    return { status: response.status, body: await response.json() };
  });
  expect((await unknownResponse).fromServiceWorker()).toBe(true);
  expect(unknown.status).toBe(503);
  expect(unknown.body).toMatchObject({ ok: false, mode: "demo", error: { code: "unavailable" } });
  const guarded = await page.evaluate(async () => {
    const response = await fetch("/api/gongzhi/network");
    return { status: response.status, body: await response.json() };
  });
  expect(guarded.status).toBe(409);
  expect(guarded.body).toMatchObject({ ok: false, mode: "demo", error: { code: "mode_mismatch" } });
  await page.getByRole("button", { name: "发布需求", exact: true }).click();
  await page.getByLabel("想完成什么？").fill("只能出现在示例里的草稿");
  await close(page);
  await page.evaluate(() => localStorage.setItem("gongzhi.live.integration-canary", "keep-live-storage"));
  const liveResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/gongzhi/network");
  await page.getByRole("link", { name: "进入真实空间" }).click();
  const response = await liveResponse;
  expect(response.fromServiceWorker()).toBe(false);
  expect(response.status()).toBe(503);
  expect(await response.json()).toMatchObject({ ok: false, mode: "live", error: { code: "unavailable" } });
  expect((await response.request().allHeaders()).authorization).toBeUndefined();
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  await expect(page.getByRole("heading", { name: "真实空间暂时未能连接" })).toBeVisible();
  await expect(page.locator("[data-testid^='record-']")).toHaveCount(0);
  await page.getByRole("button", { name: "发布需求", exact: true }).click();
  await expect(page.getByLabel("想完成什么？")).toHaveValue("");
  await page.getByLabel("想完成什么？").fill("真实空间独立草稿");
  await expect(page.getByRole("dialog").getByRole("button", { name: "发布需求", exact: true })).toBeDisabled();
  await close(page);
  await page.screenshot({ path: info.outputPath("live-unavailable-no-fixtures.png"), fullPage: true, animations: "disabled" });
  const liveStorage = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith("gongzhi.live.")).map((key) => [key, localStorage.getItem(key)])));
  await page.getByRole("link", { name: "返回示例空间" }).click();
  await expect(page.getByTestId("record-story-a")).toBeVisible();
  await page.getByRole("button", { name: "发布需求", exact: true }).click();
  await expect(page.getByLabel("想完成什么？")).toHaveValue("只能出现在示例里的草稿");
  await close(page);
  await page.getByRole("button", { name: "重置示例", exact: true }).click();
  await page.getByRole("button", { name: "确认重置示例", exact: true }).click();
  await expect(page.getByText("示例已重置。真实空间的身份和草稿未受影响。")).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("gongzhi.demo.draft.")))).toEqual([]);
  expect(await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith("gongzhi.live.")).map((key) => [key, localStorage.getItem(key)])))).toEqual(liveStorage);
  await page.getByTestId("record-story-a").click();
  await expect(page.getByText("暂时还没有回应", { exact: true })).toBeVisible();
});

test("unavailable graphics preserves searchable list and usable narrow layout", async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true });
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { value: function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      return kind.includes("webgl") ? null : Reflect.apply(original, this, [kind, ...args]);
    } });
  });
  await demo(page);
  await expect(page.getByText("当前设备无法打开星图", { exact: true })).toBeVisible();
  await page.getByLabel("搜索星群").fill("星图仪");
  await expect(page.getByTestId("record-story-b")).toBeVisible();
  await expect(page.getByTestId("record-story-a")).toHaveCount(0);
  await page.getByRole("button", { name: "仅看列表", exact: true }).click();
  await expect(page.getByTestId("network-canvas")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByTestId("record-story-b").click();
  await expect(page.getByText("暂时还没有回应", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("graphics-fallback-list.png"), fullPage: true, animations: "disabled" });
});
