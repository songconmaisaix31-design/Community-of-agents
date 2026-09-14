import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import type { AgentGraph, BulletinRecord, Owner } from "../../lib/gongzhi/contracts";

// EvoMap-adapted static pages: layout, narrative, real-API behavior.
// Intercepted HTTP fixtures verify browser behavior only — never live Agent execution.
const evidence = path.join(tmpdir(), "gongzhi-evomap-adaptation");
mkdirSync(evidence, { recursive: true });
const repo = path.resolve(process.cwd(), "tests/frontend", "../..");
const root = path.join(repo, "public/community");
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".gif": "image/gif", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".ico": "image/x-icon", ".txt": "text/plain" };

let server: Server | undefined, origin: string;
test.beforeAll(async () => {
  // GZ_EVOMAP_BASE: run against the real Next hosting (I's /zh rewrites) instead of the static file server.
  if (process.env.GZ_EVOMAP_BASE) { origin = process.env.GZ_EVOMAP_BASE; return; }
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

const time = "2026-09-13T00:00:00.000Z";
const human = "human-owner";
const a: Owner = { id: "agent-a", publisher_id: "agent-a", kind: "external_agent", name: "拾光 · 测试 Agent", capabilities: [], revoked_at: null, last_seen_at: null, created_at: time, mode: "live" };
const b: Owner = { id: "agent-b", publisher_id: "agent-b", kind: "platform_agent", name: "平台助手 · 测试", capabilities: [], revoked_at: null, last_seen_at: null, created_at: time, mode: "live" };
const need: BulletinRecord = { id: "n1", thread_id: "n1", reply_to_id: null, kind: "need", title: "第一次办 AI 体验活动，怎样安排节奏？", body: "想为社团组织一场小型 AI 体验活动，希望每个人都带着作品离开。", speaker_id: human, owner_id: human, speaker: { ...a, id: human, kind: "human", name: "你 · 测试发起人" }, need_revision: 1, created_at: time, mode: "live" };
const reply: BulletinRecord = { id: "r1", thread_id: "n1", reply_to_id: "n1", kind: "reply", title: "先确认活动边界", body: "建议先准备无需账号的纸笔备选，90 分钟完成一件小作品。", speaker_id: a.id, owner_id: human, speaker: a, need_revision: 1, created_at: time, mode: "live" };
const older: BulletinRecord = { id: "r0", thread_id: "n1", reply_to_id: null, kind: "supplement", title: "补充：教室没有投影仪", body: "纸笔备选成为主方案。", speaker_id: b.id, owner_id: human, speaker: b, need_revision: 1, created_at: "2026-09-12T00:00:00.000Z", mode: "live" };
const exp: BulletinRecord = { id: "e1", thread_id: "e1", reply_to_id: null, kind: "experience", title: "先做一张共识卡，再开始分工", body: "每人写下目标、困难与可提供的帮助，再确认一个能检查的交付物。", speaker_id: b.id, owner_id: human, speaker: b, need_revision: null, created_at: time, mode: "live" };
const records = [exp, reply, need];
const graph: AgentGraph = { mode: "live", nodes: [{ id: a.id, kind: "external_agent", label: a.name, owner_id: human, mode: "live" }, { id: b.id, kind: "platform_agent", label: b.name, owner_id: human, mode: "live" }], edges: [{ id: "edge-1", source: a.id, target: human, evidence_id: "r1", reply_to_id: "n1", thread_id: "n1", mode: "live" }] };

function stubApi(page: Page, opts: { boardStatus?: number } = {}) {
  return Promise.all([
    page.route("**/api/gongzhi/board?*", r => opts.boardStatus && opts.boardStatus >= 400
      ? r.fulfill({ status: opts.boardStatus, json: { ok: false, mode: "live", error: { code: "unavailable", message: "真实公开空间暂时不可用。", retryable: true } } })
      : r.fulfill({ json: { ok: true, mode: "live", data: { records, next_cursor: null, mode: "live" } } })),
    page.route("**/api/gongzhi/agent-graph", r => r.fulfill({ json: { ok: true, mode: "live", data: graph } })),
    page.route("**/api/gongzhi/threads/*", r => {
      const url = r.request().url();
      return url.includes("cursor=")
        ? r.fulfill({ json: { ok: true, mode: "live", data: { thread_id: "n1", records: [older], next_cursor: null, mode: "live" } } })
        : r.fulfill({ json: { ok: true, mode: "live", data: { thread_id: "n1", records: [need, reply], next_cursor: "c2", mode: "live" } } });
    }),
    page.route("**/api/gongzhi/records/*", r => { const id = r.request().url().split("/").pop(); return r.fulfill({ json: { ok: true, mode: "live", data: records.find(x => x.id === id) || reply } }); }),
  ]);
}

function watchExternal(page: Page) {
  const external: string[] = [];
  page.on("request", req => { if (!req.url().startsWith(origin)) external.push(req.url()); });
  return external;
}

test.describe("EvoMap 静态前端共治适配", () => {
  test("主页：原层次 + 共治叙事 + 真实公告与线程 + 星图公告联动，无第三方请求", async ({ page }) => {
    await stubApi(page);
    const external = watchExternal(page);
    await page.goto(`${origin}/zh/`);
    await expect(page).toHaveTitle("共治");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator(".home-hero-title")).toContainText("互相帮助");
    // 刘看山：悬浮助手 + 主页双入口（/zh 无尾斜杠规范下也要出现）
    await expect(page.locator(".kanshan-fab img")).toBeVisible();
    const ctas = page.locator(".kanshan-ctas a");
    await expect(ctas).toHaveCount(2);
    await expect(ctas.first()).toHaveText(/接入我的 Agent/);
    await expect(ctas.first()).toHaveAttribute("href", "/zh/connect/");
    await expect(ctas.last()).toHaveAttribute("href", "/zh/connect/#platform");
    // 无已删除的示例误链
    await expect(page.locator('a[href="/demo/space"]')).toHaveCount(0);
    // 导航真实可用
    await page.locator('header nav a[href="/zh/board/"]').first().click();
    await expect(page).toHaveURL(/\/zh\/board/);
    await page.goBack();
    // 公告：真实记录 + 类别筛选
    await expect(page.locator("#board .cm-record")).toHaveCount(3);
    await page.locator('#board .cm-filters button[data-kind="need"]').click();
    await expect(page.locator("#board .cm-record")).toHaveCount(1);
    await page.locator('#board .cm-filters button[data-kind="all"]').click();
    // 线程对话框：分页读取更早 + ESC 关闭恢复焦点
    const card = page.locator("#board .cm-record", { hasText: "先确认活动边界" });
    await card.click();
    await expect(page.locator(".cm-dialog .cm-thread-record")).toHaveCount(2);
    await page.locator(".cm-dialog").getByRole("button", { name: "读取更早记录" }).click();
    await expect(page.locator(".cm-dialog .cm-thread-record")).toHaveCount(3);
    await expect(page.locator(".cm-dialog")).toContainText("线程已读完");
    await page.keyboard.press("Escape");
    await expect(page.locator(".cm-dialog")).toHaveCount(0);
    await expect(card).toBeFocused();
    // 星图 ↔ 公告联动：chip 筛选发言人，清除恢复
    await expect(page.locator(".cm-agent-chips button")).toHaveCount(2);
    await expect(page.locator("[data-cm-graph-note]")).toContainText("不代表在线");
    await page.locator('.cm-agent-chips button[data-agent-id="agent-a"]').click();
    await expect(page.locator("[data-cm-speaker]")).toBeVisible();
    await expect(page.locator("#board .cm-record")).toHaveCount(1);
    await page.locator("[data-cm-speaker-clear]").click();
    await expect(page.locator("#board .cm-record")).toHaveCount(3);
    // 公告反向定位 Agent
    await page.locator('[data-locate-agent="agent-a"]').click();
    await expect(page.locator('.cm-agent-chips button[data-agent-id="agent-a"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-cm-speaker]")).toBeVisible();
    await page.locator("[data-cm-speaker-clear]").click();
    // 叙事：无 EvoMap 营销词
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/基因|胶囊|积分|排行榜|定价|收益|进化|悬赏/);
    await page.screenshot({ path: path.join(evidence, "home-1440.png"), fullPage: true });
    expect(external, "浏览器不得请求第三方或原站").toEqual([]);
  });

  test("公告页：真实读取失败明确不可用，重试恢复，不展示假数据", async ({ page }) => {
    await stubApi(page, { boardStatus: 503 });
    const external = watchExternal(page);
    await page.goto(`${origin}/zh/board/`);
    await expect(page.locator(".cm-error")).toBeVisible();
    await expect(page.locator(".cm-error")).toContainText("没有用示例内容替代真实记录");
    await expect(page.locator(".cm-record")).toHaveCount(0);
    await page.unroute("**/api/gongzhi/board?*");
    await page.route("**/api/gongzhi/board?*", r => r.fulfill({ json: { ok: true, mode: "live", data: { records, next_cursor: null, mode: "live" } } }));
    await page.locator("[data-cm-retry]").click();
    await expect(page.locator(".cm-record")).toHaveCount(3);
    await expect(page.locator("#need")).toContainText("想发布求助");
    await expect(page.locator('a[href="/demo/space"]')).toHaveCount(0);
    await page.screenshot({ path: path.join(evidence, "board-recovered.png"), fullPage: true });
    expect(external).toEqual([]);
  });

  test("接入指南：授权范围、客户端命令与平台 Agent 真实回执说明", async ({ page }) => {
    const external = watchExternal(page);
    await page.goto(`${origin}/zh/connect/`);
    await expect(page.locator(".cm-scope")).toHaveCount(5);
    await expect(page.locator("#cli .cm-code")).toContainText("examples/agent/cli.ts register grant:");
    await expect(page.locator("#platform")).toContainText("以服务端回执为准");
    await expect(page.locator("#honesty")).toContainText("失败就是失败");
    await page.screenshot({ path: path.join(evidence, "connect-1440.png"), fullPage: true });
    expect(external).toEqual([]);
  });

  test("手机宽度 390：无横向溢出，移动导航可开合", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await stubApi(page);
    await page.goto(`${origin}/zh/`);
    await expect(page.locator("#board .cm-record").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator("#cm-menu-button").click();
    await expect(page.locator("#cm-mobile-nav")).toBeVisible();
    await page.locator('#cm-mobile-nav a[href="/zh/connect/"]').click();
    await expect(page).toHaveURL(/\/zh\/connect/);
    await page.screenshot({ path: path.join(evidence, "connect-390.png"), fullPage: true });
  });
});
