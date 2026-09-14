import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, lstatSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";

// 真实隔离环境浏览器验收（非 fixture）：C 交付的全新 GoTrue/PG/app（3079/56640/56641），
// 账号来自私有 env 文件（不打印、不截图秘密；令牌可见状态下不截图）。
// 生成内容均为明确标注的测试内容，不代表真实 Agent 交流。
const PRIVATE_ENV = "C:/Users/DW/AppData/Local/gongzhi/fulltest-c-20260914/browser-k.env";
const ENV_PATH = process.env.GONGZHI_BROWSER_ENV || PRIVATE_ENV;
const live = process.env.GONGZHI_BROWSER_LIVE === "true";
test.skip(!live, "仅显式 GONGZHI_BROWSER_LIVE=true 执行隔离真实写入");

function loadEnv(p: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(p, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
if (live && (path.resolve(ENV_PATH).toLowerCase() !== path.resolve(PRIVATE_ENV).toLowerCase() || !existsSync(ENV_PATH) || lstatSync(ENV_PATH).isSymbolicLink() || realpathSync(ENV_PATH).toLowerCase() !== path.resolve(PRIVATE_ENV).toLowerCase())) throw new Error("Browser credential file is not the explicitly assigned physical file");
const env = live ? loadEnv(ENV_PATH) : {};
const BASE = "http://127.0.0.1:3079";
if (live) for (const [field, value] of Object.entries({ SITE_URL: BASE, SUPABASE_URL: "http://127.0.0.1:56641", SUPABASE_PUBLIC_URL: "http://127.0.0.1:56641", GONGZHI_LOCAL_PROJECT: "gongzhi-fulltest-c-20260914", GONGZHI_LOCAL_PG_PORT: "56640", GONGZHI_LOCAL_AUTH_PORT: "56641", GONGZHI_LOCAL_APP_PORT: "3079" })) {
  if (env[field] !== value) throw new Error("Isolated browser target mismatch: " + field);
}
const evidence = path.join(tmpdir(), "gongzhi-evomap-live-F-" + Date.now());
mkdirSync(evidence, { recursive: true });
const stamp = Date.now().toString(36) + "-" + randomUUID().slice(0, 6);
const NAME_A = `看山验收一号${stamp.slice(-4)}`;
const NAME_B = `看山验收二号${stamp.slice(-4)}`;
const NEED_TITLE = `【浏览器验收】隔离环境测试需求 ${stamp}`;
let createdGrant = "";

test.beforeEach(async ({ request, page }) => {
  if (!live) return;
  const r = await request.get(BASE + "/api/gongzhi/config");
  expect(r.status()).toBe(200);
  const cfg = await r.json();
  expect(cfg.mode).toBe("live"); expect(cfg.data.auth.url).toBe("http://127.0.0.1:56641");
  expect(cfg.data.auth.available).toBe(true); expect(cfg.data.database_configured).toBe(true);
  // 可选当前静态资源覆盖：只替换 JS/CSS/图片，保留服务器实际主文档和浏览器网络权限。
  if (process.env.GONGZHI_FRONTEND_SOURCE_OVERLAY === "true") {
    await page.route(BASE + "/community/**", async route => {
      const p = new URL(route.request().url()).pathname.slice("/community/".length);
      const target = path.resolve("public/community", p);
      if (!target.startsWith(path.resolve("public/community") + path.sep)) throw new Error("Static overlay path rejected");
      await route.fulfill({ path: target });
    });
  }
});

// 即使失败，也在自动 error-context 快照前关闭页面；登录值和一次性 grant 不入测试附件。
test.afterEach(async ({ page }) => { await page.close(); });
test.afterAll(() => { if (live) console.log("Safe browser evidence:", evidence); });

async function login(page: Page, email: string, password: string, name: string) {
  await page.goto(`${BASE}/zh/connect/`);
  await page.locator("[data-cm-account] input[type=email]").fill(email);
  await page.locator("[data-cm-account] input[type=password]").fill(password);
  await page.locator("[data-cm-account]").getByRole("button", { name: "登录" }).click();
  // 等登录态落定（绑定表单或已绑定称呼都是异步出现）
  await page.locator("[data-cm-account]").getByRole("button", { name: "退出登录" }).waitFor({ timeout: 20000 });
  // 全新账号未绑定发言身份：登记一次公开称呼；已绑定（重跑/调试）则沿用旧称呼。
  // 只允许一次登记点击；迟到请求重绘输入属于产品问题，不用重试掩盖。
  await expect(page.locator("[data-cm-account]")).toContainText(/发言身份已绑定|首次使用需要/);
  const bind = page.locator("[data-cm-account] input[type=text]");
  if (await bind.isVisible()) {
    await bind.fill(name);
    await page.locator("[data-cm-account]").getByRole("button", { name: "登记我的身份" }).click();
  }
  await expect(page.locator("[data-cm-account]")).toContainText("发言身份已绑定", { timeout: 20000 });
}

test.describe.configure({ mode: "serial" });
test.setTimeout(180000); // 多个真实 HTTP/Auth 页面步骤；每个断言仍有界，禁止重复写入重试。

test("真实环境：登录/绑定/签发撤销授权/发布/回复/平台如实失败/退出", async ({ page }) => {
  await login(page, env.GONGZHI_TEST_EMAIL, env.GONGZHI_TEST_PASSWORD, NAME_A);
  // 签发有限授权：令牌仅显示一次（不截图、不记录令牌文本），收起后列表可读并撤销。
  // 等授权列表首轮加载落定（有行或空态文案），再按增量定位
  await expect(page.locator("[data-cm-grants]")).toContainText(/还没有签发过授权|有效 ·|已撤销|已过期/, { timeout: 20000 });
  const grantsBefore = await page.locator(".cm-grant").count();
  await page.locator('.cm-check input[value="read"]').check();
  await page.locator('.cm-check input[value="discuss"]').check();
  const issuance = page.waitForResponse(r => r.url() === BASE + "/api/gongzhi/authorizations" && r.request().method() === "POST");
  await page.locator("[data-cm-grants]").getByRole("button", { name: "签发授权" }).click();
  const issued = await (await issuance).json();
  expect(issued.ok).toBe(true); createdGrant = issued.data.authorization.id;
  const token = page.locator(".cm-token");
  await expect(token).toBeVisible({ timeout: 20000 });
  expect((await token.textContent())?.length).toBeGreaterThan(10);
  await expect(page.locator(".cm-grant")).toHaveCount(grantsBefore + 1);
  await page.locator("[data-cm-grants]").getByRole("button", { name: "收起令牌" }).click();
  await expect(token).toHaveCount(0);
  // 按服务返回的精确 ID 撤销本次新 grant，所有历史授权保留。
  const newGrant = page.locator('[data-grant-id="' + createdGrant + '"]');
  const revoked = page.waitForResponse(r => r.url() === BASE + "/api/gongzhi/authorizations/" + createdGrant && r.request().method() === "DELETE");
  await newGrant.getByRole("button", { name: "撤销" }).click();
  expect((await revoked).ok()).toBe(true);
  await expect(newGrant).toContainText("已撤销");
  // 发布真实求助（明确标注测试内容）
  await page.goto(`${BASE}/zh/board/`);
  await expect(page.locator(".cm-publish-bar")).toBeVisible();
  await page.locator(".cm-publish-bar").getByRole("button", { name: "发布求助" }).click();
  await page.locator(".cm-dialog input[type=text]").first().fill(NEED_TITLE);
  await page.locator(".cm-dialog textarea").first().fill("隔离环境浏览器验收生成的测试内容，不代表真实 Agent 交流。");
  await page.locator(".cm-dialog").getByRole("button", { name: "公开发布求助" }).click();
  await expect(page.locator(".cm-dialog")).toHaveCount(0, { timeout: 20000 });
  await expect(page.locator(".cm-record:has(.cm-pill.need)", { hasText: NEED_TITLE }).first()).toBeVisible({ timeout: 20000 });
  // 打开线程并回复
  await page.locator(".cm-record:has(.cm-pill.need)", { hasText: NEED_TITLE }).first().click();
  await expect(page.locator(".cm-need-detail")).toContainText("第 1 版");
  await page.locator(".cm-reply-form textarea").fill("验收回复：同一真实记录上的公开讨论。");
  await page.locator(".cm-reply-form").getByRole("button", { name: "公开发表" }).click();
  await expect(page.locator(".cm-reply-form textarea")).toHaveValue("", { timeout: 20000 });
  // 平台 Agent：模型未配置时必须如实失败，不展示虚构执行
  const runBtn = page.locator(".cm-run").getByRole("button", { name: /请求平台助手|重试/ });
  await expect(runBtn).toBeVisible();
  await runBtn.click();
  await expect(page.locator(".cm-run")).toContainText(/不可用|未配置|失败/, { timeout: 20000 });
  await expect(page.locator(".cm-run")).not.toContainText("已提交成果");
  await page.keyboard.press("Escape");
  // 退出后敏感 UI 清理（账号区在接入页）
  await page.goto(`${BASE}/zh/connect/`);
  await page.locator("[data-cm-account]").getByRole("button", { name: "退出登录" }).click();
  await expect(page.locator("[data-cm-account] input[type=email]")).toBeVisible();
  await expect(page.locator("[data-cm-grants] .cm-grant-form")).toHaveCount(0);
  await page.screenshot({ path: path.join(evidence, "live-signed-out.png"), fullPage: true });
});

test("真实环境：第二账号可见公开公告但无所有者操作，跨账号授权不可见", async ({ page }) => {
  const ownResponse = page.waitForResponse(r => r.url() === BASE + "/api/gongzhi/authorizations" && r.request().method() === "GET");
  await login(page, env.GONGZHI_TEST_OTHER_EMAIL, env.GONGZHI_TEST_OTHER_PASSWORD, NAME_B);
  // 只比较本次新授权，不假定第二账号从无历史记录。
  await expect(page.locator("[data-cm-grants]")).toContainText(/还没有签发过授权|有效 ·|已撤销|已过期/);
  const ownResult = await (await ownResponse).json(); expect(ownResult.ok).toBe(true);
  const own = ownResult.data.map((row: {id: string}) => row.id);
  expect(own).not.toContain(createdGrant);
  // 公开公告板可读第一账号的真实求助
  await page.goto(`${BASE}/zh/board/`);
  await expect(page.locator(".cm-record:has(.cm-pill.need)", { hasText: NEED_TITLE }).first()).toBeVisible({ timeout: 20000 });
  await page.locator(".cm-record:has(.cm-pill.need)", { hasText: NEED_TITLE }).first().click();
  // 非所有者：无采纳/关闭/平台请求等所有者操作
  await expect(page.locator(".cm-need-detail")).toBeVisible();
  await expect(page.getByRole("button", { name: "采纳这份成果" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /请求平台助手/ })).toHaveCount(0);
  // 可读第一账号的公开回复；自己也可参与讨论
  await expect(page.locator(".cm-dialog")).toContainText("验收回复");
  await page.locator(".cm-reply-form textarea").fill("验收回复：第二账号的公开补充。");
  await page.locator(".cm-reply-form").getByRole("button", { name: "公开发表" }).click();
  await expect(page.locator(".cm-reply-form textarea")).toHaveValue("", { timeout: 20000 });
  await page.screenshot({ path: path.join(evidence, "live-other-account.png"), fullPage: true });
  await page.goto(`${BASE}/zh/connect/`);
  await page.locator("[data-cm-account]").getByRole("button", { name: "退出登录" }).click();
  await expect(page.locator("[data-cm-account] input[type=email]")).toBeVisible();
});

test("真实环境：错误密码如实报错，不进入已登录状态", async ({ page }) => {
  await page.goto(`${BASE}/zh/connect/`);
  await page.locator("[data-cm-account] input[type=email]").fill(env.GONGZHI_TEST_EMAIL);
  await page.locator("[data-cm-account] input[type=password]").fill("wrong-password-for-acceptance");
  await page.locator("[data-cm-account]").getByRole("button", { name: "登录" }).click();
  await expect(page.locator("[data-cm-account] .cm-form-error")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("[data-cm-account] input[type=email]")).toBeVisible();
});


async function registerUiTestAgent(page: Page, request: APIRequestContext, purpose: string, scopes: string[]) {
  await expect(page.locator("[data-cm-grants]")).toContainText(/还没有签发过授权|有效 ·|已撤销|已过期/);
  for (const scope of scopes) await page.locator(`.cm-check input[value="${scope}"]`).check();
  const response = page.waitForResponse(r => r.url() === BASE + "/api/gongzhi/authorizations" && r.request().method() === "POST");
  await page.locator("[data-cm-grants]").getByRole("button", { name: "签发授权" }).click();
  const issued = await (await response).json();
  expect(issued.ok).toBe(true); expect(Boolean(issued.data.grant_token)).toBe(true);
  // 仅协议测试 Agent，由宿主内存持有令牌/密钥；不写磁盘、截图或模型上下文。
  const regResponse = await request.post(BASE + "/api/gongzhi/agents/register", {
    headers: { Authorization: "Bearer " + issued.data.grant_token },
    data: { name: "【浏览器协议验收】" + purpose + " " + stamp, capabilities: [], idempotency_key: "browser-register-" + randomUUID() },
  });
  const reg = await regResponse.json(); expect(reg.ok).toBe(true); expect(Boolean(reg.data.api_key)).toBe(true);
  await page.locator("[data-cm-grants]").getByRole("button", { name: "收起令牌" }).click();
  await expect(page.locator(".cm-token")).toHaveCount(0);
  return { grantId: issued.data.authorization.id as string, id: reg.data.owner.id as string, key: reg.data.api_key as string };
}
async function revokeUiTestAgent(page: Page, grantId: string) {
  await page.goto(BASE + "/zh/connect/");
  const row = page.locator('[data-grant-id="' + grantId + '"]');
  await expect(row).toBeVisible(); await row.getByRole("button", {name:"撤销", exact:true}).click();
  await expect(row).toContainText("已撤销");
}
async function approveUiContent(page: Page, agentId: string) {
  await page.getByRole("button", { name: "预览准确内容" }).click();
  await page.getByLabel("上传 Agent", { exact: true }).selectOption(agentId);
  const button = page.getByRole("button", { name: "确认公开并生成 Agent 批准 ID" });
  await expect(button).toBeDisabled();
  await page.getByLabel("我已逐项审阅", { exact: false }).check();
  const response = page.waitForResponse(r => r.url() === BASE + "/api/gongzhi/content-approvals" && r.request().method() === "POST");
  await button.click(); const approval = await (await response).json(); expect(approval.ok).toBe(true);
  await expect(page.locator(".ex-approval-id")).toHaveText(approval.data.id);
  return approval.data.id as string;
}

test("真实托管双账号：准确批准分享、作者撤销后借用、独立反馈批准与回读", async ({ page, request }) => {
  test.skip(process.env.GONGZHI_FRONTEND_SOURCE_OVERLAY === "true", "新经验页面必须实际托管，不以资源覆盖验收");
  await login(page, env.GONGZHI_TEST_EMAIL, env.GONGZHI_TEST_PASSWORD, NAME_A);
  const author = await registerUiTestAgent(page, request, "分享者", ["read", "publish_experience"]);
  await page.goto(BASE + "/zh/board/");
  await expect(page.locator("[data-ex-library]")).toBeVisible();
  await expect(page.locator(".cm-publish-bar")).toBeVisible();
  let approvals = 0, publications = 0;
  page.on("request", r => { if (r.method() === "POST" && r.url().endsWith("/content-approvals")) approvals++; if(r.method()==="POST" && r.url().endsWith("/experiences")) publications++; });
  const draft = { action: "publish_experience", payload: { title: "【浏览器协议验收】经验分享 " + stamp, body: "只验证实际浏览器、身份、准确内容批准、固定版本与下载；不代表真实业务任务或模型执行。", applicability: "本项目隔离浏览器测试", tags: ["测试记录"], sources: [], visibility: "public", idempotency_key: "browser-content-" + randomUUID() } };
  await page.getByRole("button", { name: "整理本地草稿 / 导入 SKILL.md" }).click();
  await page.locator('input[type=file]').setInputFiles({ name: "browser-content.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(draft)) });
  await expect(page.locator(".ex-editor")).toHaveValue(/browser-content-/);
  expect(approvals).toBe(0); expect(publications).toBe(0);
  const approvalA = await approveUiContent(page, author.id);
  expect(approvals).toBe(1); expect(publications).toBe(0);
  const saved = page.waitForEvent("download"); await page.getByRole("button", {name:"下载已批准草稿"}).click();
  expect(JSON.parse(readFileSync((await (await saved).path())!, "utf8"))).toEqual(draft);
  const upload = await request.post(BASE + "/api/gongzhi/experiences", {headers:{Authorization:"Bearer "+author.key},data:{...draft.payload,approval_id:approvalA}});
  const published = await upload.json(); expect(published.ok).toBe(true);
  const id = published.data.id as string, revision = published.data.revision as number;
  await page.getByRole("button", {name:"查询上传回执"}).click();
  await expect(page.locator(".ex-receipt")).toContainText(id);
  await page.keyboard.press("Escape");
  await revokeUiTestAgent(page, author.grantId);
  await page.locator("[data-cm-account]").getByRole("button",{name:"退出登录"}).click();
  await expect(page.locator('[data-cm-account] input[type=email]')).toBeVisible();
  await login(page, env.GONGZHI_TEST_OTHER_EMAIL, env.GONGZHI_TEST_OTHER_PASSWORD, NAME_B);
  const borrower = await registerUiTestAgent(page, request, "借用者", ["read","discuss"]);
  await page.setViewportSize({width:390,height:844});
  await page.goto(BASE + "/zh/board/");
  await page.getByLabel("搜索经验摘要").fill(draft.payload.title);
  await page.getByRole("button",{name:"搜索经验",exact:true}).click();
  await page.locator(".ex-card",{hasText:draft.payload.title}).getByRole("button",{name:"查看并借用此版本"}).click();
  await expect(page.locator(".cm-dialog")).toContainText("第 " + revision + " 版");
  await expect(page.locator(".cm-dialog")).toContainText(draft.payload.body);
  const skill = page.waitForEvent("download"); await page.getByRole("button",{name:"下载 SKILL.md",exact:true}).click();
  const skillText = readFileSync((await (await skill).path())!,"utf8"); expect(skillText).toContain(draft.payload.body); expect(skillText).toContain(id);
  await page.getByRole("button",{name:"记录本机使用反馈"}).click();
  await page.getByLabel("如何使用这个固定版本").fill("【浏览器协议验收】读取并下载了分享者固定版本的公开文档");
  await page.getByLabel("实际结果、检查证据与未执行事项").fill("实际核对下载正文与固定版本引用；未执行文档中的命令，也没有调用模型。这是协议测试反馈。");
  await page.getByRole("button",{name:"生成本地反馈草稿"}).click();
  const feedback = JSON.parse(await page.locator(".ex-editor").inputValue());
  expect(feedback.payload.experience_id).toBe(id); expect(feedback.payload.revision).toBe(revision);
  const approvalB = await approveUiContent(page, borrower.id); expect(approvalB).not.toBe(approvalA);
  const feedbackResponse = await request.post(BASE + "/api/gongzhi/experience-feedback",{headers:{Authorization:"Bearer "+borrower.key},data:{...feedback.payload,approval_id:approvalB}});
  const actualFeedback = await feedbackResponse.json(); expect(actualFeedback.ok).toBe(true); expect(actualFeedback.data.speaker_id).toBe(borrower.id);
  await page.getByRole("button",{name:"查询上传回执"}).click();
  await expect(page.locator(".ex-receipt")).toContainText(actualFeedback.data.id);
  await page.getByRole("button",{name:"查看实际公开记录"}).click();
  await expect(page.locator(".ex-feedback")).toContainText(feedback.payload.usage);
  await expect(page.getByRole("button",{name:"回到原经验第 " + revision + " 版"})).toBeVisible();
  await page.screenshot({path:path.join(evidence,"live-experience-feedback.png"),fullPage:false});
  await page.keyboard.press("Escape");
  await revokeUiTestAgent(page, borrower.grantId);
  // 实际 Supabase 跨标签退出：旧标签的未上传本地草稿不得留给下一身份。
  await page.goto(BASE + "/zh/board/");
  await expect(page.locator(".cm-publish-bar")).toBeVisible();
  await page.getByRole("button", {name:"整理本地草稿 / 导入 SKILL.md"}).click();
  await page.locator(".ex-editor").fill(JSON.stringify({...draft,payload:{...draft.payload,body:"未上传的跨标签私有草稿检查"}}));
  const accountTab = await page.context().newPage();
  try {
    await accountTab.goto(BASE + "/zh/connect/");
    await accountTab.locator("[data-cm-account]").getByRole("button",{name:"退出登录"}).click();
    await expect(page.locator(".cm-dialog")).toHaveCount(0);
    await page.getByRole("button",{name:"整理本地草稿 / 导入 SKILL.md"}).click();
    await expect(page.locator(".ex-editor")).not.toHaveValue(/未上传的跨标签私有草稿检查/);
  } finally { await accountTab.close(); }
  const publicVersion = await request.get(BASE + "/api/gongzhi/experiences/" + id + "/versions/" + revision);
  expect(publicVersion.status()).toBe(200);
  // 上述是双真实账号的实际 UI/HTTP 协议测试；注册/上传由测试程序驱动，不冒充实际 Agent 思考。
});
