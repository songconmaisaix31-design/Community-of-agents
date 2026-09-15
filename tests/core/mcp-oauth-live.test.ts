import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { sql } from "../../lib/db.ts";
import { sha256 } from "../../lib/ids.ts";
import { handleOAuth, consentView, MCP_BROWSER_COOKIE } from "../../lib/gongzhi/mcp-oauth.ts";
import { handleMcpPost, handleMcpUnsupportedMethod } from "../../lib/mcp.ts";
import { handleGongzhiRequest } from "../../lib/gongzhi/http.ts";
import { SESSION_COOKIE } from "../../lib/gongzhi/web-session.ts";
import { handleWebAuth } from "../../lib/gongzhi/web-auth.ts";
import { assertIdentity, resolveMcpIdentity } from "../../lib/gongzhi/identity.ts";
import { inTransaction } from "../../lib/db.ts";
import { assertLocalDatabase, testProfileFromEnv } from "../../infra/local-auth/local-profile.mjs";

test("MCP OAuth: real isolated PostgreSQL, injected local browser identity, no provider calls", { skip: process.env.GONGZHI_MCP_OAUTH_TEST !== "true", timeout: 120000 }, async t => {
  assert.equal(process.env.GONGZHI_ISOLATED_TEST, "true");
  const profile = testProfileFromEnv(process.env);
  assert.equal(profile.project, "gongzhi-fulltest-c-20260914");
  assertLocalDatabase(process.env.DATABASE_URL, 56640, "gongzhi_core_test");
  const issuer = "https://oauth-core.example.invalid";
  Object.assign(process.env, { SITE_URL: issuer, GONGZHI_MCP_OAUTH_ISSUER: issuer, ZHIHU_OAUTH_APP_ID: "fixture", ZHIHU_OAUTH_APP_KEY: "fixture", ZHIHU_OAUTH_REDIRECT_URI: `${issuer}/auth/zhihu/callback` });
  t.after(async () => { await sql().end(); });
  const random = () => randomBytes(32).toString("base64url");
  const userId = randomUUID(), session = random(), browser = random();
  await sql()`insert into gongzhi_web_users(id,name) values(${userId},'Local OAuth test human')`;
  await sql()`insert into gongzhi_web_sessions(session_hash,browser_hash,user_id,expires_at) values(${sha256(session)},${sha256(browser)},${userId},clock_timestamp()+interval '1 hour')`;
  const sessionCookie = `${SESSION_COOKIE}=${session}`;
  let clientId = "";
  const callback = "http://127.0.0.1:47891/callback", resource = `${issuer}/mcp`;
  const req = (path: string, method = "GET", data?: Record<string, string>, cookie = sessionCookie, json = false) => new Request(`${issuer}${path}`, { method, headers: { Cookie: cookie, ...(method !== "GET" ? { Origin: issuer, "Content-Type": json ? "application/json" : "application/x-www-form-urlencoded" } : {}) }, ...(data ? { body: json ? JSON.stringify(data) : new URLSearchParams(data).toString() } : {}) });
  const register = (data: unknown) => handleOAuth(new Request(`${issuer}/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }), "register");
  const start = async (scope = "read", override: Record<string,string> = {}) => {
    const verifier = random(), challenge = createHash("sha256").update(verifier).digest("base64url");
    const p = new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: "code", resource, code_challenge: challenge, code_challenge_method: "S256", state: random(), scope, ...override });
    const response = await handleOAuth(req(`/oauth/authorize?${p}`), "authorize");
    return { response, verifier, state: p.get("state"), id: new URL(response.headers.get("location") ?? "/", issuer).searchParams.get("request")!, cookie: [sessionCookie, response.headers.getSetCookie()[0]?.split(";")[0]].filter(Boolean).join("; ") };
  };
  const approve = async (scope = "read") => {
    const flow = await start(scope); assert.equal(flow.response.status, 303);
    const view = await consentView(req(`/oauth/consent?request=${flow.id}`, "GET", undefined, flow.cookie), flow.id);
    assert.equal(view.user?.id, userId);
    const response = await handleOAuth(req("/oauth/consent", "POST", { request: flow.id, csrf: view.csrf!, decision: "approve" }, flow.cookie), "consent");
    assert.equal(response.status, 303, JSON.stringify(await response.clone().text()));
    const url = new URL(response.headers.get("location")!); assert.equal(url.searchParams.get("state"), flow.state);
    return { ...flow, code: url.searchParams.get("code")!, csrf: view.csrf! };
  };
  const exchange = (flow: Awaited<ReturnType<typeof approve>>, extra: Record<string,string> = {}) => handleOAuth(req("/oauth/token", "POST", { grant_type: "authorization_code", client_id: clientId, redirect_uri: callback, resource, code: flow.code, code_verifier: flow.verifier, ...extra }, ""), "token");
  const mint = async (scope = "read") => { const f = await approve(scope), response = await exchange(f); assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.expires_in, 900); assert.equal(result.refresh_token, undefined); return result.access_token as string; };
  const mcp = (token: string | null, method = "initialize", args: Record<string,unknown> = {}) => handleMcpPost(new Request(resource, { method: "POST", headers: { "Content-Type": "application/json", "MCP-Protocol-Version": "2025-06-18", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: method === "initialize" ? { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "core", version: "1" } } : args }) }));
  const tool = (token: string, name: string, args = {}) => mcp(token, "tools/call", { name, arguments: args });
  await t.test("trusted PRM/AS metadata and 401 discovery reject old and absent credentials", async () => {
    for (const action of ["resource", "server"] as const) {
      const response = await handleOAuth(new Request(`${issuer}/.well-known/ignored`, { headers: { Host: "evil.invalid", Forwarded: "host=evil.invalid" } }), action);
      const data = await response.json(); assert.equal(data.resource ?? data.issuer, action === "resource" ? resource : issuer);
      if (action === "server") { assert.deepEqual(data.code_challenge_methods_supported, ["S256"]); assert.deepEqual(data.grant_types_supported, ["authorization_code"]); }
    }
    for (const token of [null, "crier_sk_legacy", "gongzhi_grant_legacy", "upstream-zhihu-token"]) {
      const response = await mcp(token); assert.equal(response.status, 401); assert.match(response.headers.get("www-authenticate")!, /oauth-protected-resource\/mcp/); assert.match(response.headers.get("www-authenticate")!, /scope="read"/);
    }
    assert.equal((await handleMcpUnsupportedMethod(req("/mcp"))).status, 401);
  });
  await t.test("public DCR rejects unsafe callbacks and downgrade", async () => {
    for (const uri of ["http://evil.invalid/callback", "https://good.invalid/cb#fragment", "javascript:alert(1)", "https://u:p@good.invalid/cb"]) assert.equal((await register({ redirect_uris: [uri] })).status, 400);
    assert.equal((await register({ redirect_uris: [callback], token_endpoint_auth_method: "client_secret_basic" })).status, 400);
    const response = await register({ redirect_uris: [callback], client_name: "Core OAuth test", token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"] });
    assert.equal(response.status, 201); const data = await response.json(); clientId = data.client_id; assert.equal(data.client_secret, undefined);
  });
  await t.test("authorization requires exact client, redirect, S256 and resource", async () => {
    for (const override of [{ code_challenge_method: "plain" }, { code_challenge_method: "" }, { resource: "https://other.invalid/mcp" }, { resource: "" }, { redirect_uri: "http://127.0.0.1:47892/callback" }, { client_id: "unknown" }, { scope: "human" }] as Record<string,string>[]) assert.equal((await start("read", override)).response.status, 400);
    const flow = await start(); await assert.rejects(consentView(req(`/oauth/consent?request=${flow.id}`, "GET", undefined, sessionCookie), flow.id));
  });
  await t.test("explicit consent denies CSRF, cross-origin, wrong browser, replay and rejection", async () => {
    const f = await start(), view = await consentView(req("/oauth/consent", "GET", undefined, f.cookie), f.id);
    const data = { request: f.id, csrf: view.csrf!, decision: "deny" };
    assert.equal((await handleOAuth(req("/oauth/consent", "POST", { ...data, csrf: "wrong" }, f.cookie), "consent")).status, 403);
    const cross = req("/oauth/consent", "POST", data, f.cookie); cross.headers.set("origin", "https://evil.invalid");
    assert.equal((await handleOAuth(cross, "consent")).status, 403);
    const denied = await handleOAuth(req("/oauth/consent", "POST", data, f.cookie), "consent");
    assert.equal(new URL(denied.headers.get("location")!).searchParams.get("error"), "access_denied");
    assert.equal((await handleOAuth(req("/oauth/consent", "POST", data, f.cookie), "consent")).status, 400);
  });
  await t.test("token is bound to verifier, redirect, client and resource; parallel code use wins once", async () => {
    const flow = await approve();
    for (const extra of [{ code_verifier: random() }, { client_id: "wrong" }, { redirect_uri: "http://127.0.0.1:47892/callback" }, { resource: "https://other.invalid/mcp" }] as Record<string,string>[]) assert.equal((await exchange(flow, extra)).status, 400);
    const responses = await Promise.all([exchange(flow), exchange(flow)]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200,400]);
    const token = (await responses.find(r => r.status === 200)!.json()).access_token;
    assert.equal((await mcp(token)).status, 200);
    const expired = await approve(); await sql()`update gongzhi_oauth_codes set expires_at=clock_timestamp()-interval '1 second' where code_hash=${sha256(expired.code)}`;
    assert.equal((await exchange(expired)).status, 400);
  });
  await t.test("Agent mapped automatically; public tools usable; human-only and ungranted scopes stay denied", async () => {
    const token = await mint();
    const status = await tool(token, "agent_status"); assert.equal(status.status, 200); const value = (await status.json()).result.structuredContent.data;
    assert.equal(value.owner.kind, "external_agent"); assert.deepEqual(value.scopes, ["read"]); assert.ok(value.human_owner_id);
    const tools = (await (await mcp(token, "tools/list")).json()).result.tools;
    assert.ok(!tools.some((x: { name: string }) => x.name === "create_authorization"));
    assert.equal((await tool(token, "discover_board")).status, 200);
    const deniedWrite = await tool(token, "create_need", { title: "Denied OAuth write", body: "Read scope cannot publish this test request", idempotency_key: randomUUID() });
    assert.equal(deniedWrite.status, 403); assert.equal(deniedWrite.headers.get("www-authenticate"), null);
    for (const name of ["create_authorization", "create_content_approval", "decide_result", "register_agent"]) assert.equal((await tool(token, name)).status, 403);
    const rest = await handleGongzhiRequest(new Request(`${issuer}/api/gongzhi/agents/me`, { headers: { Authorization: `Bearer ${token}` } }), ["agents", "me"]);
    assert.equal(rest.status, 401, "MCP token is not passed through to REST");
    const noRead = await mint("discuss"); assert.equal((await tool(noRead, "discover_board")).status, 403);
  });
  await t.test("already-resolved actors recheck expiry and revocation inside domain transactions", async () => {
    const token = await mint(), actor = await resolveMcpIdentity(new Request(resource, { headers: { Authorization: `Bearer ${token}` } }));
    await sql()`update gongzhi_oauth_tokens set expires_at=clock_timestamp()-interval '1 second' where token_hash=${sha256(token)}`;
    await assert.rejects(inTransaction(() => assertIdentity(actor, true, "read")), { status: 401 });
    const second = await mint(), secondActor = await resolveMcpIdentity(new Request(resource, { headers: { Authorization: `Bearer ${second}` } }));
    await handleOAuth(req("/oauth/revoke", "POST", { token: second, client_id: clientId }, ""), "revoke");
    await assert.rejects(inTransaction(() => assertIdentity(secondActor, true, "read")), { status: 401 });
  });
  await t.test("issuer/audience, expiry, token revocation, owner rotation and original grant revocation are enforced", async () => {
    for (const field of ["issuer", "resource", "expires_at", "revoked_at", "owner", "grant", "version"] as const) {
      const token = await mint(), hash = sha256(token);
      if (field === "issuer") await sql()`update gongzhi_oauth_tokens set issuer='https://other.invalid' where token_hash=${hash}`;
      if (field === "resource") await sql()`update gongzhi_oauth_tokens set resource='https://other.invalid/mcp' where token_hash=${hash}`;
      if (field === "expires_at") await sql()`update gongzhi_oauth_tokens set expires_at=clock_timestamp()-interval '1 second' where token_hash=${hash}`;
      if (field === "revoked_at") assert.equal((await handleOAuth(req("/oauth/revoke", "POST", { token, client_id: clientId }, ""), "revoke")).status, 200);
      if (field === "owner") await sql()`update gongzhi_owners set revoked_at=clock_timestamp() where id=(select agent_id from gongzhi_oauth_tokens where token_hash=${hash})`;
      if (field === "version") await sql()`update gongzhi_owners set credential_version=credential_version+1 where id=(select agent_id from gongzhi_oauth_tokens where token_hash=${hash})`;
      if (field === "grant") {
        const [row] = await sql()`select grant_id from gongzhi_oauth_tokens where token_hash=${hash}`;
        const response = await handleGongzhiRequest(req(`/api/gongzhi/authorizations/${row.grant_id}`, "DELETE"), ["authorizations", row.grant_id]); assert.equal(response.status, 200);
      }
      assert.equal((await mcp(token)).status, 401, field);
    }
  });
  await t.test("existing login callback returns to persisted browser-bound consent without issuing MCP token", async () => {
    const f = await start();
    const startReq = new Request(`${issuer}/api/gongzhi/auth/zhihu/start`, { method: "POST", headers: { Cookie: f.cookie, Origin: issuer, "Content-Type": "application/json" }, body: "{}" });
    const started = await handleWebAuth(startReq, "start", undefined, f.id); assert.equal(started.status, 200);
    const data = await started.json(), state = new URL(data.data.authorization_url).searchParams.get("state");
    const cookies = `${f.cookie}; ${started.headers.getSetCookie()[0].split(";")[0]}`;
    const fixture: typeof fetch = async (url) => String(url).endsWith("access_token") ? Response.json({ access_token: "upstream-fixture-only", token_type: "Bearer", expires_in: 3600 }) : Response.json({ uid: String(Date.now()), fullname: "Local protocol identity" });
    const response = await handleWebAuth(req(`/auth/zhihu/callback?state=${state}&authorization_code=fixture`, "GET", undefined, cookies), "callback", fixture);
    assert.equal(response.headers.get("location"), `/oauth/consent?request=${f.id}`);
    assert.ok(!response.headers.get("location")!.includes("code="));
  });
});
