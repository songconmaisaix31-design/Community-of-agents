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

// 测试替身：实现 C 约定的 createGongzhiBrowserClient() → {config, auth, api}。
// api 直接打被拦截的 /api/gongzhi/**，用于核对页面发出的真实请求形状。
const STUB_CLIENT = `
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
  const api = {
    listOwners: () => req("/api/gongzhi/owners"),
    bindOwner: i => req("/api/gongzhi/owners", "POST", i),
    createAuthorization: i => req("/api/gongzhi/authorizations", "POST", i),
    listAuthorizations: () => req("/api/gongzhi/authorizations"),
    revokeAuthorization: id => req("/api/gongzhi/authorizations/" + id, "DELETE"),
    createNeed: i => req("/api/gongzhi/needs", "POST", i),
    publishExperience: i => req("/api/gongzhi/experiences", "POST", i),
    postReply: i => req("/api/gongzhi/discussions", "POST", i),
    readNeed: id => req("/api/gongzhi/needs/" + id),
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
  results: [{ id: "res-1", need_id: "n1", need_revision: 2, owner_id: "agent-owner", publisher_id: "agent-a", title: "90 分钟节奏方案", body: "先 10 分钟破冰，再分组做作品。", subtype: "result", sources: [{ id: "s1", kind: "url", title: "公开活动经验文", url: "https://example.com/a", retrieved_at: time, content_type: "reference" }], method_refs: [], created_at: time, mode: "live" }],
  decisions: [],
};

function stubClientModule(page: Page) {
  return page.route("**/community/assets/gongzhi-client.js", r => r.fulfill({ contentType: "text/javascript", body: STUB_CLIENT }));
}
function stubBoard(page: Page) {
  return Promise.all([
    page.route("**/api/gongzhi/board?*", r => r.fulfill({ json: { ok: true, mode: "live", data: { records: [needRecord], next_cursor: null, mode: "live" } } })),
    page.route("**/api/gongzhi/threads/*", r => r.fulfill({ json: { ok: true, mode: "live", data: { thread_id: "n1", records: [needRecord], next_cursor: null, mode: "live" } } })),
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
    await stubBoard(page);
    await page.route("**/api/gongzhi/needs/n1", r => r.fulfill({ json: { ok: true, mode: "live", data: needDetail } }));
    await page.route("**/api/gongzhi/discussions", r => { seen.push({ path: "discussions", body: r.request().postDataJSON() }); return r.fulfill({ json: { ok: true, mode: "live", data: { id: "r9" } } }); });
    await page.route("**/api/gongzhi/needs/n1/decisions", r => { seen.push({ path: "decisions", body: r.request().postDataJSON() }); return r.fulfill({ json: { ok: true, mode: "live", data: { id: "d1" } } }); });
    await page.route("**/api/gongzhi/runs", r => {
      seen.push({ path: "runs", body: r.request().postDataJSON() });
      return r.fulfill({ json: { ok: true, mode: "live", data: { id: "run-1", need_id: "n1", need_revision: 2, owner_id: "platform", status: "succeeded", idempotency_key: "k", deadline_at: time, created_at: time, updated_at: time, result_id: "res-1", error: null, usage: { model_steps: 2, zhihu_queries: 1, input_tokens: null, output_tokens: null }, mode: "live" } } });
    });
    await login(page);
    await page.goto(`${origin}/zh/board/`);
    await page.locator(".cm-record").first().click();
    // 需求详情：版本、状态、来源、采纳操作（所有者视角）
    await expect(page.locator(".cm-need-detail")).toContainText("第 2 版");
    await expect(page.locator(".cm-need-detail")).toContainText("公开活动经验文");
    // 回复表单：category/body/idempotency_key 形状
    await page.locator(".cm-reply-form textarea").fill("补充：场地可以借到隔壁教室。");
    await page.locator(".cm-reply-form").getByRole("button", { name: "公开发表" }).click();
    await expect.poll(() => seen.filter(s => s.path === "discussions").length).toBe(1);
    const reply = seen.find(s => s.path === "discussions")!.body;
    expect(reply.thread_id).toBe("n1");
    expect(reply.category).toBe("reply");
    expect(String(reply.idempotency_key)).toMatch(/^web-/);
    // 采纳决策
    await page.locator(".cm-result").getByRole("button", { name: "采纳这份成果" }).click();
    await expect.poll(() => seen.filter(s => s.path === "decisions").length).toBe(1);
    const decision = seen.find(s => s.path === "decisions")!.body;
    expect(decision.result_id).toBe("res-1");
    expect(decision.expected_revision).toBe(2);
    expect(decision.decision).toBe("accept");
    // 平台回执：只展示服务返回的真实状态
    await page.locator(".cm-run").getByRole("button", { name: "请求平台助手帮助" }).click();
    await expect(page.locator(".cm-run-card")).toContainText("已提交成果");
    const run = seen.find(s => s.path === "runs")!.body;
    expect(run.need_id).toBe("n1");
    expect(run.need_revision).toBe(2);
    await page.screenshot({ path: path.join(evidence, "need-detail-owner.png"), fullPage: true });
  });
});
