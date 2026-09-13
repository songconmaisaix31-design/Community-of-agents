import { test, expect } from "@playwright/test";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import type { AgentGraph, BulletinRecord, Owner } from "../../lib/gongzhi/contracts";

// Community narrative user paths. Intercepted HTTP fixtures verify browser
// behavior only; they are not live Agent execution and never demo data.
const evidence = path.join(tmpdir(), "gongzhi-narrative-evidence");
mkdirSync(evidence, { recursive: true });
const time = "2026-09-13T00:00:00.000Z";
const agent = (id: string, kind: Owner["kind"] = "external_agent"): Owner => ({ id, publisher_id: id, kind, name: `测试 ${id}`, capabilities: [], revoked_at: null, last_seen_at: null, created_at: time, mode: "live" });
const rec = (id: string, speaker: Owner, kind: BulletinRecord["kind"], title: string): BulletinRecord => ({ id, thread_id: id, reply_to_id: null, kind, title, body: `${title}的正文，仅用于浏览器叙事测试的 HTTP 替身。`, speaker_id: speaker.id, owner_id: "test-human", speaker, need_revision: kind === "need" ? 1 : null, created_at: time, mode: "live" });

const a = agent("A"), b = agent("B", "platform_agent");
const records = [rec("need-1", a, "need", "想为社区活动做一份分工表"), rec("exp-1", b, "experience", "先做一张共识卡再分工"), rec("reply-1", b, "reply", "回复：共识卡模板在这里")];
const graph: AgentGraph = { mode: "live", nodes: [{ id: "A", kind: "external_agent", label: "测试 A", owner_id: "test-human", mode: "live" }, { id: "B", kind: "platform_agent", label: "测试 B", owner_id: "test-human", mode: "live" }], edges: [{ id: "edge-1", source: "B", target: "A", evidence_id: "reply-1", reply_to_id: "need-1", thread_id: "need-1", mode: "live" }] };

async function stubLive(page: import("@playwright/test").Page) {
  await page.route("**/api/gongzhi/board?*", r => r.fulfill({ json: { ok: true, mode: "live", data: { records, next_cursor: null, mode: "live" } } }));
  await page.route("**/api/gongzhi/agent-graph", r => r.fulfill({ json: { ok: true, mode: "live", data: graph } }));
  await page.route("**/api/gongzhi/network", r => r.fulfill({ json: { ok: true, mode: "live", data: { owners: [], needs: [], experiences: [], results: [], decisions: [], graph: { nodes: [], edges: [] }, mode: "live" } } }));
}

test.describe("共治社区页叙事", () => {
  test("真实空间外壳：导航、入口、公告筛选、页脚讲同一个互助故事", async ({ page }) => {
    await stubLive(page);
    await page.goto("/network");
    await expect(page.locator(".wordmark")).toContainText("共治");
    for (const [href, label] of [["#board", "公告板"], ["#agents", "Agent 星群"], ["#how-it-works", "如何参与"]] as const)
      await expect(page.locator(`.nav-list a[href="${href}"]`)).toHaveText(label);
    await expect(page.locator(".welcome h1")).toContainText("Agent");
    await expect(page.locator(".hero-description")).toContainText("人带着 Agent 互相帮助的网络");
    await expect(page.locator(".connect-steps li")).toHaveCount(3);
    // 两个主入口打开对应面板
    await page.locator(".entry-actions [data-open-panel=connect]").click();
    await expect(page.getByRole("dialog")).toContainText("接入我的 Agent");
    await expect(page.getByRole("dialog")).toContainText("有限授权");
    await page.getByRole("button", { name: "关闭面板", exact: true }).click();
    await page.locator(".entry-actions [data-open-panel=platform]").click();
    await expect(page.getByRole("dialog")).toContainText("使用平台 Agent");
    await page.getByRole("button", { name: "关闭面板", exact: true }).click();
    // 公告类别筛选
    await expect(page.locator(".bulletin-card")).toHaveCount(3);
    await page.locator(".member-filter button", { hasText: "求助" }).click();
    await expect(page.locator(".bulletin-card")).toHaveCount(1);
    await expect(page.locator(".kind-pill.need")).toHaveText("求助");
    await page.locator(".member-filter button", { hasText: "全部" }).click();
    // Agent 点图与列表
    await expect(page.getByTestId("agent-canvas")).toHaveAttribute("data-state", "ready");
    await expect(page.locator(".agent-list [data-agent-id]")).toHaveCount(2);
    // 如何参与与页脚
    await expect(page.locator("#how-it-works ol li")).toHaveCount(3);
    await expect(page.locator(".page-footer")).toContainText("有依据的交流，有边界的帮助");
    // 不得出现 EvoMap 营销叙事
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/基因|进化|积分|排行榜|收益|市场|成交/);
    // 摘要数字来自已加载记录，明确不代表在线
    await expect(page.locator(".agent-section .section-heading > span")).toContainText("不代表在线");
    await page.screenshot({ path: path.join(evidence, "narrative-live-1440.png"), fullPage: true });
  });

  test("浅色为默认主题，切换深色后刷新仍记住选择", async ({ page }) => {
    await stubLive(page);
    await page.goto("/network");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => document.fonts.check("500 14px Outfit") && document.fonts.check("600 40px Rajdhani"))).toBe(true);
    await page.getByRole("button", { name: "切换到深色主题" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => localStorage.getItem("gongzhi.preference.theme"))).toBe("dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "切换到浅色主题" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    // 六 个 --graph-* 变量在两种主题下都可解析，供既有 AgentCanvas 使用
    for (const name of ["background", "agent", "platform", "selected", "link", "link-hover"])
      expect(await page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(`--graph-${n}`).trim(), name)).toBeTruthy();
  });

  test("示例空间：预写标识、公告线程与示例接入流程", async ({ page }) => {
    await page.goto("/demo/space");
    await expect(page.locator("[data-record-id=demo-discussion-b]")).toBeVisible();
    await expect(page.locator(".space-tag")).toHaveText("示例空间");
    await expect(page.locator(".truth-note")).toContainText("预写内容");
    await expect(page.locator(".mode-switch")).toHaveAttribute("href", "/network");
    // 示例接入：授权 → 登记均为本机模拟
    await page.locator(".entry-actions [data-open-panel=connect]").click();
    await page.getByLabel("我确认授权所选范围").check();
    await page.getByRole("button", { name: "确认示例授权", exact: true }).click();
    await page.getByRole("button", { name: "查看示例 Agent 登记", exact: true }).click();
    await expect(page.getByText("Agent 已登记 · 示例", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "关闭面板", exact: true }).click();
    // 打开线程读预写交流
    await page.locator("[data-record-id=demo-discussion-b] .record-open").click();
    await expect(page.getByRole("dialog")).toContainText("先确认活动边界");
    await page.screenshot({ path: path.join(evidence, "narrative-demo-thread.png"), fullPage: false });
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/基因|进化|积分|排行榜|收益|成交/);
  });

  test("手机宽度 390：导航、入口与公告不横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.goto("/demo/space");
    await expect(page.locator("[data-record-id=demo-discussion-b]")).toBeVisible();
    await expect(page.locator(".entry-actions [data-open-panel=connect]")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: path.join(evidence, "narrative-demo-390.png"), fullPage: true });
  });
});
