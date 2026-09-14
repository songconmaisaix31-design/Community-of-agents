import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { verifiedUser } from "../../lib/gongzhi/identity.ts";
import { handleGongzhiRequest } from "../../lib/gongzhi/http.ts";
import { handleMcpPost } from "../../lib/mcp.ts";
import { sql } from "../../lib/db.ts";

test("real GoTrue + dedicated PG: human login, scoped enrollment and shared REST/MCP enforcement", { skip: process.env.GONGZHI_REAL_AUTH_TEST !== "true" }, async t => {
  const authUrl = new URL(process.env.SUPABASE_URL!);
  const dbUrl = new URL(process.env.DATABASE_URL!);
  assert.equal(authUrl.hostname, "127.0.0.1"); assert.equal(authUrl.port, "56521");
  assert.equal(dbUrl.hostname, "127.0.0.1"); assert.equal(dbUrl.port, "56520"); assert.equal(dbUrl.pathname, "/gongzhi_core_test");
  const uid = randomUUID(), key = (name: string) => `real-auth:${uid}:${name}`;
  const req = (token: string) => new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } });
  const login = async (suffix: string) => {
    const client = createClient(authUrl.toString(), process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await client.auth.signInWithPassword({ email: process.env[`GONGZHI_TEST${suffix}_EMAIL`]!, password: process.env[`GONGZHI_TEST${suffix}_PASSWORD`]! });
    assert.ok(!result.error && result.data.session && result.data.user, "official GoTrue must issue the real user session");
    t.after(async () => { await client.auth.signOut({ scope: "local" }); client.auth.stopAutoRefresh(); });
    return { client, token: result.data.session.access_token, user: result.data.user };
  };
  t.after(async () => { await sql().end(); });
  const a = await login(""), b = await login("_OTHER"), unbound = await login("_UNBOUND");
  const rest = async (token: string, path: string, method = "GET", input?: unknown) => {
    const response = await handleGongzhiRequest(new Request(`http://localhost/api/gongzhi/${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) }), path.split("/"));
    return { status: response.status, body: await response.json() };
  };
  const ok = async (token: string, path: string, method = "GET", input?: unknown) => {
    const response = await rest(token, path, method, input);
    assert.equal(response.status, 200, `REST ${path}: ${response.body.error?.code ?? "unexpected status"}`);
    assert.equal(response.body.ok, true); return response.body.data;
  };
  const mcp = async (token: string, name: string, input: unknown) => {
    const response = await handleMcpPost(new Request("http://localhost/mcp", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: input } }) }));
    return (await response.json()).result.structuredContent;
  };
  const needInput = { title: `Core verification ${uid}`, body: `Automated real Auth/PG verification ${uid}; not an autonomous model run.`, idempotency_key: key("need") };
  await t.test("GoTrue login and server getUser agree; wrong passwords, forged tokens and unbound writers fail", async () => {
    assert.equal(await verifiedUser(req(a.token)), a.user.id);
    const wrong = await a.client.auth.signInWithPassword({ email: a.user.email!, password: "deliberately-wrong-password" });
    assert.ok(wrong.error); assert.equal(wrong.data.session, null);
    await assert.rejects(verifiedUser(req("invalid-forged-token")), { code: "unauthenticated" });
    const denied = await rest(unbound.token, "needs", "POST", needInput);
    assert.equal(denied.status, 403); assert.equal(denied.body.error.code, "unbound_identity");
  });
  const human = (await ok(a.token, "owners", "POST", { kind: "human", name: "Core verification owner" })).owner;
  await ok(b.token, "owners", "POST", { kind: "human", name: "Core verification other" });
  const scopes = ["read", "publish_need", "publish_experience", "submit_result", "discuss"];
  const grantInput = { scopes, idempotency_key: key("grant") };
  const grant = await ok(a.token, "authorizations", "POST", grantInput);
  const agent = await ok(grant.grant_token, "agents/register", "POST", { idempotency_key: key("registration") });
  const agentToken = agent.api_key as string;
  assert.ok(agentToken?.startsWith("crier_sk_"));
  await t.test("human grants finite scope; self-registration needs no profile and refuses owner/scope claims", async () => {
    assert.equal(agent.owner.kind, "external_agent"); assert.ok(agent.owner.name);
    const replay = await ok(grant.grant_token, "agents/register", "POST", { idempotency_key: key("registration") });
    assert.equal(replay.owner.id, agent.owner.id); assert.equal(replay.api_key, undefined); assert.equal(replay.credential_state, "not_recoverable");
    assert.equal((await ok(a.token, "authorizations", "POST", grantInput)).grant_token, undefined);
    for (const extra of [{ owner_id: "forged" }, { scopes: ["discuss"] }]) assert.equal((await rest(grant.grant_token, "agents/register", "POST", { idempotency_key: key("registration"), ...extra })).body.error.code, "invalid_request");
    assert.equal((await rest(agentToken, "authorizations", "POST", grantInput)).body.error.code, "forbidden");
  });
  const need = await ok(agentToken, "needs", "POST", needInput);
  await t.test("delegation preserves human ownership and Agent speech; REST/MCP retries share idempotency", async () => {
    assert.equal(need.owner_id, human.id); assert.equal(need.publisher_id, agent.owner.publisher_id);
    const record = await ok(agentToken, `records/${need.id}`);
    assert.equal(record.owner_id, human.id); assert.equal(record.speaker_id, agent.owner.id);
    assert.equal((await ok(agentToken, "needs", "POST", needInput)).id, need.id);
    const replay = await mcp(agentToken, "create_need", needInput); assert.equal(replay.data.id, need.id);
    assert.equal((await rest(agentToken, "needs", "POST", { ...needInput, body: "changed" })).body.error.code, "idempotency_conflict");
    assert.equal((await mcp(agentToken, "create_need", { ...needInput, body: "changed" })).error.code, "idempotency_conflict");
  });
  const limitedGrant = await ok(a.token, "authorizations", "POST", { scopes: ["read"], idempotency_key: key("limited-grant") });
  const limited = await ok(limitedGrant.grant_token, "agents/register", "POST", { capabilities: ["publish_need", "discuss"], idempotency_key: key("limited-reg") });
  await t.test("descriptive capabilities do not elevate scope through either transport", async () => {
    assert.equal((await rest(limited.api_key, "needs", "POST", needInput)).body.error.code, "forbidden");
    assert.equal((await mcp(limited.api_key, "create_need", needInput)).error.code, "forbidden");
  });
  const result = await ok(agentToken, "results", "POST", { need_id: need.id, need_revision: 1, title: `Verification result ${uid}`, body: `Immutable test result ${uid}`, idempotency_key: key("result") });
  await t.test("only owning human can decide; stale revisions cannot be accepted via REST or MCP", async () => {
    const decision = { result_id: result.id, expected_revision: 1, decision: "accept", idempotency_key: key("decision") };
    for (const token of [agentToken, b.token]) {
      assert.equal((await rest(token, `needs/${need.id}/decisions`, "POST", decision)).body.error.code, "forbidden");
      assert.equal((await mcp(token, "decide_result", { ...decision, need_id: need.id })).error.code, "forbidden");
    }
    await ok(a.token, `needs/${need.id}`, "PATCH", { ...needInput, body: `Updated requirement ${uid}`, expected_revision: 1, idempotency_key: key("update") });
    assert.equal((await rest(a.token, `needs/${need.id}/decisions`, "POST", decision)).body.error.code, "revision_conflict");
    assert.equal((await mcp(a.token, "decide_result", { ...decision, need_id: need.id })).error.code, "revision_conflict");
    await assert.rejects(sql()`update posts set body='rewritten' where id=${result.id}`, /immutable gongzhi history/);
  });
  await t.test("graph uses readable Agent replies and excludes human replies and content nodes", async () => {
    const otherGrant = await ok(b.token, "authorizations", "POST", { scopes: ["read", "discuss"], idempotency_key: key("other-grant") });
    const otherAgent = await ok(otherGrant.grant_token, "agents/register", "POST", { idempotency_key: key("other-registration") });
    const reply = await ok(otherAgent.api_key, "discussions", "POST", { thread_id: need.id, category: "reply", expected_revision: 2, body: `Automated persisted reply ${uid}`, idempotency_key: key("reply") });
    const humanReply = await ok(a.token, "discussions", "POST", { thread_id: need.id, category: "reply", expected_revision: 2, body: `Human account test reply ${uid}`, idempotency_key: key("human-reply") });
    const graph = await ok(a.token, "agent-graph");
    assert.ok(graph.nodes.every((node: {kind:string}) => ["external_agent", "platform_agent"].includes(node.kind)));
    const edge = graph.edges.find((value: {evidence_id:string}) => value.evidence_id === reply.id);
    assert.ok(edge); assert.equal(edge.source, otherAgent.owner.id); assert.equal(edge.target, agent.owner.id);
    assert.ok(!graph.edges.some((value: {evidence_id:string}) => value.evidence_id === humanReply.id));
    for (const id of [edge.evidence_id, edge.reply_to_id]) assert.equal((await ok(a.token, `records/${id}`)).mode, "live");
    assert.equal((await mcp(a.token, "read_record", { id: reply.id })).data.id, reply.id);
    await assert.rejects(sql()`update posts set body='rewritten' where id=${reply.id}`, /immutable gongzhi history/);
  });
  await t.test("current result adoption succeeds only for the human and has a shared immutable receipt", async () => {
    const current = await ok(agentToken, "results", "POST", { need_id: need.id, need_revision: 2, title: `Current result ${uid}`, body: `Current immutable test result ${uid}`, idempotency_key: key("result-v2") });
    const decision = { result_id: current.id, expected_revision: 2, decision: "accept", idempotency_key: key("accept-v2") };
    const accepted = await ok(a.token, `needs/${need.id}/decisions`, "POST", decision);
    const replay = await mcp(a.token, "decide_result", { ...decision, need_id: need.id });
    assert.equal(replay.data.id, accepted.id); assert.equal(accepted.owner_id, human.id);
    const detail = await ok(a.token, `needs/${need.id}`); assert.equal(detail.need.status, "accepted"); assert.equal(detail.need.accepted_result_id, current.id);
  });
  await t.test("revocation blocks replayed writes and registration, retaining public immutable history", async () => {
    const before = await ok(agentToken, `records/${result.id}`);
    await ok(a.token, `authorizations/${grant.authorization.id}`, "DELETE");
    assert.equal((await rest(agentToken, "needs", "POST", needInput)).body.error.code, "revoked");
    assert.equal((await mcp(agentToken, "create_need", needInput)).error.code, "revoked");
    assert.equal((await rest(grant.grant_token, "agents/register", "POST", { idempotency_key: key("registration") })).body.error.code, "revoked");
    const after = await ok(a.token, `records/${result.id}`); assert.equal(after.body, before.body); assert.equal(after.speaker_id, before.speaker_id);
  });
});
