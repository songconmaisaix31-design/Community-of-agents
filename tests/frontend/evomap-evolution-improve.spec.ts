import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

// 进化层「从反馈发起改进」入口：needs_changes 反馈节点应给出带 improve/revision/feedback 参数的入口，
// 跳转到公告板经验库；经验库据此预填 previous_version_id + based_on_feedback_ids。HTTP fixture，不是真实后端。
const root = path.resolve("public/community");
const direct = "/community/zh/evolution/index.html";
let server: Server, origin: string;

const time = "2026-09-16T00:00:00.000Z";
const agentB = { id: "agent-b", publisher_id: "agent-b", kind: "external_agent", name: "借用者 B", capabilities: [], revoked_at: null, last_seen_at: null, created_at: time, mode: "live" };
const v1 = { id: "exp-improve-1", owner_id: "agent-a", publisher_id: "agent-a", title: "方法 v1", body: "第一版方法。", applicability: "原条件。", tags: ["方法"], revision: 1, previous_version_id: null, sources: [], visibility: "public", created_at: time, mode: "live" };
const needsFeedback = { id: "fb-needs-1", thread_id: "exp-improve-1", reply_to_id: null, kind: "reply", title: "v1 使用反馈", body: "条件变化，需要修改。", speaker_id: "agent-b", owner_id: "agent-b", speaker: agentB, need_revision: null, created_at: time, mode: "live", experience_feedback: { experience_id: "exp-improve-1", revision: 1, usage: "在新条件借用 v1。", outcome: "needs_changes" } };
const lineage = { root: v1, mode: "live", versions: [{ experience: v1, feedback: [needsFeedback], referenced_by: [] }] };

function envelope(data: unknown) { return { ok: true, mode: "live", data }; }

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
    if (/^\/(api|auth|mcp)(\/|$)/.test(p)) { res.writeHead(503, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: false, mode: "live", error: { code: "unavailable", message: "本地 fixture 不提供该 API", retryable: true } })); return; }
    if (p.startsWith("/community/")) p = p.slice("/community".length);
    if (p.endsWith("/")) p += "index.html";
    const file = path.resolve(root, "." + p);
    if (!file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
    try {
      const types: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".gif": "image/gif" };
      res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }).end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + (server.address() as { port: number }).port;
});
test.afterAll(() => server.close());

test("needs_changes 反馈节点显示「从反馈发起改进」入口，跳转经验库并带 improve/revision/feedback", async ({ page }) => {
  await page.route("**/api/gongzhi/experiences/*/lineage", r => r.fulfill({ json: envelope(lineage) }));
  await page.goto(origin + direct + "?id=exp-improve-1");
  await expect(page.locator("[data-lineage-status]")).toContainText("方法 v1");
  const fbButton = page.locator("[data-lineage-list] .ev-lineage-item-feedback button");
  await fbButton.click();
  const improve = page.locator("[data-lineage-detail] a", { hasText: "基于此反馈发起候选改进" });
  await expect(improve).toBeVisible();
  const href = await improve.getAttribute("href");
  expect(href).toContain("improve=exp-improve-1");
  expect(href).toContain("revision=1");
  expect(href).toContain("feedback=fb-needs-1");
});

test("经验库 improve+feedback 参数预填 previous_version_id 与 based_on_feedback_ids", async ({ page }) => {
  await page.route("**/api/gongzhi/experiences/*/versions/*", r => r.fulfill({ json: envelope({ experience: v1, author: agentB, skill_md: "---\nname: exp-improve-1\n---\n", execution: "caller_local", author_presence_required: false }) }));
  await page.goto(origin + "/zh/board/?improve=exp-improve-1&revision=1&feedback=fb-needs-1#library");
  const editor = page.locator(".ex-editor");
  await expect(editor).toBeVisible();
  const value = await editor.inputValue();
  const parsed = JSON.parse(value);
  expect(parsed.action).toBe("publish_experience");
  expect(parsed.payload.previous_version_id).toBe("exp-improve-1");
  expect(parsed.payload.based_on_feedback_ids).toEqual(["fb-needs-1"]);
});
