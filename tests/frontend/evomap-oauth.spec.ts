import { test, expect, type BrowserContext } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { WEB_AUTH_ENDPOINTS, type PublicConfig, type WebSession, type WebUser } from "../../lib/gongzhi/contracts";

// 明确 HTTP fixture：实际静态页面 + Core 生成 BrowserAuth，不替换身份 SDK。
// /session、/start 和上游页面均被隔离拦截；不是官方 OAuth 或真实人类授权证据。
let server: Server, origin: string;
const evidence = path.join(tmpdir(), "gongzhi-oauth-fixture-F-" + Date.now());
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  const root = path.resolve("public/community");
  server = createServer(async (req, res) => {
    let p = new URL(req.url || "/", "http://localhost").pathname;
    if (p === "/zh") p += "/";
    if (p.endsWith("/")) p += "index.html";
    if (p.startsWith("/community/")) p = p.slice(10);
    if (!/^\/(zh|assets|brand)\//.test(p)) { res.writeHead(404).end(); return; }
    try { const data = await readFile(path.join(root, p)); res.setHeader("content-type", p.endsWith(".js") ? "text/javascript" : p.endsWith(".css") ? "text/css" : p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream"); res.end(data); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + (server.address() as { port: number }).port;
});
test.afterAll(() => { server.close(); console.log("OAuth HTTP fixture screenshots:", evidence); });
const user: WebUser = { id: "11111111-1111-4111-8111-111111111111", provider: "zhihu", name: "知乎会话姓名（fixture）", avatar_url: "https://picx.zhimg.com/fixture-avatar.svg" };
const owner = { id: "human-fixture", publisher_id: "human-fixture", name: "独立公开称呼", kind: "human", capabilities: [], revoked_at: null, mode: "live" };
async function fixture(context: BrowserContext, options: { available?: boolean; user?: WebUser; expires?: string } = {}) {
  const config: PublicConfig = { contract_version: "gongzhi.v1", api_base: "/api/gongzhi", database_configured: true, auth: { provider: "zhihu", available: options.available ?? true, url: null, public_key: null, endpoints: WEB_AUTH_ENDPOINTS } };
  const state = { session: { user: options.user ?? null, expires_at: options.user ? options.expires ?? "2099-01-01T00:00:00Z" : null } as WebSession, sessionStatus: 200, startStatus: 503, authorizationUrl: "https://openapi.zhihu.com/authorize?fixture=oauth", startCode: "upstream_failed", logoutStatus: 200, writes: [] as { path: string; body: unknown; authorization: string | undefined }[] };
  await context.route("https://picx.zhimg.com/fixture-avatar.svg", r => r.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="#06f"/></svg>' }));
  await context.route("**/api/gongzhi/**", async r => {
    const p = new URL(r.request().url()).pathname;
    if (r.request().method() !== "GET") state.writes.push({ path: p, body: r.request().postDataJSON(), authorization: r.request().headers().authorization });
    let data: unknown;
    const fail = (status: number, code: string) => r.fulfill({ status, json: { ok: false, mode: "live", error: { code, message: "明确 HTTP fixture 拒绝", retryable: status >= 500 } } });
    if (p.endsWith("/config")) data = config;
    else if (p === WEB_AUTH_ENDPOINTS.session) { if (state.sessionStatus !== 200) return fail(state.sessionStatus, "upstream_failed"); data = state.session; }
    else if (p === WEB_AUTH_ENDPOINTS.start) { if (state.startStatus !== 200) return fail(state.startStatus, state.startCode); data = { authorization_url: state.authorizationUrl }; }
    else if (p === WEB_AUTH_ENDPOINTS.logout) { if (state.logoutStatus !== 200) return fail(state.logoutStatus, "upstream_failed"); state.session = { user: null, expires_at: null }; data = { signed_out: true }; }
    else if (p.endsWith("/owners")) data = state.session.user ? [owner] : [];
    else if (p.endsWith("/authorizations")) data = [];
    else if (p.endsWith("/board")) data = { records: [], next_cursor: null, mode: "live" };
    else if (p.endsWith("/experiences/search")) data = { items: [], mode: "live" };
    else if (p.endsWith("/network")) data = { owners: [], needs: [], experiences: [], results: [], decisions: [], graph: { nodes: [], edges: [] }, mode: "live" };
    else return fail(404, "not_found");
    await r.fulfill({ json: { ok: true, mode: "live", data } });
  });
  return state;
}

test("未配置仍可浏览，登录按钮禁用且没有邮箱密码或凭据输入", async ({ page, context }) => {
  const state = await fixture(context, { available: false });
  await page.goto(origin + "/zh/connect/#account");
  await expect(page.getByRole("button", { name: "使用知乎登录", exact: true })).toBeDisabled();
  await expect(page.locator("[data-cm-account]")).toContainText("尚不能使用知乎登录");
  await expect(page.locator('[data-cm-account] input')).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("桌面/390px/键盘：单按钮授权说明，启动失败可辨识且不产生登录", async ({ page, context }) => {
  const state = await fixture(context);
  await page.goto(origin + "/zh/connect/#account");
  const login = page.getByRole("button", { name: "使用知乎登录", exact: true });
  await expect(login).toBeEnabled();
  await expect(page.locator(".cm-login")).toContainText("由你亲自确认授权");
  await expect(page.locator(".cm-login")).toContainText("不会自动导入或上传");
  await expect(page.locator('[data-cm-account] input')).toHaveCount(0);
  await login.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("知乎登录服务暂时无法响应");
  await expect(page.getByRole("button", { name: "退出登录" })).toHaveCount(0);
  expect(state.writes).toEqual([{ path: WEB_AUTH_ENDPOINTS.start, body: {}, authorization: undefined }]);
  await page.screenshot({ path: path.join(evidence, "login-desktop-fixture.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await login.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(evidence, "login-mobile-fixture.png") });
});

test("auth=success不等于已登录；提示清query但保留其他参数与锚点", async ({ page, context }) => {
  await fixture(context);
  await page.goto(origin + "/zh/connect/?auth=success&keep=1&code=fixture-only#account");
  await expect(page.locator(".cm-auth-feedback")).toContainText("尚未确认有效登录");
  await expect(page.getByRole("button", { name: "退出登录" })).toHaveCount(0);
  await expect(page).toHaveURL(origin + "/zh/connect/?keep=1&view=live#account");
  await page.getByRole("button", { name: "关闭提示" }).click();
  await expect(page.locator(".cm-auth-feedback")).toHaveCount(0);
  await page.reload(); await expect(page.locator(".cm-auth-feedback")).toHaveCount(0);
});

test("取消、过期、未配置、上游拒绝均为安全返回提示", async ({ page, context }) => {
  await fixture(context);
  for (const [code, message] of Object.entries({ cancelled: "已取消知乎授权", invalid_request: "无效或已过期", unauthenticated: "未通过或已失效", unavailable: "尚未配置或当前不可用", upstream_failed: "本次未完成登录", "unknown-fixture-value": "未能确认这次知乎授权结果" })) {
    await page.goto(origin + "/zh?auth=" + code);
    await expect(page.locator(".cm-auth-feedback")).toContainText(message);
    await expect(page.locator(".cm-auth-feedback")).not.toContainText("unknown-fixture-value");
    await expect(page).toHaveURL(origin + "/zh?view=live");
  }
});

test("会话可信姓名头像与公开称呼分开，无JS token也可加载本人授权", async ({ page, context }) => {
  await fixture(context, { user });
  await page.goto(origin + "/zh/connect/?auth=success#account");
  await expect(page.locator(".cm-auth-feedback")).toContainText("已确认登录");
  await expect(page.locator(".cm-account-head strong")).toHaveText(user.name!);
  await expect(page.locator(".cm-account-avatar")).toHaveAttribute("src", user.avatar_url!);
  await expect(page.locator("[data-cm-account]")).toContainText("公开发言身份：独立公开称呼");
  await expect(page.locator("[data-cm-grants]")).toContainText("签发一份有限授权");
  const stored = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  // pageshow 与 initialize 可合并回读；无存储或仅刷新信号都合法，身份/凭据一律不允许。
  for (const [key, value] of Object.entries(stored)) {
    expect(key).toBe("gongzhi.live.auth.changed.v2");
    expect(value).toMatch(/^\d+:0\.\d+$/);
  }
  expect(JSON.stringify(stored)).not.toContain(user.id);
});

test("打开授权页尚未登录：实际SDK导航仅命中fixture上游", async ({ page, context }) => {
  const state = await fixture(context); state.startStatus = 200;
  let visits = 0;
  await context.route("https://openapi.zhihu.com/**", r => { visits++; return r.fulfill({ contentType: "text/html; charset=utf-8", body: "<title>明确 HTTP fixture</title><p>模拟上游授权页面，未执行真实授权</p>" }); });
  await page.goto(origin + "/zh/connect/#account");
  await page.getByRole("button", { name: "使用知乎登录", exact: true }).click();
  await expect(page).toHaveURL("https://openapi.zhihu.com/authorize?fixture=oauth");
  expect(visits).toBe(1); expect(state.session.user).toBeNull();
  await page.goto(origin + "/zh/connect/?auth=success#account");
  await expect(page.locator(".cm-auth-feedback")).toContainText("尚未确认有效登录");
  await expect(page.getByRole("button", { name: "退出登录" })).toHaveCount(0);
});

test("session 503不显示旧身份或可写控件，公开页面仍可打开", async ({ page, context }) => {
  const state = await fixture(context, { user }); state.sessionStatus = 503;
  await page.goto(origin + "/zh/connect/#account");
  await expect(page.locator("[data-cm-account]")).toContainText("暂时无法确认登录状态");
  await expect(page.getByRole("button", { name: "签发授权", exact: true })).toHaveCount(0);
  expect(state.writes).toEqual([]);
  await page.goto(origin + "/zh/board/");
  await expect(page.getByRole("button", { name: "整理本地草稿 / 导入 SKILL.md" })).toBeVisible();
  await expect(page.locator(".cm-publish-bar")).toHaveCount(0);
});

test("共享SDK跨标签退出清理未上传草稿与发布权限", async ({ page, context }) => {
  const state = await fixture(context, { user });
  await page.goto(origin + "/zh/board/");
  await expect(page.locator(".cm-publish-bar")).toBeVisible();
  await page.getByRole("button", { name: "整理本地草稿 / 导入 SKILL.md" }).click();
  await page.getByLabel("编辑完整草稿 JSON（action 与 payload）").fill('{"private":"未上传fixture草稿"}');
  const tab = await context.newPage(); await tab.goto(origin + "/zh/connect/#account");
  await tab.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page.locator(".cm-dialog")).toHaveCount(0);
  await expect(page.locator(".cm-publish-bar")).toHaveCount(0);
  await page.getByRole("button", { name: "整理本地草稿 / 导入 SKILL.md" }).click();
  await expect(page.getByLabel("编辑完整草稿 JSON（action 与 payload）")).not.toHaveValue(/未上传fixture草稿/);
  expect(state.writes.map(w => w.path)).toEqual([WEB_AUTH_ENDPOINTS.logout]);
  await tab.close();
});

test("退出请求失败明确保留未确认状态，不显示退出成功", async ({ page, context }) => {
  const state = await fixture(context, { user }); state.logoutStatus = 503;
  await page.goto(origin + "/zh/connect/#account");
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page.locator("[data-cm-account] .cm-form-error")).toContainText("退出失败");
  await expect(page.getByRole("button", { name: "使用知乎登录", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "签发授权", exact: true })).toHaveCount(0);
  expect(state.writes.map(w => w.path)).toEqual([WEB_AUTH_ENDPOINTS.logout]);
  await page.getByRole("button", { name: "重新确认登录状态", exact: true }).click();
  await expect(page.locator("[data-cm-account] .cm-form-error")).toContainText("服务器会话仍有效");
  state.logoutStatus = 200;
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page.getByRole("button", { name: "使用知乎登录", exact: true })).toBeEnabled();
});

test("共享SDK拒绝错误授权域名，不导航、不显示登录成功", async ({ page, context }) => {
  const state = await fixture(context); state.startStatus = 200;
  state.authorizationUrl = "https://www.zhihu.com/account/authorize?fixture=wrong-endpoint";
  let visits = 0; await context.route("https://www.zhihu.com/**", r => { visits++; return r.abort(); });
  await page.goto(origin + "/zh/connect/#account");
  await page.getByRole("button", { name: "使用知乎登录", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("知乎登录服务暂时无法响应");
  expect(visits).toBe(0); await expect(page).toHaveURL(origin + "/zh/connect/?view=live#account");
});

test("会话到期由实际SDK清理可写状态和未上传草稿", async ({ page, context }) => {
  await page.clock.install();
  await fixture(context, { user, expires: new Date(Date.now() + 60000).toISOString() });
  await page.goto(origin + "/zh/board/");
  await expect(page.locator(".cm-publish-bar")).toBeVisible();
  await page.getByRole("button", { name: "整理本地草稿 / 导入 SKILL.md" }).click();
  await page.locator(".ex-editor").fill("到期后应清理的本机fixture草稿");
  await page.clock.fastForward(61000);
  await expect(page.locator(".cm-dialog")).toHaveCount(0);
  await expect(page.locator(".cm-publish-bar")).toHaveCount(0);
  await page.getByRole("button", { name: "整理本地草稿 / 导入 SKILL.md" }).click();
  await expect(page.locator(".ex-editor")).not.toHaveValue(/到期后应清理/);
});

test("焦点回读同一可信用户保留草稿；服务失联即撤下可写状态", async ({ page, context }) => {
  const state = await fixture(context, { user });
  await page.goto(origin + "/zh/board/");
  await expect(page.locator(".cm-publish-bar")).toBeVisible();
  await page.getByRole("button", { name: "整理本地草稿 / 导入 SKILL.md" }).click();
  await page.locator(".ex-editor").fill("同一身份应保留的本机fixture草稿");
  const refresh = page.waitForResponse(r => new URL(r.url()).pathname === WEB_AUTH_ENDPOINTS.session);
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await refresh;
  await expect(page.locator(".ex-editor")).toHaveValue("同一身份应保留的本机fixture草稿");
  state.sessionStatus = 503;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".cm-dialog")).toHaveCount(0);
  await expect(page.locator(".cm-publish-bar")).toHaveCount(0);
});
