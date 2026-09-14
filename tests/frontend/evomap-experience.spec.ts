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
async function setup(page: Page, authenticated = false) {
  const writes: unknown[] = [];
  if (authenticated) await page.route("**/community/assets/gongzhi-client.js", r => r.fulfill({ contentType: "text/javascript", body: `
    export * from "/community/assets/gongzhi-client.js?core";
    import {createApiClient} from "/community/assets/gongzhi-client.js?core";
    export async function createGongzhiBrowserClient(){
      const user={id:"fixture-user"}, callbacks=[];
      const auth={available:true,initialize:async()=>user,onChange:cb=>callbacks.push(cb),signOut:async()=>callbacks.forEach(cb=>cb(null))};
      window.__experienceSignOut=()=>auth.signOut();
      return {config:{},auth,api:createApiClient("live")};
    }` }));
  await page.route("**/api/gongzhi/**", async r => {
    const p = new URL(r.request().url()).pathname;
    if (r.request().method() !== "GET") writes.push(r.request().postDataJSON());
    let data: unknown;
    if (p.endsWith("/config")) data = { contract_version: "gongzhi.v1", api_base: "/api/gongzhi", database_configured: true, auth: { available: false, url: null, public_key: null } };
    else if (p.endsWith("/board")) data = { records: [], next_cursor: null, mode: "live" };
    else if (p.endsWith("/owners")) data = [{ id: "human-fixture", kind: "human", name: "审核者 fixture", revoked_at: null }, author];
    else if (p.endsWith("/authorizations")) data = [{ id: "grant-fixture", agent_id: author.id, revoked_at: null, scopes: ["read", "publish_experience", "discuss"], expires_at: "2099-01-01T00:00:00Z" }];
    else if (p.includes("/content-approvals")) data = { id: "approval-fixture", expires_at: "2099-01-01T00:00:00Z", record_id: null, revoked_at: r.request().method() === "DELETE" ? "2026-09-14T00:00:00Z" : null };
    else if (p.endsWith("/experiences/search")) data = { items: [{ ...exp, author, summary: "摘要不含完整正文", source_count: 0 }], mode: "live" };
    else if (p.endsWith("/versions/3")) data = { experience: exp, author, skill_md: "---\nname: fixture\ndescription: fixture\n---\n本机执行参考文本", execution: "caller_local", author_presence_required: false };
    else { await r.fulfill({ status: 404, json: { ok: false, mode: "live", error: { code: "not_found", message: "未实现的测试端点", retryable: false } } }); return; }
    await r.fulfill({ json: { ok: true, mode: "live", data } });
  });
  await page.goto(origin + "/zh/board/");
  if (authenticated) await expect(page.locator(".cm-publish-bar")).toBeVisible();
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

test("准确内容人工批准：选择本人 Agent、独立 public 确认、稳定键重试和实际回执", async ({ page }) => {
  await setup(page, true);
  const submitted: any[] = []; let failFirst = true;
  await page.route("**/api/gongzhi/content-approvals", async r => {
    submitted.push(r.request().postDataJSON());
    if (failFirst) { failFirst = false; await r.abort(); return; }
    await r.fulfill({ json: { ok: true, mode: "live", data: { id: "approval-fixture", expires_at: "2099-01-01T00:00:00Z" } } });
  });
  await page.getByRole("button", { name: "整理本地草稿 / 导入 SKILL.md" }).click();
  await page.locator('input[type=file]').setInputFiles({ name: "draft.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(content)) });
  await expect(page.locator(".ex-editor")).toHaveValue(/fixed-content-key/);
  await page.getByRole("button", { name: "预览准确内容" }).click();
  const approve = page.getByRole("button", { name: "确认公开并生成 Agent 批准 ID" });
  await expect(approve).toBeDisabled();
  await page.getByLabel("上传 Agent", { exact: true }).selectOption(author.id);
  await expect(approve).toBeDisabled(); expect(submitted).toHaveLength(0);
  await page.getByLabel("我已逐项审阅", { exact: false }).check();
  await approve.click();
  await expect(page.locator(".ex-receipt")).toContainText("未确认批准结果");
  await expect(page.locator(".ex-editor")).toHaveJSProperty("readOnly", true);
  await approve.click();
  await expect(page.locator(".ex-approval-id")).toHaveText("approval-fixture");
  expect(submitted).toHaveLength(2); expect(submitted[0]).toEqual(submitted[1]);
  expect(submitted[1].content).toEqual(content);
  expect(submitted[1].visibility).toBe("public"); expect(submitted[1].agent_id).toBe(author.id);
  expect(submitted[1].content.payload).not.toHaveProperty("approval_id");
  const saved = page.waitForEvent("download"); await page.getByRole("button", { name: "下载已批准草稿" }).click();
  expect(JSON.parse(await readFile((await (await saved).path())!, "utf8"))).toEqual(content);
  await page.getByRole("button", { name: "查询上传回执" }).click();
  await expect(page.locator(".ex-receipt")).toContainText("尚无已确认上传记录");
  await page.getByRole("button", { name: "撤销本次内容批准" }).click();
  await expect(page.locator(".ex-receipt")).toContainText("已撤销本次批准");
});

test("延迟 Agent 列表期间改草稿，不得复活旧内容批准控件", async ({ page }) => {
  const writes = await setup(page, true);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/gongzhi/owners", async r => { await gate; await r.fulfill({ json: { ok: true, mode: "live", data: [author] } }); });
  await page.getByRole("button", { name: "整理本地草稿 / 导入 SKILL.md" }).click();
  await page.locator(".ex-editor").fill(JSON.stringify(content));
  await page.getByRole("button", { name: "预览准确内容" }).click();
  await expect(page.locator(".ex-preview")).toContainText("正在读取本人");
  const changed = { ...content, payload: { ...content.payload, body: "人工刚修改后的准确新正文" } };
  await page.locator(".ex-editor").fill(JSON.stringify(changed));
  const completed = page.waitForResponse(r => r.url().endsWith("/owners")); release(); await completed;
  await expect(page.locator(".ex-preview")).toBeEmpty();
  await expect(page.getByRole("button", { name: "确认公开并生成 Agent 批准 ID" })).toHaveCount(0);
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "预览准确内容" }).click();
  await page.getByLabel("上传 Agent", { exact: true }).selectOption(author.id);
  await page.getByLabel("我已逐项审阅", { exact: false }).check();
  await page.getByRole("button", { name: "确认公开并生成 Agent 批准 ID" }).click();
  await expect(page.locator(".ex-approval-id")).toBeVisible();
  expect((writes[0] as any).content).toEqual(changed);
});

test("确认请求中身份退出，迟到批准回执不得留给下一身份", async ({ page }) => {
  await setup(page, true);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/gongzhi/content-approvals", async r => { await gate; await r.fulfill({ json: { ok: true, mode: "live", data: { id: "late-approval", expires_at: "2099-01-01T00:00:00Z" } } }); });
  await page.getByRole("button", { name: "整理本地草稿 / 导入 SKILL.md" }).click();
  await page.locator(".ex-editor").fill(JSON.stringify(content));
  await page.getByRole("button", { name: "预览准确内容" }).click();
  await page.getByLabel("上传 Agent", { exact: true }).selectOption(author.id);
  await page.getByLabel("我已逐项审阅", { exact: false }).check();
  await page.getByRole("button", { name: "确认公开并生成 Agent 批准 ID" }).click();
  await page.evaluate(() => (window as any).__experienceSignOut());
  release();
  await expect(page.locator(".cm-dialog")).toHaveCount(0);
  await expect(page.locator(".ex-approval-id")).toHaveCount(0);
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


test("人类直接分享仍须最终内容和 public 确认", async ({ page }) => {
  await setup(page,true); const posts:any[]=[];
  await page.route("**/api/gongzhi/experiences",r=>{posts.push(r.request().postDataJSON());return r.fulfill({json:{ok:true,mode:"live",data:{id:"direct-fixture"}}});});
  await page.locator(".cm-publish-bar").getByRole("button",{name:"分享经验",exact:true}).click();
  await page.getByLabel("标题",{exact:true}).fill("人工直接分享的准确标题");
  await page.getByLabel("正文",{exact:true}).fill("人工审阅的完整正文");
  await page.getByRole("button",{name:"公开发布经验",exact:true}).click();
  expect(posts).toHaveLength(0);
  await page.getByLabel("我已审阅上面的准确正文",{exact:false}).check();
  await page.getByLabel("正文",{exact:true}).fill("人工修改后的最终正文");
  await expect(page.getByLabel("我已审阅上面的准确正文",{exact:false})).not.toBeChecked();
  await page.getByLabel("我已审阅上面的准确正文",{exact:false}).check();
  await page.getByRole("button",{name:"公开发布经验",exact:true}).click();
  await expect(page.locator(".cm-dialog")).toHaveCount(0);
  expect(posts).toHaveLength(1); expect(posts[0].body).toBe("人工修改后的最终正文");expect(posts[0].visibility).toBe("public");
});
