import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import postgres from "postgres";
import { bindOwner, changeOwner, resolveIdentity } from "../../lib/gongzhi/identity.ts";
import { closeNeed, createNeed, updateNeed, publishExperience, readExperience, submitResult, decideResult, readNeed, readInbox, getNetwork } from "../../lib/gongzhi/service.ts";
import { resolveRunIdentity, claimRun, cancelRun, finishRun, getRun, submitRunResult } from "../../lib/gongzhi/runs.ts";
import { handleGongzhiRequest } from "../../lib/gongzhi/http.ts";
import { handleMcpPost } from "../../lib/mcp.ts";
import { sql } from "../../lib/db.ts";
import type { SubmitResultInput } from "../../lib/gongzhi/contracts.ts";

const configPath = process.env.GONGZHI_TEST_DATABASE_ENV;
test("real isolated Postgres: bindings, immutable history, revision, idempotency and run races", { skip: !configPath }, async (t) => {
  for (const line of (await readFile(configPath!, "utf8")).split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line); if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(process.env.DATABASE_URL!).hostname), "test database must be loopback");
  process.env.GONGZHI_DATABASE_ENABLED = "true";
  const prefix = randomUUID(); const userA = randomUUID(); const userB = randomUUID();
  // Local HTTP stub exercises Supabase getUser integration, not live Supabase Auth.
  const auth = createServer((req, res) => {
    const token = req.headers.authorization;
    if (token === "Bearer auth-outage") { res.writeHead(503, { "content-type": "application/json" }); res.end(JSON.stringify({ message: "auth unavailable" })); return; }
    const id = token === "Bearer test-human-a" ? userA : token === "Bearer test-human-b" ? userB : null;
    res.writeHead(id ? 200 : 401, { "content-type": "application/json" });
    res.end(JSON.stringify(id ? { id, aud: "authenticated", role: "authenticated", email: `${id}@example.invalid`, created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} } : { message: "invalid token", code: "bad_jwt" }));
  });
  await new Promise<void>((resolve) => auth.listen(0, "127.0.0.1", resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${(auth.address() as { port: number }).port}`;
  process.env.SUPABASE_ANON_KEY = "local-test-anon-key";
  process.env.GONGZHI_AUTH_ENABLED = "true";
  const admin = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1, onnotice: () => {} });
  t.after(async () => { auth.closeAllConnections(); await new Promise<void>((resolve) => auth.close(() => resolve())); await admin.end(); await sql().end(); });
  const req = (token: string) => new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } });
  const humanARequest = req("test-human-a"), humanBRequest = req("test-human-b");
  const aBound = await bindOwner(humanARequest, { name: "A", kind: "human" });
  const bBound = await bindOwner(humanBRequest, { name: "B", kind: "human" });
  const agentBound = await bindOwner(humanBRequest, { name: "B Agent", kind: "external_agent" });
  const a = await resolveIdentity(humanARequest), b = await resolveIdentity(humanBRequest);
  const agent = await resolveIdentity(req(agentBound.api_key!));
  const initial = { title: `${prefix} need`, body: `${prefix} original need`, constraints: "限制", expected_result: "文字成果", tags: [], visibility: "public" as const, idempotency_key: `${prefix}:create` };
  const need = await createNeed(a, initial);
  const experience = await publishExperience(b, { title: `${prefix} method`, body: `${prefix} method original`, idempotency_key: `${prefix}:experience` });
  const resultInput: SubmitResultInput = { need_id: need.id, need_revision: 1, title: "实际成果", body: `${prefix} new result`, subtype: "result", sources: [], method_refs: [{ experience_id: experience.id, revision: 1, usage: "使用所述方法" }], idempotency_key: `${prefix}:result` };
  const [result, repeated] = await Promise.all([submitResult(agent, resultInput), submitResult(agent, resultInput)]);
  await t.test("two humans and agent are distinct authenticated owners", () => { assert.notEqual(aBound.owner.id, bBound.owner.id); assert.notEqual(agent.owner.id, b.owner.id); assert.equal(agent.user_id, userB); });
  await t.test("real app connection is non-superuser and has no BYPASSRLS", async () => { const [role] = await sql()`select rolsuper,rolbypassrls from pg_roles where rolname=current_user`; assert.equal(role.rolsuper, false); assert.equal(role.rolbypassrls, false); });
  await t.test("concurrent same-key result submission inserts once", async () => { assert.equal(result.id, repeated.id); const [count] = await sql()`select count(*)::int n from posts where publisher_id=${agent.owner.publisher_id} and idempotency_key=${resultInput.idempotency_key}`; assert.equal(count.n, 1); });
  await t.test("same key with different content is a conflict", async () => { await assert.rejects(submitResult(agent, { ...resultInput, body: "changed" }), { code: "idempotency_conflict" }); });
  await t.test("cross-owner edit and agent acceptance fail", async () => {
    await assert.rejects(updateNeed(b, need.id, { ...initial, expected_revision: 1, idempotency_key: `${prefix}:foreign-edit` }), { code: "forbidden" });
    await assert.rejects(decideResult(agent, need.id, { result_id: result.id, expected_revision: 1, decision: "accept", idempotency_key: `${prefix}:agent-accept` }), { code: "forbidden" });
  });
  await t.test("owner revision invalidates old result acceptance and preserves original result", async () => {
    const updated = await updateNeed(a, need.id, { ...initial, body: `${prefix} revised need`, expected_revision: 1, idempotency_key: `${prefix}:edit` }); assert.equal(updated.revision, 2);
    await assert.rejects(decideResult(a, need.id, { result_id: result.id, expected_revision: 2, decision: "accept", idempotency_key: `${prefix}:stale-accept` }), { code: "revision_conflict" });
    const decision = { result_id: result.id, expected_revision: 2, decision: "accept", idempotency_key: `${prefix}:stale-via-http` };
    const rest = await handleGongzhiRequest(new Request(`http://localhost/api/gongzhi/needs/${need.id}/decisions`, { method: "POST", headers: { Authorization: "Bearer test-human-a" }, body: JSON.stringify(decision) }), ["needs", need.id, "decisions"]);
    assert.equal(rest.status, 409); assert.equal((await rest.json()).error.code, "revision_conflict");
    const mcp = await handleMcpPost(new Request("http://localhost/mcp", { method: "POST", headers: { Authorization: "Bearer test-human-a" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "decide_result", arguments: { ...decision, need_id: need.id } } }) }));
    assert.equal((await mcp.json()).result.structuredContent.error.code, "revision_conflict");
    assert.equal((await readNeed(a, need.id)).results[0].body, resultInput.body);
    await assert.rejects(submitResult(agent, { ...resultInput, idempotency_key: `${prefix}:stale-submit` }), { code: "revision_conflict" });
  });
  await t.test("experience new version does not overwrite original", async () => {
    const newer = await publishExperience(b, { title: "v2", body: `${prefix} second method version`, previous_version_id: experience.id, idempotency_key: `${prefix}:experience-v2` });
    assert.equal(newer.revision, 2); assert.equal((await readExperience(experience.id)).body, `${prefix} method original`);
    await assert.rejects(sql()`update posts set body='tampered' where id=${experience.id}`, /immutable gongzhi history/);
  });
  await t.test("need owner accepts current result once and graph has evidence", async () => {
    const current = await submitResult(agent, { ...resultInput, need_revision: 2, body: `${prefix} revision 2 result`, idempotency_key: `${prefix}:result-v2` });
    const input = { result_id: current.id, expected_revision: 2, decision: "accept", idempotency_key: `${prefix}:accept` };
    const first = await decideResult(a, need.id, input); const second = await decideResult(a, need.id, input); assert.equal(first.id, second.id);
    assert.equal((await readNeed(a, need.id)).need.accepted_result_id, current.id);
    assert.ok((await getNetwork()).graph.edges.some((edge) => edge.evidence_id === first.id && edge.type === "accepted"));
    assert.ok((await readInbox(a)).items.some((item) => item.post.id === current.id));
  });
  await t.test("cross-owner revoke fails; rotation invalidates old key and resolved identities", async () => {
    await assert.rejects(changeOwner(humanARequest, agent.owner.id, false), { code: "not_found" });
    const rotated = await changeOwner(humanBRequest, agent.owner.id, true); assert.ok("api_key" in rotated);
    await assert.rejects(resolveIdentity(req(agentBound.api_key!)), { code: "unbound_identity" });
    await assert.rejects(readNeed(agent, need.id), { code: "revoked" });
    const newActor = await resolveIdentity(req((rotated as { api_key: string }).api_key));
    await changeOwner(humanBRequest, newActor.owner.id, false);
    await assert.rejects(readNeed(newActor, need.id), { code: "revoked" });
    assert.equal((await readNeed(a, need.id)).results.length, 2);
  });
  await t.test("REST and MCP cannot fake owner or bypass revoked key", async () => {
    const input = { ...initial, owner_id: b.owner.id };
    const rest = await handleGongzhiRequest(new Request("http://localhost/api/gongzhi/needs", { method: "POST", headers: { Authorization: "Bearer test-human-a" }, body: JSON.stringify(input) }), ["needs"]); assert.equal(rest.status, 400);
    const mcp = await handleMcpPost(new Request("http://localhost/mcp", { method: "POST", headers: { Authorization: `Bearer ${agentBound.api_key}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "submit_result", arguments: resultInput } }) }));
    assert.equal((await mcp.json()).result.isError, true);
  });
  await t.test("browser Data API roles cannot write tables or call write functions", async () => {
    for (const role of ["anon", "authenticated"]) {
      const [access] = await admin`select has_table_privilege(${role},'posts','INSERT') can_write,has_function_privilege(${role},'bump_stat(text,bigint)','EXECUTE') can_rpc`;
      assert.equal(access.can_write, false); assert.equal(access.can_rpc, false);
    }
  });
  await t.test("run claim deduplication, cancellation CAS, deadline and foreign owner", async () => {
    const runNeed = await createNeed(a, { ...initial, body: `${prefix} run need`, idempotency_key: `${prefix}:run-need` });
    const platform = await resolveRunIdentity(humanARequest), other = await resolveRunIdentity(humanBRequest);
    const runInput = { need_id: runNeed.id, need_revision: 1, idempotency_key: `${prefix}:run` };
    const deadline = new Date(Date.now() + 60000).toISOString();
    const claims = await Promise.all([claimRun(platform, runInput, deadline), claimRun(platform, runInput, deadline)]);
    assert.equal(claims.filter((c) => c.created).length, 1); const run = claims[0].run;
    await assert.rejects(claimRun(platform, { ...runInput, idempotency_key: `${prefix}:another-run` }, deadline), { code: "budget_exceeded" });
    await assert.rejects(getRun(other, run.id), { code: "not_found" });
    await cancelRun(platform, run.id);
    await assert.rejects(submitRunResult(platform, run.id, { ...resultInput, need_id: runNeed.id, idempotency_key: `${prefix}:cancelled-result` }), { code: "cancelled" });
    const finished = await finishRun(platform, run.id, { status: "succeeded", result_id: "forged", error: null, usage: { model_steps: 2, zhihu_queries: 1, input_tokens: 50, output_tokens: null } }); assert.equal(finished.status, "cancelled");
    assert.equal(finished.usage.model_steps, 2); assert.equal(finished.usage.zhihu_queries, 1);
    const settledAgain = await finishRun(platform, run.id, { status: "failed", result_id: null, error: null, usage: run.usage }); assert.equal(settledAgain.usage.model_steps, 2);
    const replay = await claimRun(platform, runInput, deadline); assert.equal(replay.created, false); assert.equal(replay.run.status, "cancelled");
    const fresh = await claimRun(platform, { ...runInput, idempotency_key: `${prefix}:timeout-run` }, deadline);
    await admin`update gongzhi_runs set deadline_at=now()-interval '1 second' where id=${fresh.run.id}`;
    assert.equal((await getRun(platform, fresh.run.id)).status, "timed_out");
    await assert.rejects(submitRunResult(platform, fresh.run.id, { ...resultInput, need_id: runNeed.id, idempotency_key: `${prefix}:late-result` }), { code: "cancelled" });
    const successful = await claimRun(platform, { ...runInput, idempotency_key: `${prefix}:successful-run` }, new Date(Date.now() + 60000).toISOString());
    const runResultInput = { ...resultInput, need_id: runNeed.id, body: `${prefix} platform new result`, idempotency_key: `${prefix}:platform-result` };
    const submitted = await submitRunResult(platform, successful.run.id, runResultInput);
    assert.equal((await submitRunResult(platform, successful.run.id, runResultInput)).id, submitted.id);
    await assert.rejects(submitRunResult(platform, successful.run.id, { ...runResultInput, idempotency_key: `${prefix}:second-platform-result` }), { code: "idempotency_conflict" });
    const completed = await finishRun(platform, successful.run.id, { status: "succeeded", result_id: submitted.id, error: null, usage: successful.run.usage });
    assert.equal(completed.status, "succeeded"); assert.equal((await cancelRun(platform, successful.run.id)).status, "succeeded");
    const [stored] = await sql()`select metadata from posts where id=${submitted.id}`;
    assert.equal(stored.metadata.gongzhi.owner_kind, "platform_agent"); assert.equal(stored.metadata.gongzhi.run_id, successful.run.id);
  });
  await t.test("invalid auth is 401 but Supabase outage is 503", async () => {
    await assert.rejects(bindOwner(req("bad-token"), { name: "bad", kind: "human" }), { status: 401 });
    await assert.rejects(bindOwner(req("auth-outage"), { name: "outage", kind: "human" }), { status: 503 });
  });
  await t.test("only human owner can close; retries preserve history and prevent new results/runs", async () => {
    const open = await createNeed(a, { ...initial, body: `${prefix} close need`, idempotency_key: `${prefix}:close-need` });
    const input = { expected_revision: 1, idempotency_key: `${prefix}:close` };
    await assert.rejects(closeNeed(b, open.id, input), { code: "forbidden" });
    assert.equal((await closeNeed(a, open.id, input)).status, "closed");
    assert.equal((await closeNeed(a, open.id, input)).status, "closed");
    await assert.rejects(submitResult(b, { ...resultInput, need_id: open.id, idempotency_key: `${prefix}:closed-result` }), { code: "revision_conflict" });
    const platform = await resolveRunIdentity(humanARequest);
    await assert.rejects(claimRun(platform, { need_id: open.id, need_revision: 1, idempotency_key: `${prefix}:closed-run` }, new Date(Date.now()+60000).toISOString()), { code: "revision_conflict" });
  });
});
