import { test, expect, type Page } from "@playwright/test";
import type { AgentGraph, BulletinRecord, Owner } from "../../lib/gongzhi/contracts";
import type { Graph } from "@cosmos.gl/graph";

test("root opens the selected zh static page with isolated local assets", async ({ page, context, baseURL }, info) => {
  const origin = new URL(baseURL!).origin;
  const external: string[] = [], assets: string[] = [], broken: string[] = [], errors: string[] = [];
  const assetTypes = new Set(["stylesheet", "script", "image", "font"]);
  await context.route("**/*", route => {
    if (new URL(route.request().url()).origin !== origin) {
      external.push(route.request().url()); return route.abort();
    }
    return route.continue();
  });
  page.on("request", request => { if (assetTypes.has(request.resourceType())) assets.push(new URL(request.url()).pathname); });
  page.on("response", response => { if (response.status() >= 400 && assetTypes.has(response.request().resourceType())) broken.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/zh\/?$/);
  await expect(page).toHaveTitle(/共治/);
  await expect(page.locator("h1:visible").first()).toBeVisible();
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath("selected-zh-page.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(assets.length).toBeGreaterThan(0);
  expect(assets.filter(path => !path.startsWith("/community/"))).toEqual([]);
  expect(external).toEqual([]);
  expect(broken).toEqual([]);
  expect(errors).toEqual([]);
});

test("Next routes expose real unavailability and preserve local navigation", async ({ page, baseURL }, info) => {
  const external: string[] = [];
  await page.route("**/*", route => {
    if (new URL(route.request().url()).origin !== new URL(baseURL!).origin) {
      external.push(route.request().url()); return route.abort();
    }
    return route.continue();
  });
  for (const path of ["/zh", "/zh/board"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("[data-cm-board] .cm-error")).toBeVisible();
    await expect(page.locator("[data-cm-board] .cm-record")).toHaveCount(0);
    await expect(page.locator("[data-cm-board] .cm-error")).toContainText("没有用示例内容替代");
    await page.screenshot({ path: info.outputPath(path.endsWith("board") ? "board-real-error.png" : "home-real-error.png"), fullPage: true });
  }
  if (info.project.name === "narrow") {
    await page.locator("#cm-menu-button").click();
    await page.locator('#cm-mobile-nav a[href="/zh/connect/"]').click();
  } else {
    await page.locator('header nav a[href="/zh/connect/"]').click();
  }
  await expect(page).toHaveURL(/\/zh\/connect\/?$/);
  await expect(page.locator("#cli")).toContainText("examples/agent/cli.ts register");
  await expect(page.locator("#cli")).toContainText("GONGZHI_SELF_HOSTED_URL");
  await expect(page.locator("#cli")).toContainText("GONGZHI_AGENT_GRANT_TOKEN");
  await expect(page.locator("#cli")).toContainText("GONGZHI_AGENT_CREDENTIAL_FILE");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("connect-guide.png"), fullPage: true });
  expect(external).toEqual([]);
});

async function stubRecords(page: Page, baseURL: string) {
  // Deliberate browser-only HTTP responses; these are not Agent execution receipts.
  const time = "2026-09-14T00:00:00.000Z";
  const agent = (id: string, kind: "external_agent" | "platform_agent"): Owner => ({
    id, publisher_id: id, kind, name: `浏览器合成 ${id}`, capabilities: [], revoked_at: null,
    last_seen_at: null, created_at: time, mode: "live",
  });
  const a = agent("integration-agent-a", "external_agent"), b = agent("integration-agent-b", "platform_agent");
  const kinds = ["need", "experience", "reply", "supplement", "result"] as const;
  const records: BulletinRecord[] = kinds.map((kind, i) => ({
    id: `integration-record-${i}`, thread_id: kind === "experience" ? `integration-record-${i}` : "integration-record-0", reply_to_id: i > 1 ? "integration-record-0" : null,
    kind, title: `合成${kind}记录`, body: `仅供浏览器测试：${kind}完整原文。` + "保留上下文。".repeat(50) + `末尾标记-${kind}`,
    speaker_id: (i > 1 ? b : a).id, owner_id: "integration-human", speaker: i > 1 ? b : a,
    need_revision: kind === "experience" ? null : 1, created_at: time, mode: "live",
  }));
  const graph: AgentGraph = {
    mode: "live", nodes: [a, b].map(x => ({ id: x.id, kind: x.kind as "external_agent" | "platform_agent", label: x.name, owner_id: "integration-human", mode: "live" })),
    edges: [{ id: "integration-edge", source: b.id, target: a.id, evidence_id: records[2].id, reply_to_id: records[0].id, thread_id: records[0].id, mode: "live" }],
  };
  const external: string[] = [];
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL!).origin) { external.push(url.href); return route.abort(); }
    const data = url.pathname.endsWith("/board") ? { records, next_cursor: null, mode: "live" }
      : url.pathname.endsWith("/agent-graph") ? graph
      : url.pathname.includes("/threads/") ? { thread_id: records[0].id, records: records.filter(r => r.thread_id === records[0].id), next_cursor: null, mode: "live" }
      : url.pathname.includes("/records/") ? records.find(r => url.pathname.endsWith(r.id)) : undefined;
    return data ? route.fulfill({ json: { ok: true, mode: "live", data } }) : route.continue();
  });
  return { records, graph, kinds, external };
}

test("synthetic HTTP records render five bulletin kinds and complete thread text", async ({ page, baseURL }, info) => {
  const { kinds, external } = await stubRecords(page, baseURL!);
  await page.goto("/zh");
  await expect(page.locator("#board .cm-record")).toHaveCount(5);
  for (const kind of kinds) {
    await page.locator(`#board .cm-filters button[data-kind="${kind}"]`).click();
    await expect(page.locator("#board .cm-record")).toHaveCount(1);
    await expect(page.locator("#board .cm-record")).toContainText(`合成${kind}记录`);
  }
  await page.locator('#board .cm-filters button[data-kind="all"]').click();
  await page.locator('#board [data-record-id="integration-record-2"]').click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".cm-thread-record")).toHaveCount(4);
  await expect(page.getByRole("dialog")).toContainText("末尾标记-reply");
  await page.screenshot({ path: info.outputPath("synthetic-thread.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".cm-agent-chips button")).toHaveCount(2);
  expect(await page.locator("body").innerText()).not.toMatch(/收益|积分|进化|排行榜|定价|胶囊/);
  expect(external).toEqual([]);
});

type ProbeWindow = Window & { __integrationGraph?: Graph; __firstGraph?: Graph };

test("real canvas links read public evidence and selection keeps the camera", async ({ page, baseURL }, info) => {
  await stubRecords(page, baseURL!);
  // Observe the actual cosmos instance returned by the page; no renderer or handlers are replaced.
  await page.addInitScript(() => {
    let exported: Record<string, unknown>;
    Object.defineProperty(window, "GongzhiGraph", {
      configurable: true,
      get: () => exported,
      set: value => {
        exported = { ...value, mount: (...args: unknown[]) => {
          const graph = value.mount(...args);
          (window as ProbeWindow).__integrationGraph = graph;
          return graph;
        } };
      },
    });
  });
  await page.goto("/zh");
  const canvas = page.locator(".cm-graph-wrap canvas");
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => (window as ProbeWindow).__integrationGraph?.isReady);
  expect(await page.evaluate(() => (window as ProbeWindow).__integrationGraph!.getPointPositions().length)).toBe(4);
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const camera = () => page.evaluate(() => {
    const graph = (window as ProbeWindow).__integrationGraph!;
    return { zoom: graph.getZoomLevel(), origin: graph.spaceToScreenPosition([0, 0]), unit: graph.spaceToScreenPosition([1, 1]) };
  });
  const initial = await camera();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -150);
  await expect.poll(async () => (await camera()).zoom).not.toBe(initial.zoom);
  let previous = "";
  await expect.poll(async () => { const next = JSON.stringify(await camera()); const stable = next === previous; previous = next; return stable; }, { intervals: [100, 150, 200] }).toBe(true);
  const before = await camera();
  await page.evaluate(() => { (window as ProbeWindow).__firstGraph = (window as ProbeWindow).__integrationGraph; });
  const handle = await canvas.elementHandle();
  // Screen coordinates come from the real graph, then ordinary browser pointer events click the link.
  const midpoint = await page.evaluate(() => {
    const graph = (window as ProbeWindow).__integrationGraph!, positions = graph.getPointPositions();
    return graph.spaceToScreenPosition([(positions[0] + positions[2]) / 2, (positions[1] + positions[3]) / 2]);
  });
  await page.mouse.click(box.x + midpoint[0], box.y + midpoint[1]);
  await expect(page.getByRole("dialog")).toContainText("公开交流依据");
  await expect(page.locator(".cm-thread-record")).toHaveCount(2);
  await expect(page.getByRole("dialog")).toContainText("末尾标记-need");
  await expect(page.getByRole("dialog")).toContainText("末尾标记-reply");
  await page.keyboard.press("Escape");
  const target = page.locator('.cm-agent-chips [data-agent-id="integration-agent-b"]');
  await target.click();
  await expect(target).toHaveAttribute("aria-pressed", "true");
  expect(await camera()).toEqual(before);
  expect(await page.evaluate(el => el === document.querySelector(".cm-graph-wrap canvas"), handle)).toBe(true);
  expect(await page.evaluate(() => (window as ProbeWindow).__firstGraph === (window as ProbeWindow).__integrationGraph)).toBe(true);
  await expect(page.locator("#board .cm-record")).toHaveCount(3);
  await page.screenshot({ path: info.outputPath("synthetic-agent-selection.png"), fullPage: true });
});

test("HTTP status and mode errors never become records and pagination failures stay visible", async ({ page, baseURL }) => {
  const { records } = await stubRecords(page, baseURL!);
  let scenario: "status" | "mode" | "pagination" = "status";
  await page.route("**/api/gongzhi/board?*", route => {
    const url = new URL(route.request().url());
    if (scenario === "status") return route.fulfill({ status: 503, json: { ok: true, mode: "live", data: { records, next_cursor: null, mode: "live" } } });
    if (scenario === "mode") return route.fulfill({ json: { ok: true, mode: "demo", data: { records, next_cursor: null, mode: "demo" } } });
    if (url.searchParams.has("cursor")) return route.fulfill({ status: 503, json: { ok: false, mode: "live", error: { code: "unavailable", message: "合成分页请求失败", retryable: true } } });
    return route.fulfill({ json: { ok: true, mode: "live", data: { records, next_cursor: "synthetic-next", mode: "live" } } });
  });
  for (const next of ["status", "mode"] as const) {
    scenario = next;
    await page.goto("/zh/board");
    await expect(page.locator("[data-cm-board] .cm-error")).toBeVisible();
    await expect(page.locator(".cm-record")).toHaveCount(0);
  }
  scenario = "pagination";
  await page.goto("/zh/board");
  await expect(page.locator(".cm-record")).toHaveCount(5);
  await page.locator("[data-cm-more]").click();
  await expect(page.locator("[data-cm-board] .cm-error")).toContainText("合成分页请求失败");
  await expect(page.locator("[data-cm-board] .cm-error")).toBeVisible();
  await expect(page.locator(".cm-record")).toHaveCount(5);
});
