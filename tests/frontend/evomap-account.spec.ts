import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";

// 登录/授权/发布/决策/平台回执的浏览器 UI 测试。
// 全部为 HTTP fixture 与测试替身 gongzhi-client：只验证页面行为与请求形状，
// 不代表真实 Auth/数据库/Agent 执行；真实链验收由 C/I 准备环境后另行进行。
const evidence = path.join(tmpdir(), "gongzhi-k-live");
mkdirSync(evidence, { recursive: true });
const repo = path.resolve(process.cwd(), "tests/frontend", "../..");
const root = path.join(repo, "public/community");
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".gif": "image/gif", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".txt": "text/plain" };

let server: Server | undefined, origin: string;
test.beforeAll(async () => {
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

test("公开线程先于本人身份恢复可见，身份就绪后补齐回复入口", async ({ page }) => {
  await stubBoard(page); await login(page);
  await page.route("**/api/gongzhi/owners", async r => { await new Promise(resolve => setTimeout(resolve, 800)); await r.fulfill({ json: { ok: true, mode: "live", data: [humanOwner] } }); });
  await page.goto(`${origin}/zh/board/`);
  await page.locator(".cm-record").first().click();
  await expect(page.locator(".cm-reply-form textarea")).toBeVisible();
});

test("同账号会话刷新不得清空尚未提交的身份称呼", async ({ page }) => {
  await stubClientModule(page);
  await page.route("**/api/gongzhi/owners", r => r.fulfill({ json: { ok: true, mode: "live", data: [] } }));
  await page.goto(`${origin}/zh/connect/`);
  await page.locator('[data-cm-account] input[type=email]').fill("fixture@example.com");
  await page.locator('[data-cm-account] input[type=password]').fill("fixture-password");
  const owners = page.waitForResponse(r => r.url().endsWith("/owners"));
  await page.locator('[data-cm-account]').getByRole("button", { name: "登录", exact: true }).click();
  await owners;
  const name = page.locator('[data-cm-account] input[type=text]');
  await name.fill("只点一次登记的公开称呼");
  await page.evaluate(() => (window as any).__fixtureRefresh());
  await expect(name).toHaveValue("只点一次登记的公开称呼");
});

// 测试替身：实现 C 约定的 createGongzhiBrowserClient() → {config, auth, api}。
// api 直接打被拦截的 /api/gongzhi/**，用于核对页面发出的真实请求形状。
const STUB_CLIENT = `
export { createApiClient, CreateContentApprovalSchema } from "/community/assets/gongzhi-client.js?core";
export class ApiClientError extends Error {
  constructor(error, status) { super(error.message); this.error = error; this.status = status || 0; }
}
async function req(path, method, input) {
  const r = await fetch(path, { method: method || "GET", headers: { "Content-Type": "application/json" }, body: input === undefined ? undefined : JSON.stringify(input) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.mode !== "live" || !j.ok) throw new ApiClientError((j && j.error) || { code: "unknown", message: "请求失败（" + r.status + "）。", retryable: true }, r.status);
  return j.data;
}
export async function createGongzhiBrowserClient() {
  let user = null; const cbs = [];
  const auth = {
    available: true,
    initialize: async () => { if (!user) { try { const e = localStorage.getItem("fixture-user"); if (e) user = { email: e }; } catch (_) {} } return user; },
    signIn: async (email, password) => {
      if (password === "bad") throw new ApiClientError({ code: "unauthenticated", message: "登录信息无效，请重试。", retryable: false });
      user = { email }; try { localStorage.setItem("fixture-user", email); } catch (_) {}
      cbs.forEach(c => c(user)); return user;
    },
    signOut: async () => { user = null; try { localStorage.removeItem("fixture-user"); } catch (_) {} cbs.forEach(c => c(null)); },
    getAccessToken: () => (user ? "fixture-token" : undefined),
    onChange: cb => { cbs.push(cb); return () => {}; },
    dispose: () => {},
  };
  try { window.__fixtureSignOut = () => auth.signOut(); window.__fixtureRefresh = () => cbs.forEach(c => c(user)); } catch (_) {}
  const api = {
    listOwners: () => req("/api/gongzhi/owners"),
    bindOwner: i => req("/api/gongzhi/owners", "POST", i),
    createAuthorization: i => req("/api/gongzhi/authorizations", "POST", i),
    listAuthorizations: () => req("/api/gongzhi/authorizations"),
    revokeAuthorization: id => req("/api/gongzhi/authorizations/" + id, "DELETE"),
    createNeed: i => req("/api/gongzhi/needs", "POST", i),
    publishExperience: i => req("/api/gongzhi/experiences", "POST", i),
    postReply: i => req("/api/gongzhi/discussions", "POST", i),
    readThread: id => req("/api/gongzhi/threads/" + id),
    readRecord: id => req("/api/gongzhi/records/" + id),
    readNeed: id => req("/api/gongzhi/needs/" + id),
    readExperience: id => req("/api/gongzhi/experiences/" + id),
    decideResult: (id, i) => req("/api/gongzhi/needs/" + id + "/decisions", "POST", i),
    closeNeed: (id, i) => req("/api/gongzhi/needs/" + id + "/close", "POST", i),
    startRun: i => req("/api/gongzhi/runs", "POST", i),
    readRun: id => req("/api/gongzhi/runs/" + id),
    cancelRun: id => req("/api/gongzhi/runs/" + id, "DELETE"),
  };
  return { config: { contract_version: "gongzhi.v1" }, auth, api };
}
`;

const time = "2026-09-13T00:00:00.000Z";
const humanOwner = { id: "human-owner", publisher_id: "human-owner", kind: "human", name: "阿治", capabilities: [], revoked_at: null, last_seen_at: null, created_at: time, mode: "live" };
const needRecord = { id: "n1", thread_id: "n1", reply_to_id: null, kind: "need", title: "第一次办 AI 体验活动，怎样安排节奏？", body: "想为社团组织一场小型 AI 体验活动。", speaker_id: "human-owner", owner_id: "human-owner", speaker: humanOwner, need_revision: 2, created_at: time, mode: "live" };
const needDetail = {
  need: { id: "n1", owner_id: "human-owner", publisher_id: "human-owner", title: needRecord.title, body: needRecord.body, constraints: "只有一间教室", expected_result: "一份时间安排", tags: [], visibility: "public", revision: 2, status: "open", accepted_result_id: null, expires_at: "2026-09-20T00:00:00.000Z", created_at: time, updated_at: time, mode: "live" },
  results: [{ id: "res-1", need_id: "n1", need_revision: 2, owner_id: "agent-owner", publisher_id: "agent-a", title: "90 分钟节奏方案", body: "先 10 分钟破冰，再分组做作品。", subtype: "result", sources: [{ id: "s1", kind: "zhihu", title: "如何组织一场线下技术分享？", author: "某社团组织者", url: "https://www.zhihu.com/question/123", retrieved_at: time, content_type: "summary", excerpt: "高赞回答建议控制在一小时半以内，先破冰后分组。" }, { id: "s2", kind: "other", title: "内部排练记录", retrieved_at: time, content_type: "reference" }], method_refs: [{ experience_id: "e9", revision: 3, usage: "按此分工" }], created_at: time, mode: "live" }],
  decisions: [],
};

function stubClientModule(page: Page) {
  return page.route("**/community/assets/gongzhi-client.js", r => r.fulfill({ contentType: "text/javascript", body: STUB_CLIENT }));
}
function stubBoard(page: Page) {
  return Promise.all([
    page.route("**/api/gongzhi/board?*", r => r.fulfill({ json: { ok: true, mode: "live", data: { records: [needRecord], next_cursor: null, mode: "live" } } })),
    page.route("**/api/gongzhi/threads/*", r => r.fulfill({ json: { ok: true, mode: "live", data: { thread_id: "n1", records: [needRecord], next_cursor: null, mode: "live" } } })),
    page.route("**/api/gongzhi/records/*", r => r.fulfill({ json: { ok: true, mode: "live", data: needRecord } })),
  ]);
}
async function login(page: Page, name = "阿治") {
  await stubClientModule(page);
  let bound: Record<string, unknown> | null = null;
  await page.route("**/api/gongzhi/owners", r => {
    if (r.request().method() === "GET") return r.fulfill({ json: { ok: true, mode: "live", data: bound ? [bound] : [] } });
    const body = r.request().postDataJSON() as { name: string; kind: string };
    bound = { ...humanOwner, name: body.name };
    return r.fulfill({ json: { ok: true, mode: "live", data: { owner: bound } } });
  });
  await page.goto(`${origin}/zh/connect/`);
  await page.locator("[data-cm-account] input[type=email]").fill("me@example.com");
  await page.locator("[data-cm-account] input[type=password]").fill("correct-password");
  await page.locator("[data-cm-account]").getByRole("button", { name: "登录" }).click();
  await expect(page.locator("[data-cm-account]")).toContainText("发言身份登记中");
  await page.locator("[data-cm-account] input[type=text]").fill(name);
  await page.locator("[data-cm-account]").getByRole("button", { name: "登记我的身份" }).click();
  await expect(page.locator("[data-cm-account]")).toContainText(name);
}

test.describe("共治真实写入 UI（HTTP fixture，仅验证页面行为）", () => {
  test.beforeEach(({ page }) => {
    page.on("pageerror", e => console.log("PAGEERROR:", e.message));
  });
  test("共享客户端缺失时登录区明确不可用，公开公告照常可读", async ({ page }) => {
    await stubBoard(page);
    await page.goto(`${origin}/zh/connect/`);
    await expect(page.locator("[data-cm-account]")).toContainText("登录服务当前未配置");
    await page.goto(`${origin}/zh/board/`);
    await expect(page.locator(".cm-record")).toHaveCount(1);
    await expect(page.locator("#need")).toContainText("想发布求助");
    await page.screenshot({ path: path.join(evidence, "account-unavailable.png"), fullPage: true });
  });

  test("登录失败报错；成功后签发授权：令牌只显示一次、失败保留同一幂等键、可撤销、退出清理", async ({ page }) => {
    const grants: Array<Record<string, unknown>> = [];
    const grantKeys: string[] = [];
    let failFirst = true;
    await stubClientModule(page);
    await page.route("**/api/gongzhi/owners", r => r.request().method() === "GET"
      ? r.fulfill({ json: { ok: true, mode: "live", data: [humanOwner] } })
      : r.fulfill({ json: { ok: true, mode: "live", data: { owner: humanOwner } } }));
    await page.route("**/api/gongzhi/authorizations", r => {
      if (r.request().method() === "GET") return r.fulfill({ json: { ok: true, mode: "live", data: grants } });
      const body = r.request().postDataJSON() as { scopes: string[]; expires_in_seconds: number; idempotency_key: string };
      grantKeys.push(body.idempotency_key);
      if (failFirst) { failFirst = false; return r.fulfill({ status: 500, json: { ok: false, mode: "live", error: { code: "unavailable", message: "服务暂时不可用。", retryable: true } } }); }
      const grant = { id: "g1", owner_id: "human-owner", scopes: body.scopes, expires_at: "2026-09-14T01:00:00.000Z", revoked_at: null, agent_id: null, created_at: time, mode: "live" };
      grants.push(grant);
      return r.fulfill({ json: { ok: true, mode: "live", data: { authorization: grant, grant_token: "gongzhi_grant_fixturesecret", credential_state: "issued" } } });
    });
    await page.route("**/api/gongzhi/authorizations/*", r => { grants[0] = { ...grants[0], revoked_at: time }; return r.fulfill({ json: { ok: true, mode: "live", data: grants[0] } }); });
    await page.goto(`${origin}/zh/connect/`);
    // 登录失败路径
    await page.locator("[data-cm-account] input[type=email]").fill("me@example.com");
    await page.locator("[data-cm-account] input[type=password]").fill("bad");
    await page.locator("[data-cm-account]").getByRole("button", { name: "登录" }).click();
    await expect(page.locator("[data-cm-account] .cm-form-error")).toContainText("登录信息无效");
    // 成功登录（已有人身份，无需再登记）
    await page.locator("[data-cm-account] input[type=password]").fill("correct-password");
    await page.locator("[data-cm-account]").getByRole("button", { name: "登录" }).click();
    await expect(page.locator("[data-cm-account]")).toContainText("阿治");
    // 签发授权：第一次 500，同一幂等键重试成功
    await page.locator('.cm-check input[value="read"]').check();
    await page.locator('.cm-check input[value="discuss"]').check();
    await page.locator("[data-cm-grants]").getByRole("button", { name: "签发授权" }).click();
    await expect(page.locator("[data-cm-grants] .cm-form-error")).toContainText("保留");
    await page.locator("[data-cm-grants]").getByRole("button", { name: "签发授权" }).click();
    await expect(page.locator(".cm-token")).toHaveText("gongzhi_grant_fixturesecret");
    expect(grantKeys).toHaveLength(2);
    expect(grantKeys[0]).toBe(grantKeys[1]);
    // 令牌收起后不再显示；列表可读、可撤销
    await page.locator('[data-cm-grants]').getByRole("button", { name: "收起令牌" }).click();
    await expect(page.locator(".cm-token")).toHaveCount(0);
    await expect(page.locator(".cm-grant")).toHaveCount(1);
    await page.locator(".cm-grant").getByRole("button", { name: "撤销" }).click();
    await expect(page.locator(".cm-grant")).toContainText("已撤销");
    // 退出后敏感 UI 清理
    await page.locator("[data-cm-account]").getByRole("button", { name: "退出登录" }).click();
    await expect(page.locator("[data-cm-account] input[type=email]")).toBeVisible();
    await expect(page.locator("[data-cm-grants] .cm-grant-form")).toHaveCount(0);
    await page.screenshot({ path: path.join(evidence, "grant-flow.png"), fullPage: true });
  });

  test("公告板登录后发布求助：失败保留草稿与幂等键，成功关闭并刷新", async ({ page }) => {
    const needKeys: string[] = [];
    let failFirst = true;
    await stubBoard(page);
    await page.route("**/api/gongzhi/needs", r => {
      const body = r.request().postDataJSON() as { idempotency_key: string };
      needKeys.push(body.idempotency_key);
      if (failFirst) { failFirst = false; return r.fulfill({ status: 500, json: { ok: false, mode: "live", error: { code: "unavailable", message: "服务暂时不可用。", retryable: true } } }); }
      return r.fulfill({ json: { ok: true, mode: "live", data: { id: "n2" } } });
    });
    await login(page);
    await page.goto(`${origin}/zh/board/`);
    await expect(page.locator(".cm-publish-bar")).toBeVisible();
    await page.locator(".cm-publish-bar").getByRole("button", { name: "发布求助" }).click();
    await page.locator(".cm-dialog input[type=text]").first().fill("如何组织线下读书会");
    await page.locator(".cm-dialog textarea").first().fill("想每月一次，十人以内。");
    await page.locator(".cm-dialog").getByRole("button", { name: "公开发布求助" }).click();
    await expect(page.locator(".cm-dialog .cm-form-error")).toContainText("保留");
    await expect(page.locator(".cm-dialog textarea").first()).toHaveValue("想每月一次，十人以内。");
    await page.locator(".cm-dialog").getByRole("button", { name: "公开发布求助" }).click();
    await expect(page.locator(".cm-dialog")).toHaveCount(0);
    expect(needKeys).toHaveLength(2);
    expect(needKeys[0]).toBe(needKeys[1]);
    await page.screenshot({ path: path.join(evidence, "publish-need.png"), fullPage: true });
  });

  test("线程回复、需求详情、采纳决策与平台回执", async ({ page }) => {
    const seen: Array<{ path: string; body: Record<string, unknown> }> = [];
    let decideFails = true;
    await stubBoard(page);
    await page.route("**/api/gongzhi/needs/n1", r => r.fulfill({ json: { ok: true, mode: "live", data: needDetail } }));
    await page.route("**/api/gongzhi/experiences/e9/versions/3", r => r.fulfill({ json: { ok: true, mode: "live", data: { experience: { id: "e9", owner_id: "agent-owner", publisher_id: "agent-a", title: "先做一张共识卡", body: "每人写下目标与困难。", applicability: "线下小组", tags: [], revision: 3, previous_version_id: null, sources: [], visibility: "public", created_at: time, mode: "live" }, author: {name:"方法分享者"}, skill_md:"固定第三版", execution:"caller_local", author_presence_required:false } } }));
    await page.route("**/api/gongzhi/discussions", r => { seen.push({ path: "discussions", body: r.request().postDataJSON() }); return r.fulfill({ json: { ok: true, mode: "live", data: { id: "r9" } } }); });
    await page.route("**/api/gongzhi/needs/n1/decisions", r => {
      seen.push({ path: "decisions", body: r.request().postDataJSON() });
      if (decideFails) { decideFails = false; return r.fulfill({ status: 500, json: { ok: false, mode: "live", error: { code: "unavailable", message: "服务暂时不可用。", retryable: true } } }); }
      return r.fulfill({ json: { ok: true, mode: "live", data: { id: "d1" } } });
    });
    await page.route("**/api/gongzhi/runs", r => {
      seen.push({ path: "runs", body: r.request().postDataJSON() });
      return r.fulfill({ json: { ok: true, mode: "live", data: { id: "run-1", need_id: "n1", need_revision: 2, owner_id: "platform", status: "succeeded", idempotency_key: "k", deadline_at: time, created_at: time, updated_at: time, result_id: "res-1", error: null, usage: { model_steps: 2, zhihu_queries: 1, input_tokens: null, output_tokens: null }, mode: "live" } } });
    });
    await login(page);
    await page.goto(`${origin}/zh/board/`);
    await page.locator(".cm-record").first().click();
    // 需求详情：版本、状态、来源（知乎作者/摘要/检索时间/原文链接）与可追溯引用、采纳操作（所有者视角）
    await expect(page.locator(".cm-need-detail")).toContainText("第 2 版");
    const sources = page.locator(".cm-source-card");
    await expect(sources).toHaveCount(2);
    await expect(sources.first()).toContainText("知乎");
    await expect(sources.first()).toContainText("摘要");
    await expect(sources.first()).toContainText("作者：某社团组织者");
    await expect(sources.first()).toContainText("检索于");
    await expect(sources.first()).toContainText("高赞回答建议");
    await expect(sources.first().locator("a.cm-source-link")).toHaveAttribute("href", "https://www.zhihu.com/question/123");
    await expect(sources.first().locator("a.cm-source-link")).toHaveAttribute("rel", /noopener/);
    // 缺字段来源：只显示实际存在的字段，不虚构作者/链接/摘要
    await expect(sources.nth(1)).toContainText("内部排练记录");
    await expect(sources.nth(1)).not.toContainText("作者：");
    await expect(sources.nth(1).locator("a")).toHaveCount(0);
    // 方法引用必须读取准确第三版，不改取其他版本。
    await page.locator(".cm-ref-link").click();
    await expect(page.locator(".cm-dialog")).toContainText("第 3 版");
    await expect(page.locator(".cm-dialog")).toContainText("先做一张共识卡");
    await page.keyboard.press("Escape");
    // 回复表单：第一次请求网络中断（响应丢失），编辑后重试仍发同一冻结 payload 与请求键
    await page.locator(".cm-record").first().click();
    await page.locator(".cm-reply-form textarea").fill("补充：场地可以借到隔壁教室。");
    await page.unroute("**/api/gongzhi/discussions");
    let dropFirst = true;
    await page.route("**/api/gongzhi/discussions", r => {
      seen.push({ path: "discussions", body: r.request().postDataJSON() });
      if (dropFirst) { dropFirst = false; return r.abort(); }
      return r.fulfill({ json: { ok: true, mode: "live", data: { id: "r9" } } });
    });
    await page.locator(".cm-reply-form").getByRole("button", { name: "公开发表" }).click();
    await expect(page.locator(".cm-reply-form .cm-form-error")).toBeVisible();
    await page.locator(".cm-reply-form textarea").fill("编辑后的内容不应进入重试。");
    await page.locator(".cm-reply-form").getByRole("button", { name: "公开发表" }).click();
    await expect.poll(() => seen.filter(s => s.path === "discussions").length).toBe(2);
    const replies = seen.filter(s => s.path === "discussions").map(s => s.body);
    expect(replies[0].idempotency_key).toBe(replies[1].idempotency_key);
    expect(replies[1].body).toBe("补充：场地可以借到隔壁教室。");
    const reply = replies[1];
    expect(reply.thread_id).toBe("n1");
    expect(reply.reply_to_id).toBe("n1");
    expect(reply.expected_revision).toBe(2);
    expect(reply.category).toBe("reply");
    expect(reply.body).toBe("补充：场地可以借到隔壁教室。");
    expect(String(reply.idempotency_key)).toMatch(/^web-/);
    // 采纳决策：第一次 500，同一请求键重试成功
    await page.locator(".cm-result").getByRole("button", { name: "采纳这份成果" }).click();
    await expect.poll(() => seen.filter(s => s.path === "decisions").length).toBe(1);
    await expect(page.locator(".cm-result").getByRole("button", { name: /服务暂时不可用/ })).toBeVisible();
    await page.locator(".cm-result").getByRole("button", { name: /服务暂时不可用/ }).click();
    await expect.poll(() => seen.filter(s => s.path === "decisions").length).toBe(2);
    const decisions = seen.filter(s => s.path === "decisions").map(s => s.body);
    expect(decisions[0].idempotency_key).toBe(decisions[1].idempotency_key);
    expect(decisions[1].result_id).toBe("res-1");
    expect(decisions[1].expected_revision).toBe(2);
    expect(decisions[1].decision).toBe("accept");
    // 平台回执：只展示服务返回的真实状态
    await page.locator(".cm-run").getByRole("button", { name: "请求平台助手帮助" }).click();
    await expect(page.locator(".cm-run-card")).toContainText("已提交成果");
    const run = seen.find(s => s.path === "runs")!.body;
    expect(run.need_id).toBe("n1");
    expect(run.need_revision).toBe(2);
    await page.screenshot({ path: path.join(evidence, "need-detail-owner.png"), fullPage: true });
  });

  test("真实 gongzhi-client.js 接线：config 返回登录未启用时明确降级，公开读取不受影响", async ({ page }) => {
    // 不打桩 /community/assets/gongzhi-client.js：使用 C 交付的真实文件，
    // 只拦截公开配置接口，验证导出约定与降级路径真实一致。
    await stubBoard(page);
    await page.route("**/api/gongzhi/config", r => r.fulfill({ json: { ok: true, mode: "live", data: { contract_version: "gongzhi.v1", api_base: "/api/gongzhi", database_configured: false, auth: { available: false, url: null, public_key: null } } } }));
    await page.goto(`${origin}/zh/connect/`);
    await expect(page.locator("[data-cm-account]")).toContainText("登录服务当前未配置");
    await page.goto(`${origin}/zh/board/`);
    await expect(page.locator(".cm-record")).toHaveCount(1);
  });

  test("平台回执为 unknown 时保留请求键、提供查询入口，不鼓励重开", async ({ page }) => {
    const keys: string[] = [];
    await stubBoard(page);
    await page.route("**/api/gongzhi/needs/n1", r => r.fulfill({ json: { ok: true, mode: "live", data: needDetail } }));
    await page.route("**/api/gongzhi/runs", r => {
      keys.push((r.request().postDataJSON() as { idempotency_key: string }).idempotency_key);
      return r.fulfill({ json: { ok: true, mode: "live", data: { id: "run-x", need_id: "n1", need_revision: 2, owner_id: "platform", status: "unknown", idempotency_key: "k", deadline_at: time, created_at: time, updated_at: time, result_id: null, error: { code: "unknown", message: "执行结果未能确认。", retryable: true }, usage: { model_steps: 1, zhihu_queries: 0, input_tokens: null, output_tokens: null }, mode: "live" } } });
    });
    await page.route("**/api/gongzhi/runs/run-x", r => r.fulfill({ json: { ok: true, mode: "live", data: { id: "run-x", need_id: "n1", need_revision: 2, owner_id: "platform", status: "failed", idempotency_key: "k", deadline_at: time, created_at: time, updated_at: time, result_id: null, error: { code: "upstream_failed", message: "模型服务未能完成。", retryable: true }, usage: { model_steps: 1, zhihu_queries: 0, input_tokens: null, output_tokens: null }, mode: "live" } } }));
    await login(page);
    await page.goto(`${origin}/zh/board/`);
    await page.locator(".cm-record").first().click();
    await page.locator(".cm-run").getByRole("button", { name: "请求平台助手帮助" }).click();
    await expect(page.locator(".cm-run-card")).toContainText("状态未知");
    await expect(page.locator(".cm-run-card")).toContainText("不要直接重新请求");
    // 提供查询入口；查询后展示真实终态
    await page.locator(".cm-run-card").getByRole("button", { name: "查询最新状态" }).click();
    await expect(page.locator(".cm-run-card")).toContainText("失败");
    await expect(page.locator(".cm-run-card")).toContainText("模型服务未能完成");
    // unknown 后再发请求仍用同一键（服务端去重，不会重开模型）
    await page.locator(".cm-run").getByRole("button", { name: "请求平台助手帮助" }).click();
    await expect.poll(() => keys.length).toBe(2);
    expect(keys[0]).toBe(keys[1]);
  });

  test("求助线程内的回复卡：回读线程根后带当前版本号，reply_to_id 保留被点击记录", async ({ page }) => {
    const seen: Array<Record<string, unknown>> = [];
    const replyCard = { id: "r1", thread_id: "n1", reply_to_id: "n1", kind: "reply", title: "先确认活动边界", body: "建议先准备纸笔备选。", speaker_id: "agent-a", owner_id: "human-owner", speaker: { ...humanOwner, id: "agent-a", kind: "external_agent", name: "拾光" }, need_revision: 2, created_at: time, mode: "live" };
    await stubClientModule(page);
    let bound: Record<string, unknown> | null = null;
    await page.route("**/api/gongzhi/owners", r => {
      if (r.request().method() === "GET") return r.fulfill({ json: { ok: true, mode: "live", data: bound ? [bound] : [] } });
      bound = { ...humanOwner };
      return r.fulfill({ json: { ok: true, mode: "live", data: { owner: bound } } });
    });
    await page.route("**/api/gongzhi/board?*", r => r.fulfill({ json: { ok: true, mode: "live", data: { records: [needRecord, replyCard], next_cursor: null, mode: "live" } } }));
    // 线程分页首屏不含根（更早已翻页）：根必须由 readRecord 解析
    await page.route("**/api/gongzhi/threads/*", r => r.fulfill({ json: { ok: true, mode: "live", data: { thread_id: "n1", records: [replyCard], next_cursor: null, mode: "live" } } }));
    await page.route("**/api/gongzhi/records/*", r => r.fulfill({ json: { ok: true, mode: "live", data: needRecord } }));
    await page.route("**/api/gongzhi/needs/n1", r => r.fulfill({ json: { ok: true, mode: "live", data: needDetail } }));
    await page.route("**/api/gongzhi/discussions", r => { seen.push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true, mode: "live", data: { id: "r10" } } }); });
    // 登录（绑定公开称呼）
    await page.goto(`${origin}/zh/connect/`);
    await page.locator("[data-cm-account] input[type=email]").fill("me@example.com");
    await page.locator("[data-cm-account] input[type=password]").fill("correct-password");
    await page.locator("[data-cm-account]").getByRole("button", { name: "登录" }).click();
    await page.locator("[data-cm-account] input[type=text]").fill("阿治");
    await page.locator("[data-cm-account]").getByRole("button", { name: "登记我的身份" }).click();
    await expect(page.locator("[data-cm-account]")).toContainText("阿治");
    await page.goto(`${origin}/zh/board/`);
    // 点击回复卡（kind 不是 need），线程根是求助
    await page.locator(".cm-record", { hasText: "先确认活动边界" }).click();
    await page.locator(".cm-reply-form textarea").fill("认同，纸笔方案我们试过。");
    await page.locator(".cm-reply-form").getByRole("button", { name: "公开发表" }).click();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0].thread_id).toBe("n1");
    expect(seen[0].reply_to_id).toBe("r1");
    expect(seen[0].expected_revision).toBe(2);
  });

  test("换号：迟到的上任身份响应被丢弃，在途签发/登记不越会话，令牌不跨账号复现", async ({ page }) => {
    const ownerA = { ...humanOwner, id: "human-a", name: "甲" };
    const ownerB = { ...humanOwner, id: "human-b", name: "乙" };
    const ownerC = { ...humanOwner, id: "human-c", name: "丙" };
    let calls = 0;
    await stubClientModule(page);
    await page.route("**/api/gongzhi/owners", r => {
      if (r.request().method() !== "GET") {
        // 丙的登记响应迟到 1.5 秒
        return new Promise(resolve => setTimeout(() => resolve(r.fulfill({ json: { ok: true, mode: "live", data: { owner: ownerC } } })), 1500));
      }
      calls++;
      if (calls === 1) {
        // 甲的身份响应迟到 2 秒
        return new Promise(resolve => setTimeout(() => resolve(r.fulfill({ json: { ok: true, mode: "live", data: [ownerA] } })), 2000));
      }
      if (calls === 4) return r.fulfill({ json: { ok: true, mode: "live", data: [] } }); // 丙尚无身份
      return r.fulfill({ json: { ok: true, mode: "live", data: [calls === 2 ? ownerB : ownerA] } });
    });
    await page.route("**/api/gongzhi/authorizations", r => {
      if (r.request().method() === "GET") return r.fulfill({ json: { ok: true, mode: "live", data: [] } });
      // 乙的签发响应迟到 1.5 秒
      return new Promise(resolve => setTimeout(() => resolve(r.fulfill({ json: { ok: true, mode: "live", data: { authorization: { id: "g1", owner_id: "human-b", scopes: ["read"], expires_at: "2026-09-14T01:00:00.000Z", revoked_at: null, agent_id: null, created_at: time, mode: "live" }, grant_token: "gongzhi_grant_b_secret", credential_state: "issued" } } })), 1500));
    });
    await page.goto(`${origin}/zh/connect/`);
    const signIn = async (email: string) => {
      await page.locator("[data-cm-account] input[type=email]").fill(email);
      await page.locator("[data-cm-account] input[type=password]").fill("correct-password");
      await page.locator("[data-cm-account]").getByRole("button", { name: "登录" }).click();
    };
    const signOut = async () => {
      await page.locator("[data-cm-account]").getByRole("button", { name: "退出登录" }).click();
      await expect(page.locator("[data-cm-account] input[type=email]")).toBeVisible();
    };
    // 甲的 listOwners 在途中就退出换乙；迟到响应到达时乙仍在会话中，身份不得变成甲
    await signIn("a@example.com");
    await page.locator("[data-cm-account]").getByRole("button", { name: "退出登录" }).click();
    await signIn("b@example.com");
    await expect(page.locator("[data-cm-account]")).toContainText("乙");
    await page.waitForTimeout(2300);
    await expect(page.locator("[data-cm-account]")).toContainText("乙");
    await expect(page.locator("[data-cm-account]")).not.toContainText("甲");
    // 乙签发授权，响应在途中就换甲：迟到令牌不得出现在甲的会话里
    await page.locator('.cm-check input[value="read"]').check();
    await page.locator("[data-cm-grants]").getByRole("button", { name: "签发授权" }).click();
    await signOut();
    await signIn("a@example.com");
    await expect(page.locator("[data-cm-account]")).toContainText("甲");
    await page.waitForTimeout(2000);
    await expect(page.locator(".cm-token")).toHaveCount(0);
    await expect(page.locator(".cm-token-once")).toHaveCount(0);
    // 丙登记身份，响应在途中就换甲：迟到登记不得覆盖甲的身份
    await signOut();
    await signIn("c@example.com");
    await expect(page.locator("[data-cm-account]")).toContainText("登记中");
    await page.locator("[data-cm-account] input[type=text]").fill("丙");
    await page.locator("[data-cm-account]").getByRole("button", { name: "登记我的身份" }).click();
    await signOut();
    await signIn("a@example.com");
    await expect(page.locator("[data-cm-account]")).toContainText("甲");
    await page.waitForTimeout(2000);
    await expect(page.locator("[data-cm-account]")).not.toContainText("丙");
    await page.screenshot({ path: path.join(evidence, "account-switch.png"), fullPage: true });
  });

  test("回复异步解析期间换号：发送前校验会话，postReply 零调用，对话框关闭", async ({ page }) => {
    let posts = 0;
    await stubBoard(page);
    // 根读取延迟 1.5 秒：留出换号窗口
    await page.unroute("**/api/gongzhi/records/*");
    await page.route("**/api/gongzhi/records/*", r => new Promise(resolve => setTimeout(() => resolve(r.fulfill({ json: { ok: true, mode: "live", data: needRecord } })), 1500)));
    await page.route("**/api/gongzhi/discussions", r => { posts++; return r.fulfill({ json: { ok: true, mode: "live", data: { id: "r11" } } }); });
    await login(page);
    await page.goto(`${origin}/zh/board/`);
    await page.locator(".cm-record").first().click();
    await page.locator(".cm-reply-form textarea").fill("这条回复不该发出去。");
    await page.locator(".cm-reply-form").getByRole("button", { name: "公开发表" }).click();
    // 根读取仍在途中：换号（退出登录），对话框应随身份变化关闭
    await page.evaluate(() => (window as unknown as { __fixtureSignOut(): Promise<void> }).__fixtureSignOut());
    await expect(page.locator(".cm-dialog")).toHaveCount(0);
    await page.waitForTimeout(2200);
    expect(posts).toBe(0);
  });

  test("退出/换号后公告板发布条清理，恢复匿名静态说明", async ({ page }) => {
    await stubBoard(page);
    await login(page);
    await page.goto(`${origin}/zh/board/`);
    await expect(page.locator(".cm-publish-bar")).toBeVisible();
    await expect(page.locator(".cm-publish-bar")).toContainText("阿治");
    // 跨标签/本会话退出等价路径：身份失效后发布条必须消失
    await page.evaluate(() => (window as unknown as { __fixtureSignOut(): Promise<void> }).__fixtureSignOut());
    await expect(page.locator(".cm-publish-bar")).toHaveCount(0);
    await expect(page.locator("#need")).toContainText("想发布求助");
    await expect(page.locator("#experience")).toContainText("想分享经验");
  });

  test("服务返回 unknown(retryable:false)：冻结保留、提示对账，编辑不进入重试", async ({ page }) => {
    const seen: Array<Record<string, unknown>> = [];
    let unknownOnce = true;
    await stubBoard(page);
    await page.route("**/api/gongzhi/needs", r => {
      seen.push(r.request().postDataJSON());
      if (unknownOnce) {
        unknownOnce = false;
        return r.fulfill({ status: 500, json: { ok: false, mode: "live", error: { code: "unknown", message: "服务未能确认这次发布。", retryable: false } } });
      }
      return r.fulfill({ json: { ok: true, mode: "live", data: { id: "n3" } } });
    });
    await login(page);
    await page.goto(`${origin}/zh/board/`);
    await page.locator(".cm-publish-bar").getByRole("button", { name: "发布求助" }).click();
    await page.locator(".cm-dialog input[type=text]").first().fill("如何安排分享会议程");
    await page.locator(".cm-dialog textarea").first().fill("四人各讲十分钟。");
    await page.locator(".cm-dialog").getByRole("button", { name: "公开发布求助" }).click();
    // unknown 提示对账，不鼓励改内容重发
    await expect(page.locator(".cm-dialog .cm-form-error")).toContainText("未能确认");
    await expect(page.locator(".cm-dialog .cm-form-error")).toContainText("不会重复创建");
    await page.locator(".cm-dialog textarea").first().fill("编辑后的内容不应进入重试。");
    await page.locator(".cm-dialog").getByRole("button", { name: "公开发布求助" }).click();
    await expect(page.locator(".cm-dialog")).toHaveCount(0);
    expect(seen).toHaveLength(2);
    expect(seen[0].idempotency_key).toBe(seen[1].idempotency_key);
    expect(seen[1].body).toBe("四人各讲十分钟。");
    expect(seen[1].title).toBe("如何安排分享会议程");
  });
});
