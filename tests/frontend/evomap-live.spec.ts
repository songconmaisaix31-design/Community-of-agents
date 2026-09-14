import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

// 实际托管 3079 未配置 OAuth 的验收：不拦截 HTML/JS/API，不读取任何凭据。
// 旧邮箱登录动作已退役；四项登录后写入回归迁至 evomap-oauth-flows.ts，供 I
// 以真实 start/callback/session + 明确上游 fixture 的隔离 HTTP/PG runner 注册。
const live = process.env.GONGZHI_BROWSER_LIVE === "true";
const BASE = "http://127.0.0.1:3079";
test.skip(!live, "仅在 I 明确托管窗口后设置 GONGZHI_BROWSER_LIVE=true");
const evidence = path.join(tmpdir(), "gongzhi-oauth-unconfigured-F-" + Date.now());
test.beforeAll(() => { if (live) mkdirSync(evidence, { recursive: true }); });
test.beforeEach(async ({ request }) => {
  const config = await request.get(BASE + "/api/gongzhi/config");
  expect(config.status()).toBe(200);
  const cfg = await config.json();
  expect(cfg.mode).toBe("live"); expect(cfg.data.auth.provider).toBe("zhihu");
  expect(cfg.data.auth.available).toBe(false); expect(cfg.data.auth.url).toBeNull();
  expect(cfg.data.auth.public_key).toBeNull();
});
test.afterEach(async ({ page }) => { await page.close(); });
test.afterAll(() => { if (live) console.log("Actual hosted unconfigured OAuth screenshots:", evidence); });

test("实际托管：知乎未配置，无邮箱密码入口且按钮禁用", async ({ page }) => {
  await page.goto(BASE + "/zh/connect/#account");
  await expect(page.getByRole("button", { name: "使用知乎登录", exact: true })).toBeDisabled();
  await expect(page.locator("[data-cm-account]")).toContainText("尚不能使用知乎登录");
  await expect(page.locator("[data-cm-account] input")).toHaveCount(0);
  await page.screenshot({ path: path.join(evidence, "unconfigured-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "使用知乎登录", exact: true }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(evidence, "unconfigured-mobile.png") });
});

test("实际托管：匿名session与start拒绝，无可写会话", async ({ request }) => {
  const session = await request.get(BASE + "/api/gongzhi/auth/session");
  expect(session.status()).toBe(200);
  expect((await session.json()).data.user).toBeNull();
  const start = await request.post(BASE + "/api/gongzhi/auth/zhihu/start", { headers: { Origin: BASE }, data: {} });
  expect(start.status()).toBe(503);
  const result = await start.json(); expect(result.ok).toBe(false); expect(result.error.code).toBe("unavailable");
  const owners = await request.get(BASE + "/api/gongzhi/owners");
  expect(owners.status()).toBe(401); expect((await owners.json()).error.code).toBe("unauthenticated");
});

test("实际托管：无效callback或成功标记不产生已登录状态", async ({ page }) => {
  await page.goto(BASE + "/auth/zhihu/callback?state=invalid-browser-test&code=invalid-browser-test");
  await expect(page.locator(".cm-auth-feedback")).toContainText(/无效|未通过|未配置/);
  expect(new URL(page.url()).searchParams.has("code")).toBe(false);
  await page.goto(BASE + "/zh/connect/?auth=success#account");
  await expect(page.locator(".cm-auth-feedback")).toContainText("尚未确认有效登录");
  await expect(page.getByRole("button", { name: "退出登录", exact: true })).toHaveCount(0);
});

test("实际托管：未登录可整理本地草稿，预览不上传或签发批准", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", req => { if (req.url().startsWith(BASE + "/api/gongzhi/") && req.method() !== "GET") writes.push(req.url()); });
  await page.goto(BASE + "/zh/board/");
  await page.getByRole("button", { name: "整理本地草稿 / 导入 SKILL.md" }).click();
  await page.locator(".ex-editor").fill(JSON.stringify({ action: "publish_experience", payload: { title: "未上传的浏览器验收草稿", body: "本机预览，不发送", applicability: "仅验收", tags: [], sources: [], visibility: "public", idempotency_key: "unuploaded-browser-test" } }));
  await page.getByRole("button", { name: "预览准确内容", exact: true }).click();
  await expect(page.locator(".ex-preview")).toContainText("保存草稿后前往登录");
  await expect(page.getByRole("button", { name: "确认公开并生成 Agent 批准 ID", exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});
