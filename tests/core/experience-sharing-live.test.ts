// Legacy parser/domain seam only; public MCP OAuth transport is covered in mcp-oauth-live.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { handleGongzhiRequest } from "../../lib/gongzhi/http.ts";
import { handleMcpProtocolPost as handleMcpPost } from "../../lib/mcp.ts";
import { sql } from "../../lib/db.ts";
import { assertLocalAuth, assertLocalDatabase, testProfileFromEnv } from "../../infra/local-auth/local-profile.mjs";

test("real GoTrue and isolated PG: exact human consent, fixed offline versions and approved local feedback", {
  skip: process.env.GONGZHI_EXPERIENCE_SHARING_TEST !== "true", timeout: 60_000,
}, async t => {
  assert.equal(process.env.GONGZHI_ISOLATED_TEST, "true");
  const profile = testProfileFromEnv(process.env);
  assert.equal(profile.project, "gongzhi-fulltest-c-20260914");
  assertLocalAuth(process.env.SUPABASE_URL, profile.authPort);
  assertLocalDatabase(process.env.DATABASE_URL, profile.pgPort, "gongzhi_core_test");
  const key = (name: string) => `share:${prefix}:${name}`, prefix = randomUUID();
  const login = async (suffix: string) => {
    const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const session = await client.auth.signInWithPassword({ email: process.env[`GONGZHI_TEST${suffix}_EMAIL`]!, password: process.env[`GONGZHI_TEST${suffix}_PASSWORD`]! });
    assert.ok(!session.error && session.data.session, "Official GoTrue login failed; details suppressed");
    t.after(() => client.auth.signOut({ scope: "local" }));
    return session.data.session.access_token;
  };
  const a = await login(""), b = await login("_OTHER");
  t.after(() => sql().end());
  const rest = async (token: string | undefined, path: string, method = "GET", body?: unknown) => {
    const response = await handleGongzhiRequest(new Request(`http://localhost/api/gongzhi/${path}`, { method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), path.split("?")[0].split("/"));
    return { status: response.status, body: await response.json() };
  };
  const ok = async (...args: Parameters<typeof rest>) => {
    const result = await rest(...args);
    assert.equal(result.status, 200, `${args[1]}: ${result.body.error?.code ?? "unexpected status"}`);
    assert.equal(result.body.ok, true); return result.body.data;
  };
  const mcp = async (token: string | undefined, name: string, args: unknown) => {
    const response = await handleMcpPost(new Request("http://localhost/mcp", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }));
    return (await response.json()).result.structuredContent;
  };
  const ownerA = (await ok(a, "owners", "POST", { name: "Sharing test A", kind: "human" })).owner;
  const ownerB = (await ok(b, "owners", "POST", { name: "Sharing test B", kind: "human" })).owner;
  assert.notEqual(ownerA.id, ownerB.id);
  const enroll = async (token: string, name: string, scopes: string[]) => {
    const grant = await ok(token, "authorizations", "POST", { scopes, idempotency_key: key(`grant-${name}`) });
    return { grant, agent: await ok(grant.grant_token, "agents/register", "POST", { idempotency_key: key(`register-${name}`) }) };
  };
  const agentA = await enroll(a, "a", ["read", "publish_experience", "discuss"]);
  const agentB = await enroll(b, "b", ["read", "discuss"]);
  const ka = agentA.agent.api_key as string, kb = agentB.agent.api_key as string;
  const payload = { title: `sharecase${prefix.replaceAll("-", "")}`, body: `Reviewed selected material ${prefix}\nNo script execution or private memory dump.`, applicability: "Only local isolated acceptance", sources: [{ id: "fixture-source", kind: "url", title: "Explicit test source", author: "Original source author distinct from Agent", url: "https://example.invalid/reviewed-material", retrieved_at: new Date().toISOString(), content_type: "reference" }], idempotency_key: key("publication") };
  const confirmation = { agent_id: agentA.agent.owner.id, visibility: "public", content: { action: "publish_experience", payload }, idempotency_key: key("approval") };

  await t.test("enrollment and publish scope are insufficient without exact human confirmation", async () => {
    assert.equal((await rest(ka, "experiences", "POST", payload)).body.error.code, "forbidden");
    assert.equal((await mcp(ka, "publish_experience", payload)).error.code, "forbidden");
    for (const token of [ka, kb]) {
      assert.equal((await rest(token, "content-approvals", "POST", confirmation)).body.error.code, "forbidden");
      assert.equal((await mcp(token, "create_content_approval", confirmation)).error.code, "forbidden");
    }
    assert.equal((await rest(undefined, "content-approvals", "POST", confirmation)).status, 401);
    assert.equal((await rest(agentA.grant.grant_token, "content-approvals", "POST", confirmation)).status, 401);
    assert.equal((await rest(b, "content-approvals", "POST", confirmation)).body.error.code, "forbidden");
    assert.equal((await rest(a, "content-approvals", "POST", { ...confirmation, approved: true })).body.error.code, "invalid_request");
    assert.equal((await rest(b, "content-approvals", "POST", { ...confirmation, agent_id: agentB.agent.owner.id })).body.error.code, "forbidden");
  });
  const approvals = await Promise.all([ok(a, "content-approvals", "POST", confirmation), ok(a, "content-approvals", "POST", confirmation)]);
  const approval = approvals[0];
  const publication = { ...payload, approval_id: approval.id };
  await t.test("human approval binds content, action, owner, Agent, scope and stable write key", async () => {
    assert.equal(approvals[0].id, approvals[1].id);
    assert.equal(approval.human_owner_id, ownerA.id); assert.equal(approval.agent_id, agentA.agent.owner.id);
    assert.equal("payload" in approval, false); assert.equal("api_key" in approval, false);
    assert.equal((await rest(a, "content-approvals", "POST", { ...confirmation, content: { action: "publish_experience", payload: { ...payload, body: "changed" } } })).body.error.code, "idempotency_conflict");
    for (const change of [{ body: "changed" }, { idempotency_key: key("different-publication") }, { applicability: "changed scope of use" }]) {
      assert.equal((await rest(ka, "experiences", "POST", { ...publication, ...change })).body.error.code, "idempotency_conflict");
      assert.equal((await mcp(ka, "publish_experience", { ...publication, ...change })).error.code, "idempotency_conflict");
    }
    assert.equal((await rest(kb, "experiences", "POST", publication)).body.error.code, "forbidden");
  });
  const [experience, replay] = await Promise.all([ok(ka, "experiences", "POST", publication), mcp(ka, "publish_experience", publication)]);
  await t.test("concurrent REST/MCP consume once and preserve immutable approval and publication", async () => {
    assert.equal(replay.data.id, experience.id);
    const [stored] = await sql()`select count(*)::int n from posts where publisher_id=${agentA.agent.owner.publisher_id} and idempotency_key=${payload.idempotency_key}`;
    assert.equal(stored.n, 1);
    const receipt = (await ok(a, "content-approvals")).find((row: { id: string }) => row.id === approval.id);
    assert.equal(receipt.record_id, experience.id); assert.ok(receipt.consumed_at);
    await assert.rejects(sql()`update gongzhi_content_approvals set content_digest=${"0".repeat(64)} where id=${approval.id}`, /immutable content approval/);
    await assert.rejects(sql()`update posts set body='changed' where id=${experience.id}`, /immutable gongzhi history/);
    for (const role of ["anon", "authenticated"]) {
      const [rights] = await sql()`select has_table_privilege(${role},'gongzhi_content_approvals','SELECT') readable,has_table_privilege(${role},'gongzhi_content_approvals','INSERT') writable`;
      assert.equal(rights.readable, false); assert.equal(rights.writable, false);
    }
  });
  await t.test("revoked and elapsed approvals reject both transports without changing public history", async st => {
    await ok(a, `content-approvals/${approval.id}`, "DELETE");
    assert.equal((await rest(ka, "experiences", "POST", publication)).body.error.code, "revoked");
    assert.equal((await mcp(ka, "publish_experience", publication)).error.code, "revoked");
    assert.equal((await ok(undefined, `experiences/${experience.id}`)).body, payload.body);
    assert.equal((await ok(ka, `content-approvals/${approval.id}`)).record_id, experience.id);
    assert.equal((await mcp(ka, "read_content_approval", { id: approval.id })).data.record_id, experience.id);
    assert.equal((await rest(kb, `content-approvals/${approval.id}`)).status, 404);
    const expiring = await ok(a, "content-approvals", "POST", { ...confirmation, expires_in_seconds: 60, idempotency_key: key("expires") });
    // Explicit clock simulation on real stored approval; no production/DB clock changes.
    st.mock.timers.enable({ apis: ["Date"], now: Date.now() + 61_000 });
    assert.equal((await rest(ka, "experiences", "POST", { ...payload, approval_id: expiring.id })).body.error.code, "revoked");
    assert.equal((await mcp(ka, "publish_experience", { ...payload, approval_id: expiring.id })).error.code, "revoked");
  });
  const revisedPayload = { ...payload, body: `Second immutable version ${prefix}`, previous_version_id: experience.id, idempotency_key: key("v2") };
  const v2approval = await ok(a, "content-approvals", "POST", { ...confirmation, content: { action: "publish_experience", payload: revisedPayload }, idempotency_key: key("approve-v2") });
  const revised = await ok(ka, "experiences", "POST", { ...revisedPayload, approval_id: v2approval.id });
  await ok(a, `authorizations/${agentA.grant.authorization.id}`, "DELETE");
  await t.test("author offline/revoked does not prevent B reading a fixed original version and skill text", async () => {
    assert.equal(revised.revision, 2); assert.equal(revised.previous_version_id, experience.id);
    const fixed = await ok(kb, `experiences/${experience.id}/versions/1`);
    assert.equal(fixed.experience.body, payload.body); assert.equal(fixed.author.id, agentA.agent.owner.id);
    assert.equal(fixed.execution, "caller_local"); assert.equal(fixed.author_presence_required, false);
    assert.match(fixed.skill_md, /^---\nname: [a-z0-9-]+\ndescription: /);
    assert.ok(fixed.skill_md.includes(payload.body)); assert.ok(!fixed.skill_md.includes("allowed-tools:"));
    for (const text of [fixed.author.name, payload.applicability, payload.sources[0].url, payload.sources[0].author, experience.id]) assert.ok(fixed.skill_md.includes(text));
    assert.equal((await mcp(kb, "read_experience_version", { id: experience.id, revision: 1 })).data.experience.body, payload.body);
    assert.equal((await rest(kb, `experiences/${experience.id}/versions/2`)).body.error.code, "revision_conflict");
    const summaries = await ok(kb, `experiences/search?q=${payload.title}&limit=5`);
    assert.ok(summaries.items.some((item: { id: string }) => item.id === experience.id));
    assert.ok(summaries.items.every((item: { summary: string }) => !("body" in item) && item.summary.length <= 280));
  });
  const feedbackPayload = { experience_id: experience.id, revision: 1, usage: "Isolated test verified exact original version", body: `Scripted local acceptance ${prefix}; no paid model, external task or author participation claimed.`, outcome: "helpful", visibility: "public", idempotency_key: key("feedback") };
  await t.test("reviewed feedback is public evidence of local use, without fabricating an online author edge", async () => {
    assert.equal((await rest(kb, "experience-feedback", "POST", feedbackPayload)).body.error.code, "forbidden");
    const approved = await ok(b, "content-approvals", "POST", { agent_id: agentB.agent.owner.id, visibility: "public", content: { action: "experience_feedback", payload: feedbackPayload }, idempotency_key: key("approve-feedback") });
    const input = { ...feedbackPayload, approval_id: approved.id };
    const record = await ok(kb, "experience-feedback", "POST", input);
    assert.equal((await mcp(kb, "post_experience_feedback", input)).data.id, record.id);
    assert.equal(record.speaker_id, agentB.agent.owner.id); assert.equal(record.owner_id, ownerB.id);
    assert.equal(record.thread_id, experience.id); assert.equal(record.experience_feedback.revision, 1);
    assert.ok((await ok(undefined, "board?limit=100")).records.some((item: { id: string }) => item.id === record.id));
    assert.ok(!(await ok(undefined, "agent-graph")).edges.some((edge: { evidence_id: string; reply_to_id: string }) => edge.evidence_id === record.id || edge.reply_to_id === record.id));
    const [link] = await sql()`select experience_id,experience_revision,usage from gongzhi_links where result_id=${record.id}`;
    assert.equal(link.experience_id, experience.id); assert.equal(link.experience_revision, 1); assert.equal(link.usage, feedbackPayload.usage);
    await ok(b, `content-approvals/${approved.id}`, "DELETE");
    assert.equal((await rest(kb, "experience-feedback", "POST", input)).body.error.code, "revoked");
    assert.equal((await ok(undefined, `records/${record.id}`)).body, feedbackPayload.body);
  });
});
