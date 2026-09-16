import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

// 经验库（记忆层）页面：搜索、列表、固定版本详情、SKILL.md 下载、谱系入口。
// 全部为 HTTP fixture 拦截的浏览器行为验证，不是真实 Agent 借用或后端联调。
const repo = path.resolve(process.cwd(), "tests/frontend", "../..");
const root = path.join(repo, "public/community");
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".gif": "image/gif", ".ttf": "font/ttf" };

let server: Server | undefined, origin: string;
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    let url = (req.url || "/").split("?")[0];
    if (url === "/zh/library" || url === "/zh/library/") url = "/zh/library/index.html";
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

const owner = { id: "o1", publisher_id: "o1", kind: "external_agent", name: "A", capabilities: [], revoked_at: null, last_seen_at: null, created_at: "2026-09-16T00:00:00.000Z", mode: "live" };
const version = {
  experience: { id: "exp-1", owner_id: "o1", publisher_id: "o1", title: "先对齐目标，再安排分工", body: "6 人、室内、60 分钟；每人先写目标与可提供的帮助，再确认分工和一个可检查的交付物。", applicability: "原条件：6 人、室内、60 分钟。", tags: ["活动"], revision: 1, previous_version_id: null, sources: [{ id: "s1", kind: "other", title: "来源一", retrieved_at: "2026-09-16T00:00:00.000Z", content_type: "summary" }], visibility: "public", created_at: "2026-09-16T00:00:00.000Z", mode: "live" },
  author: owner,
  skill_md: "---\nname: exp-1\ndescription: 固定版本方法\n---\n# 先对齐目标，再安排分工\n\n6 人、室内、60 分钟。",
  execution: "caller_local",
  author_presence_required: false,
};

function stubApi(page: import("@playwright/test").Page) {
  return Promise.all([
    page.route("**/api/gongzhi/experiences/search*", r => r.fulfill({ json: { ok: true, mode: "live", data: { items: [{ id: "exp-1", revision: 1, title: "先对齐目标，再安排分工", summary: "分组前的对齐方法", applicability: "原条件：6 人、室内、60 分钟。", tags: ["活动"], owner_id: "o1", author: owner, source_count: 1, previous_version_id: null, created_at: "2026-09-16T00:00:00.000Z", mode: "live" }], mode: "live" } } })),
    page.route("**/api/gongzhi/experiences/*/versions/*", r => r.fulfill({ json: { ok: true, mode: "live", data: version } })),
  ]);
}

test("经验库：搜索展示摘要，点击读取固定版本并下载 SKILL.md，谱系入口可跳", async ({ page }) => {
  await stubApi(page);
  await page.goto(`${origin}/zh/library/`);
  await expect(page).toHaveTitle("经验库 · 共治");
  const q = page.locator("#lib-q");
  await expect(q).toBeVisible();
  await q.fill("活动");
  await q.press("Enter");
  const card = page.locator(".lib-card").first();
  await expect(card).toBeVisible();
  await expect(card.locator(".lib-card-title")).toHaveText("先对齐目标，再安排分工");
  await card.click();
  const detail = page.locator("[data-detail]");
  await expect(detail).toBeVisible();
  await expect(detail.locator("[data-detail-title]")).toHaveText("先对齐目标，再安排分工");
  await expect(detail.locator("[data-detail-applicability]")).toContainText("原条件");
  await expect(detail.locator("[data-detail-sources] li")).toContainText("来源一");
  const download = page.locator("[data-download]");
  await expect(download).toBeEnabled();
  await expect(page.locator("[data-lineage-link]")).toHaveAttribute("href", /evolution\/index\.html\?id=exp-1/);
});

test("经验库：搜索无结果时如实提示，不显示假数据", async ({ page }) => {
  await page.route("**/api/gongzhi/experiences/search*", r => r.fulfill({ json: { ok: true, mode: "live", data: { items: [], mode: "live" } } }));
  await page.goto(`${origin}/zh/library/`);
  await page.locator("#lib-q").fill("不存在的关键词");
  await page.locator("#lib-q").press("Enter");
  await expect(page.locator("[data-status]")).toContainText("没有匹配");
  await expect(page.locator(".lib-card")).toHaveCount(0);
});
