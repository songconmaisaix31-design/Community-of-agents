import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "../../lib/db.ts";
import { sha256 } from "../../lib/ids.ts";
import { handleWebAuth } from "../../lib/gongzhi/web-auth.ts";
import { SESSION_COOKIE, STATE_COOKIE } from "../../lib/gongzhi/web-session.ts";
import { handleGongzhiRequest } from "../../lib/gongzhi/http.ts";
import { resolvePlatformIdentity, verifiedUser } from "../../lib/gongzhi/identity.ts";
import { handleMcpPost } from "../../lib/mcp.ts";
import { assertLocalDatabase, testProfileFromEnv } from "../../infra/local-auth/local-profile.mjs";

test("dedicated real PG + upstream fixture: browser state, provider identity and original consent chain", { skip: process.env.GONGZHI_WEB_AUTH_TEST !== "true", timeout: 90_000 }, async t => {
  assert.equal(process.env.GONGZHI_ISOLATED_TEST, "true");
  const profile = testProfileFromEnv(process.env);
  assert.equal(profile.project, "gongzhi-fulltest-c-20260914"); assert.equal(profile.pgPort, 56640);
  assertLocalDatabase(process.env.DATABASE_URL, 56640, "gongzhi_core_test");
  const names = ["SITE_URL", "ZHIHU_OAUTH_APP_ID", "ZHIHU_OAUTH_APP_KEY", "ZHIHU_OAUTH_REDIRECT_URI"];
  const saved = names.map(name => [name, process.env[name]] as const);
  const origin = "https://oauth-fixture.example.invalid";
  Object.assign(process.env, { SITE_URL: origin, ZHIHU_OAUTH_APP_ID: "fixture-app", ZHIHU_OAUTH_APP_KEY: "fixture-key", ZHIHU_OAUTH_REDIRECT_URI: `${origin}/auth/zhihu/callback` });
  t.after(async () => { await sql().end(); for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  const unique = randomUUID(), key = (x: string) => `oauth:${unique}:${x}`;
  const uid = String(800000000000000000n + BigInt(`0x${unique.replaceAll("-", "").slice(0, 12)}`));
  const uidB = String(BigInt(uid) + 1n), hashA = `a${unique.replaceAll("-", "")}`, hashB = `b${unique.replaceAll("-", "")}`;
  let upstreamCalls = 0;
  const fixture = (user: Record<string, unknown>, expiresIn = 3600): typeof fetch => (async (url, init) => {
    upstreamCalls++;
    assert.equal(init?.redirect, "error");
    if (url === "https://openapi.zhihu.com/access_token") return Response.json({ access_token: "fixture-access-token", token_type: "Bearer", expires_in: expiresIn });
    assert.equal(url, "https://openapi.zhihu.com/user");
    return Response.json({ ...user, fullname: "Identical fixture name", email: "same@example.invalid", phone_no: "not-stored" });
  }) as typeof fetch;
  const cookies = (response: Response, name: string) => response.headers.getSetCookie().find(v => v.startsWith(`${name}=`))?.split(";")[0] ?? "";
  const request = (path: string, cookie = "", method = "GET", body?: unknown, extra: Record<string, string> = {}) => new Request(`${origin}${path}`, { method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method !== "GET" ? { Origin: origin, "Content-Type": "application/json" } : {}), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const start = async () => {
    const response = await handleWebAuth(request("/api/gongzhi/auth/zhihu/start", "", "POST", {}, { "x-forwarded-for": unique }), "start");
    assert.equal(response.status, 200);
    const url = new URL((await response.json()).data.authorization_url);
    const state = url.searchParams.get("state")!;
    const cookie = cookies(response, STATE_COOKIE);
    assert.ok(cookie); assert.equal(url.origin, "https://openapi.zhihu.com");
    assert.match(response.headers.get("set-cookie")!, /HttpOnly; Secure; SameSite=Lax/);
    return { state, cookie };
  };
  const callback = (flow: { state: string; cookie: string }, fetcher: typeof fetch, extra = "") => handleWebAuth(request(`/auth/zhihu/callback?authorization_code=fixture-code&state=${flow.state}${extra}`, flow.cookie), "callback", fetcher);
  const session = async (cookie: string) => (await (await handleWebAuth(request("/api/gongzhi/auth/session", cookie), "session")).json()).data;
  const login = async (user: Record<string, unknown>, previous = "") => {
    const flow = await start();
    const response = await callback({ ...flow, cookie: [flow.cookie, previous].filter(Boolean).join("; ") }, fixture(user));
    assert.equal(response.headers.get("location"), "/zh?auth=success");
    const cookie = cookies(response, SESSION_COOKIE); assert.ok(cookie);
    const data = await session(cookie); assert.ok(data.user?.id);
    return { cookie, user: data.user, expires: data.expires_at, response };
  };
  const rest = async (credential: { cookie?: string; bearer?: string }, path: string, method = "GET", body?: unknown, extra: Record<string, string> = {}) => {
    const response = await handleGongzhiRequest(request(`/api/gongzhi/${path}`, credential.cookie, method, body, { ...(credential.bearer ? { Authorization: `Bearer ${credential.bearer}` } : {}), ...extra }), path.split("/"));
    return { status: response.status, ...(await response.json()) };
  };
  const ok = async (...args: Parameters<typeof rest>) => { const response = await rest(...args); assert.equal(response.status, 200, `${args[1]} ${response.error?.code}`); return response.data; };
  await t.test("state is browser-bound, expires, rejects cancellation and is atomically consumed once", async () => {
    const flow = await start(), other = await start(), before = upstreamCalls;
    assert.equal((await callback({ ...flow, cookie: other.cookie }, fixture({ uid }))).headers.get("location"), "/zh?auth=invalid_request");
    assert.equal(upstreamCalls, before);
    const pair = await Promise.all([callback(flow, fixture({ uid })), callback(flow, fixture({ uid }))]);
    assert.deepEqual(pair.map(r => r.headers.get("location")).sort(), ["/zh?auth=invalid_request", "/zh?auth=success"]);
    assert.equal(upstreamCalls, before + 2, "only one token exchange/profile request");
    const expired = await start();
    await sql()`update gongzhi_web_states set expires_at=clock_timestamp()-interval '1 second' where state_hash=${sha256(expired.state)}`;
    assert.equal((await callback(expired, fixture({ uid }))).headers.get("location"), "/zh?auth=invalid_request");
    const cancelled = await start();
    assert.equal((await callback(cancelled, fixture({ uid }), "&error=access_denied")).headers.get("location"), "/zh?auth=cancelled");
    assert.equal((await callback(cancelled, fixture({ uid }))).headers.get("location"), "/zh?auth=invalid_request");
    assert.equal(upstreamCalls, before + 2);
  });
  const a = await login({ uid }), a2 = await login({ uid, hash_id: hashA }, a.cookie), a3 = await login({ uid }, a2.cookie);
  const b = await login({ uid: uidB, hash_id: hashB });
  await t.test("uid/hash presence changes preserve UUID; identical names/email and conflicting mappings never merge", async () => {
    assert.equal(a.user.id, a2.user.id); assert.equal(a2.user.id, a3.user.id); assert.notEqual(a.user.id, b.user.id);
    assert.equal((await session(a.cookie)).user, null, "successful re-login revokes previous browser session");
    const conflict = await callback(await start(), fixture({ uid, hash_id: hashB }));
    assert.equal(conflict.headers.get("location"), "/zh?auth=unauthenticated");
    const conflictNew = await callback(await start(), fixture({ uid: String(BigInt(uid) + 2n), hash_id: hashA }));
    assert.equal(conflictNew.headers.get("location"), "/zh?auth=unauthenticated");
    const rows = await sql()`select subject,user_id from gongzhi_web_subjects where user_id in (${a.user.id},${b.user.id})`;
    assert.equal(rows.length, 4); assert.ok(rows.some(r => r.subject === `uid:${uid}` && r.user_id === a.user.id));
    await assert.rejects(sql()`update gongzhi_web_subjects set user_id=${b.user.id} where subject=${`uid:${uid}`}`, /immutable provider identity/);
    assert.deepEqual(Object.keys(a.user).sort(), ["avatar_url", "id", "name", "provider"]);
    assert.ok(Date.parse(a.expires) <= Date.now() + 3600_000);
    assert.equal((await login({ hash_id: hashA })).user.id, a.user.id, "hash-only response retains the same identity");
  });
  await t.test("cookie mutations require canonical Origin; explicit empty/invalid Bearer cannot become a human", async () => {
    for (const originValue of ["", "null", "https://attacker.invalid"]) {
      assert.equal((await rest(a3, "owners", "POST", { kind: "human", name: "Fixture" }, { Origin: originValue })).error.code, "forbidden");
      await assert.rejects(resolvePlatformIdentity(request("/api/gongzhi/runs", a3.cookie, "POST", {}, { Origin: originValue })), { code: "forbidden" });
    }
    for (const auth of ["", "Basic invalid", "Bearer "]) {
      assert.equal((await rest(a3, "owners", "GET", undefined, { Authorization: auth })).error.code, "unauthenticated");
    }
    assert.equal((await rest({}, "owners")).error.code, "unauthenticated");
    assert.equal((await rest({}, "board")).ok, true, "public anonymous reads remain available");
  });
  const ownerA = (await ok(a3, "owners", "POST", { kind: "human", name: `OAuth A ${unique}` })).owner;
  const ownerB = (await ok(b, "owners", "POST", { kind: "human", name: `OAuth B ${unique}` })).owner;
  await t.test("cookie GET cannot silently create a platform publisher", async () => {
    await assert.rejects(resolvePlatformIdentity(request("/api/gongzhi/runs", a3.cookie)), { code: "unbound_identity" });
    const [row] = await sql()`select count(*)::int as n from gongzhi_owners where user_id=${a3.user.id} and kind='platform_agent'`;
    assert.equal(row.n, 0);
  });
  const grant = await ok(a3, "authorizations", "POST", { scopes: ["read", "publish_experience"], idempotency_key: key("grant") });
  const agent = await ok({ bearer: grant.grant_token }, "agents/register", "POST", { idempotency_key: key("register") });
  const agentCredential = { bearer: agent.api_key };
  const payload = { title: `OAuth approved fixture ${unique}`, body: "Real local PostgreSQL with injected upstream data, not real Zhihu authorization.", applicability: "Isolated acceptance only", sources: [], idempotency_key: key("experience") };
  let published: { id: string; owner_id: string };
  await t.test("cookie human signs exact approval, Agent uses original limited Bearer chain with idempotency", async () => {
    assert.equal((await rest(agentCredential, "authorizations", "POST", { scopes: ["discuss"], idempotency_key: key("escalate") })).error.code, "forbidden");
    assert.equal((await rest(agentCredential, "experiences", "POST", payload)).ok, false);
    assert.equal((await rest(b, "content-approvals", "POST", { agent_id: agent.owner.id, visibility: "public", content: { action: "publish_experience", payload }, idempotency_key: key("foreign-approval") })).ok, false);
    const approval = await ok(a3, "content-approvals", "POST", { agent_id: agent.owner.id, visibility: "public", content: { action: "publish_experience", payload }, idempotency_key: key("approval") });
    published = await ok(agentCredential, "experiences", "POST", { ...payload, approval_id: approval.id });
    const replay = await ok(agentCredential, "experiences", "POST", { ...payload, approval_id: approval.id });
    assert.equal(replay.id, published.id); assert.equal(published.owner_id, ownerA.id); assert.notEqual(ownerA.id, ownerB.id);
    assert.equal((await rest(agentCredential, "experiences", "POST", { ...payload, title: "changed", approval_id: approval.id })).ok, false);
    const record = await ok({}, `records/${published.id}`); assert.equal(record.speaker_id, agent.owner.id);
    const mcp = await handleMcpPost(request("/mcp", "", "POST", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "agent_status", arguments: {} } }, { Authorization: `Bearer ${agent.api_key}` }));
    assert.equal((await mcp.json()).result.structuredContent.data.human_owner_id, ownerA.id);
    const cookieMcp = await handleMcpPost(request("/mcp", a3.cookie, "POST", { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_authorization", arguments: { scopes: ["read"], idempotency_key: key("mcp-cookie") } } }));
    assert.equal((await cookieMcp.json()).result.structuredContent.error.code, "unauthenticated", "MCP stays header-only");
  });
  await t.test("logout and expiry invalidate sessions; Agent revocation retains approved immutable history", async () => {
    const logout = await handleWebAuth(request("/api/gongzhi/auth/logout", b.cookie, "POST", {}), "logout");
    assert.equal(logout.status, 200); assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/);
    assert.equal((await session(b.cookie)).user, null);
    await ok(a3, `authorizations/${grant.authorization.id}`, "DELETE");
    assert.equal((await rest(agentCredential, "experiences", "POST", payload)).error.code, "revoked");
    assert.equal((await ok({}, `records/${published!.id}`)).body, payload.body);
    const hash = sha256(a3.cookie.slice(`${SESSION_COOKIE}=`.length));
    await sql()`update gongzhi_web_sessions set expires_at=clock_timestamp()-interval '1 second' where session_hash=${hash}`;
    assert.equal((await session(a3.cookie)).user, null);
    await assert.rejects(verifiedUser(request("/api/gongzhi/owners", a3.cookie)), { code: "unauthenticated" });
  });
  await t.test("logout during provider exchange cancels pending login instead of reviving a session", async () => {
    const flow = await start();
    let reached!: () => void, release!: () => void;
    const waiting = new Promise<void>(resolve => { reached = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const upstream = fixture({ uid });
    const delayed: typeof fetch = async (url, init) => { if (String(url).endsWith("access_token")) { reached(); await gate; } return upstream(url, init); };
    const pending = callback(flow, delayed); await waiting;
    await handleWebAuth(request("/api/gongzhi/auth/logout", flow.cookie, "POST", {}), "logout"); release();
    const response = await pending; assert.equal(response.headers.get("location"), "/zh?auth=invalid_request");
    assert.equal(cookies(response, SESSION_COOKIE), "");
  });
  await t.test("a newer login supersedes an in-flight callback; upstream failure consumes state without issuing a session", async () => {
    const flow = await start();
    const newer = await handleWebAuth(request("/api/gongzhi/auth/zhihu/start", flow.cookie, "POST", {}, { "x-forwarded-for": unique }), "start");
    assert.equal(newer.status, 200);
    const count = upstreamCalls;
    assert.equal((await callback(flow, fixture({ uid }))).headers.get("location"), "/zh?auth=invalid_request");
    assert.equal(upstreamCalls, count);
    const providerError = await start();
    assert.equal((await callback(providerError, fixture({ uid }), "&error=server_error")).headers.get("location"), "/zh?auth=upstream_failed");
    const failure = await start();
    const failed = await callback(failure, (async () => { throw new Error("private-provider-detail"); }) as typeof fetch);
    assert.equal(failed.headers.get("location"), "/zh?auth=upstream_failed");
    assert.equal(cookies(failed, SESSION_COOKIE), "");
    assert.equal((await callback(failure, fixture({ uid }))).headers.get("location"), "/zh?auth=invalid_request");
  });
});
