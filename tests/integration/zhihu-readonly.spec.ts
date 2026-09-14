import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { AgentGraph, BulletinPage, BulletinThread } from "../../lib/gongzhi/contracts";

// No login, grants, publication, runs or decisions. Existing records are historical
// read evidence, never proof that different humans' Agents collaborated this round.
async function read<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(`/api/gongzhi/${path}`);
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.mode).toBe("live");
  return body.data;
}

async function guardReads(page: Page, baseURL: string) {
  const violations: string[] = [];
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (!["http:", "https:"].includes(url.protocol)) return route.continue();
    if (url.origin !== new URL(baseURL).origin || !["GET", "HEAD"].includes(request.method())) {
      violations.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort();
    }
    await route.continue();
  });
  return violations;
}

test("read-only public contracts, single-source skill and mode rejection", async ({ request }) => {
  const guide = await request.get("/agent-skill.md");
  expect(guide.status()).toBe(200);
  expect(guide.headers()["content-type"]).toContain("text/markdown");
  expect(await guide.text()).toBe(await readFile("docs/connect/agent-skill.md", "utf8"));
  const response = await request.get("/api/gongzhi/config");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const config = await response.json();
  expect(Object.keys(config).sort()).toEqual(["data", "mode", "ok"]);
  expect(config.ok).toBe(true);
  expect(config.mode).toBe("live");
  expect(Object.keys(config.data).sort()).toEqual(["api_base", "auth", "contract_version", "database_configured"]);
  expect(Object.keys(config.data.auth).sort()).toEqual(["available", "public_key", "url"]);
  expect(config.data.contract_version).toBe("gongzhi.v1");
  expect(config.data.api_base).toBe("/api/gongzhi");
  // Flags are configuration classification, not Auth login or model execution proof.
  expect(config.data.database_configured).toBe(true);
  const board = await read<BulletinPage>(request, "board?limit=30");
  const graph = await read<AgentGraph>(request, "agent-graph");
  expect(Array.isArray(board.records)).toBe(true);
  expect(board.mode).toBe("live");
  expect(graph.mode).toBe("live");
  expect(new Set(graph.nodes.map(node => node.id)).size).toBe(graph.nodes.length);
  for (const node of graph.nodes) expect(["external_agent", "platform_agent"]).toContain(node.kind);
  const threads = new Map<string, BulletinThread>();
  for (const edge of graph.edges) {
    expect(edge.source).not.toBe(edge.target);
    expect(graph.nodes.some(node => node.id === edge.source)).toBe(true);
    expect(graph.nodes.some(node => node.id === edge.target)).toBe(true);
    let thread = threads.get(edge.thread_id);
    if (!thread) { thread = await read<BulletinThread>(request, `threads/${encodeURIComponent(edge.thread_id)}`); threads.set(edge.thread_id, thread); }
    const evidence = thread.records.find(record => record.id === edge.evidence_id);
    const target = thread.records.find(record => record.id === edge.reply_to_id);
    expect(evidence?.reply_to_id).toBe(edge.reply_to_id);
    expect(evidence?.speaker_id).toBe(edge.source);
    expect(target?.speaker_id).toBe(edge.target);
  }
  const rejected = await request.get("/demo/api/__readonly_probe__");
  expect(rejected.status()).toBe(409);
  expect(await rejected.json()).toMatchObject({ ok: false, mode: "demo", error: { code: "mode_mismatch", retryable: false } });
  const missing = await request.get("/api/gongzhi/__readonly_probe__");
  expect(missing.ok()).toBe(false);
});

test("actual Next pages show the new narrative and current public state", async ({ page, baseURL, request }, info) => {
  const violations = await guardReads(page, baseURL!);
  const board = await read<BulletinPage>(request, "board?limit=30");
  const graph = await read<AgentGraph>(request, "agent-graph");
  expect((await page.goto("/zh/"))?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toContainText("不同人的 Agent");
  await expect(page.locator("body")).toContainText("知乎");
  await expect(page.locator(".cm-step").last()).toContainText("另存为可复用经验");
  if (board.records.length) await expect(page.locator(".cm-record").first()).toBeVisible();
  else await expect(page.locator(".cm-empty")).toContainText("暂时还没有公开记录");
  await expect(page.locator("[data-agent-id]")).toHaveCount(graph.nodes.length);
  await expect(page.locator("[data-cm-graph-note]")).toContainText("不代表在线");
  await page.screenshot({ path: info.outputPath("home.png"), fullPage: true });
  if (graph.nodes.length) {
    await page.locator("[data-agent-id]").first().click();
    await expect(page.locator("[data-cm-speaker]")).toBeVisible();
    await page.locator("[data-cm-speaker-clear]").click();
  }
  const narrow = (page.viewportSize()?.width ?? 0) < 800;
  if (narrow) await page.locator("#cm-menu-button").click();
  await page.locator(narrow ? "#cm-mobile-nav" : "header nav").getByRole("link", { name: "公告板", exact: true }).click();
  await expect(page).toHaveURL(/\/zh\/board\/?$/);
  if (board.records.length) {
    await page.locator(`[data-record-id="${board.records[0].id}"]`).click();
    await expect(page.getByRole("dialog").locator(".cm-thread-record").first()).toBeVisible();
    await page.keyboard.press("Escape");
  } else await expect(page.locator(".cm-empty")).toContainText("暂时还没有公开记录");
  await page.locator('[data-kind="result"]').click();
  await expect(page.locator('[data-kind="result"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cm-record")).toHaveCount(board.records.filter(record => record.kind === "result").length);
  await page.screenshot({ path: info.outputPath("board.png"), fullPage: true });
  if (narrow) await page.locator("#cm-menu-button").click();
  await page.locator(narrow ? "#cm-mobile-nav" : "header nav").getByRole("link", { name: "接入指南", exact: true }).click();
  await expect(page).toHaveURL(/\/zh\/connect\/?$/);
  await expect(page.locator("#platform")).toContainText("模型未配置时无法运行");
  await expect(page.locator("#platform")).toContainText("不声称已检索知乎");
  await expect(page.locator(".cm-publish-bar")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("connect.png"), fullPage: true });
  expect(violations).toEqual([]);
});

test("actual public board remains readable without WebGL", async ({ page, baseURL, request }) => {
  const violations = await guardReads(page, baseURL!);
  const board = await read<BulletinPage>(request, "board?limit=30");
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type.startsWith("webgl") || type === "experimental-webgl") return null;
      return original.apply(this, [type, ...args] as Parameters<typeof original>);
    } as typeof original;
  });
  await page.goto("/zh/");
  await expect(page.locator(".cm-graph-fallback")).toBeVisible();
  if (board.records.length) {
    await page.locator(".cm-record").first().click();
    await expect(page.getByRole("dialog").locator(".cm-thread-record").first()).toBeVisible();
  } else await expect(page.locator(".cm-empty")).toContainText("暂时还没有公开记录");
  expect(violations).toEqual([]);
});

test("isolated empty/error HTTP fixtures never manufacture public records", async ({ page, baseURL }, info) => {
  const violations = await guardReads(page, baseURL!);
  let failing = false;
  await page.route("**/api/gongzhi/board?*", route => route.fulfill(failing
    ? { status: 503, json: { ok: false, mode: "live", error: { code: "unavailable", message: "隔离验收：服务不可用", retryable: true } } }
    : { json: { ok: true, mode: "live", data: { mode: "live", records: [], next_cursor: null } } }));
  await page.goto("/zh/board/");
  await expect(page.locator(".cm-empty")).toContainText("暂时还没有公开记录");
  await expect(page.locator(".cm-empty")).toContainText("真实任务");
  await expect(page.locator(".cm-record")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("fixture-empty.png"), fullPage: true });
  failing = true;
  await page.reload();
  await expect(page.locator(".cm-error")).toBeVisible();
  await expect(page.locator(".cm-error")).toContainText("隔离验收：服务不可用");
  await expect(page.locator(".cm-record")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("fixture-error.png"), fullPage: true });
  failing = false;
  await page.locator("[data-cm-retry]").click();
  await expect(page.locator(".cm-empty")).toBeVisible();
  await page.route("**/api/gongzhi/agent-graph", route => route.fulfill({ json: {
    ok: true, mode: "live", data: { mode: "live", nodes: [], edges: [] },
  } }));
  await page.goto("/zh/");
  await expect(page.locator(".cm-empty")).toContainText("暂时还没有公开记录");
  await expect(page.locator(".cm-graph-fallback")).toContainText("还没有公开登记的 Agent");
  await expect(page.locator("[data-agent-id]")).toHaveCount(0);
  expect(violations).toEqual([]);
});
