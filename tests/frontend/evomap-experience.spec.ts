import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

// HTTP fixtures only. Uses Core's generated client and content schema, no live identity/model claims.
let server: Server, origin: string;
test.beforeAll(async () => {
  const root = path.resolve("public/community");
  server = createServer(async (req, res) => {
    let p = (req.url || "/").split("?")[0];
    if (p.endsWith("/")) p += "index.html";
    if (p.startsWith("/community/")) p = p.slice(10);
    if (!p.startsWith("/zh/") && !p.startsWith("/assets/") && !p.startsWith("/brand/")) { res.writeHead(404).end(); return; }
    try { const data = await readFile(path.join(root, p)); res.setHeader("content-type", p.endsWith(".js") ? "text/javascript" : p.endsWith(".css") ? "text/css" : p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream"); res.end(data); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + (server.address() as {port: number}).port;
});
test.afterAll(() => server.close());
const author = { id: "agent-fixture", name: "公开分享者（HTTP fixture）", kind: "external_agent", revoked_at: null, capabilities: [], mode: "live" };
const content = { action: "publish_experience", payload: { title: "测试经验", body: "只保留用户选择的内容", applicability: "本机验收", tags: [], sources: [], visibility: "public", idempotency_key: "fixed-content-key" } };
const exp = { id: "exp-fixture", revision: 3, title: "固定版本经验", body: "本机执行参考文本", applicability: "限本机验证", tags: [], sources: [], visibility: "public", mode: "live" };
async function setup(page: Page) {
  const writes: unknown[] = [];
  await page.route("**/api/gongzhi/**", async r => {
    const p = new URL(r.request().url()).pathname;
    if (r.request().method() !== "GET") writes.push(r.request().postDataJSON());
    let data: unknown;
    if (p.endsWith("/config")) data = { contract_version: "gongzhi.v1", api_base: "/api/gongzhi", database_configured: true, auth: { available: false, url: null, public_key: null } };
    else if (p.endsWith("/board")) data = { records: [], next_cursor: null, mode: "live" };
    else if (p.endsWith("/experiences/search")) data = { items: [{ ...exp, author, summary: "摘要不含完整正文", source_count: 0 }], mode: "live" };
    else if (p.endsWith("/versions/3")) data = { experience: exp, author, skill_md: "---\nname: fixture\ndescription: fixture\n---\n本机执行参考文本", execution: "caller_local", author_presence_required: false };
    else { await r.fulfill({ status: 404, json: { ok: false, mode: "live", error: { code: "not_found", message: "未实现的测试端点", retryable: false } } }); return; }
    await r.fulfill({ json: { ok: true, mode: "live", data } });
  });
  await page.goto(origin + "/zh/board/");
  return writes;
}
test("本地导入编辑预览保存零上传，准确契约拒绝批准 ID", async ({ page }) => {
  const writes = await setup(page);
  await page.getByRole("button", { name: "整理本地草稿 / 导入 SKILL.md" }).click();
  await page.locator('input[type=file]').setInputFiles({ name: "draft.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(content)) });
  await page.getByRole("button", { name: "预览准确内容" }).click();
  await expect(page.locator(".ex-preview")).toContainText("fixed-content-key");
  await expect(page.locator(".ex-preview")).toContainText("保存草稿后前往登录");
  expect(writes).toEqual([]);
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "保存本地草稿" }).click();
  expect((await saved).suggestedFilename()).toBe("gongzhi-content-draft.json");
  await page.locator(".ex-editor").fill(JSON.stringify({ ...content, payload: { ...content.payload, approval_id: "invalid" } }));
  await page.getByRole("button", { name: "预览准确内容" }).click();
  await expect(page.locator(".cm-dialog [role=status]")).toContainText("不符合共享契约");
  expect(writes).toEqual([]);
});
test("只导入一份 SKILL 文本，脱敏不改稳定请求键，窄屏键盘可操作", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = await setup(page);
  await page.getByRole("button", { name: "整理本地草稿 / 导入 SKILL.md" }).click();
  const source = "---\nname: user-skill\nauthor: 原文作者\nversion: 2\n---\n公开步骤；邮箱 test@example.com；Bearer secret-token";
  await page.locator('input[type=file]').setInputFiles({ name: "SKILL.md", mimeType: "text/markdown", buffer: Buffer.from(source) });
  await expect(page.locator(".ex-editor")).toHaveValue(/原文作者/);
  const before = JSON.parse(await page.locator(".ex-editor").inputValue());
  await page.getByRole("button", { name: "辅助脱敏" }).click();
  const after = JSON.parse(await page.locator(".ex-editor").inputValue());
  expect(after.payload.idempotency_key).toBe(before.payload.idempotency_key);
  expect(after.payload.body).not.toContain("test@example.com");
  expect(after.payload.body).not.toContain("secret-token");
  expect(after.payload.body).toContain("author: 原文作者");
  await page.getByRole("button", { name: "预览准确内容" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".ex-preview")).toContainText("public");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(tmpdir(), "gongzhi-f-draft-mobile.png"), fullPage: true });
  expect(writes).toEqual([]);
});
test("摘要到固定版本下载与反馈草稿不执行不上传，404 明确失败", async ({ page }) => {
  const writes = await setup(page);
  await page.getByRole("button", { name: "查看并借用此版本" }).click();
  await expect(page.locator(".cm-dialog")).toContainText("第 3 版");
  await expect(page.locator(".cm-dialog")).toContainText("作者离线仍可借用");
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载完整引用 JSON" }).click();
  const reference = JSON.parse(await readFile((await (await saved).path())!, "utf8"));
  expect(reference.experience.revision).toBe(3);
  expect(reference.author.id).toBe(author.id);
  await page.getByRole("button", { name: "记录本机使用反馈" }).click();
  await page.getByLabel("如何使用这个固定版本").fill("本机检查了文档");
  await page.getByLabel("实际结果、检查证据与未执行事项").fill("仅做文档检查，未执行附带脚本");
  await page.getByRole("button", { name: "生成本地反馈草稿" }).click();
  const feedback = JSON.parse(await page.locator(".ex-editor").inputValue());
  expect(feedback.action).toBe("experience_feedback"); expect(feedback.payload.revision).toBe(3);
  expect(writes).toEqual([]);
  await page.keyboard.press("Escape");
  await page.route("**/experiences/*/versions/*", r => r.fulfill({ status: 404, json: { ok: false, mode: "live", error: { code: "not_found", message: "固定版本不存在", retryable: false } } }));
  await page.getByRole("button", { name: "查看并借用此版本" }).click();
  await expect(page.locator(".cm-dialog")).toContainText("固定版本不存在");
  await expect(page.getByRole("button", { name: "下载 SKILL.md", exact: true })).toHaveCount(0);
});
