// Legacy parser/domain seam only; public MCP OAuth transport is covered in mcp-oauth-live.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { handleGongzhiRequest } from "../../lib/gongzhi/http.ts";
import { sql } from "../../lib/db.ts";
import { assertLocalAuth, assertLocalDatabase, testProfileFromEnv } from "../../infra/local-auth/local-profile.mjs";

test("real GoTrue and isolated PG: tag/cursor search, feedback-linked versions, approval snapshot and lineage edge", {
  skip: process.env.GONGZHI_EXPERIENCE_SHARING_TEST !== "true", timeout: 120_000,
}, async t => {
  assert.equal(process.env.GONGZHI_ISOLATED_TEST, "true");
  const profile = testProfileFromEnv(process.env);
  assert.equal(profile.project, "gongzhi-fulltest-c-20260914");
  assertLocalAuth(process.env.SUPABASE_URL, profile.authPort);
  assertLocalDatabase(process.env.DATABASE_URL, profile.pgPort, "gongzhi_core_test");
  const key = (name: string) => `evolve:${prefix}:${name}`, prefix = randomUUID();
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
  const ownerA = (await ok(a, "owners", "POST", { name: "Evolution test A", kind: "human" })).owner;
  await ok(b, "owners", "POST", { name: "Evolution test B", kind: "human" });
  const grant = await ok(a, "authorizations", "POST", { scopes: ["read", "publish_experience", "discuss"], idempotency_key: key("grant") });
  const agentA = await ok(grant.grant_token, "agents/register", "POST", { idempotency_key: key("register") });
  const ka = agentA.api_key as string;
  const agentId = agentA.owner.id as string;
  const publishApproved = async (payload: Record<string, unknown>) => {
    const approval = await ok(a, "content-approvals", "POST", { agent_id: agentId, visibility: "public", content: { action: "publish_experience", payload }, idempotency_key: key(`approval-${payload.idempotency_key}`) });
    const published = await ok(ka, "experiences", "POST", { ...payload, approval_id: approval.id });
    return { approval, published };
  };

  await t.test("tag filter and cursor pagination preserve limit and calling compatibility", async () => {
    const common = `paged-${prefix.replaceAll("-", "")}`;
    for (let i = 1; i <= 5; i++) {
      await ok(a, "experiences", "POST", { title: `Paged ${i}`, body: `Paged experience body ${i} ${prefix}`, tags: [common, `item-${i}`], idempotency_key: key(`page-${i}`) });
    }
    const matching = await ok(undefined, `experiences/search?tag=${common}&limit=2`);
    assert.equal(matching.items.length, 2);
    assert.ok(matching.next_cursor, "a short page must carry a cursor");
    const ids = new Set<string>(); let cursor: string | null = null;
    do {
      const page = await ok(undefined, `experiences/search?tag=${common}&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      for (const item of page.items) { assert.ok(!ids.has(item.id), "no duplicate across pages"); ids.add(item.id); }
      cursor = page.next_cursor;
    } while (cursor);
    assert.equal(ids.size, 5, "all five paged experiences surface exactly once");
    const single = await ok(undefined, `experiences/search?tag=item-3&limit=5`);
    assert.equal(single.items.length, 1); assert.equal(single.items[0].title, "Paged 3");
    assert.equal(single.next_cursor, null);
    const none = await ok(undefined, `experiences/search?tag=${common}-absent&limit=5`);
    assert.equal(none.items.length, 0);
    assert.equal((await rest(undefined, "experiences/search?limit=31")).body.error.code, "invalid_request");
  });

  await t.test("based_on_feedback_ids: empty first publish, multiple ids, and invalid/foreign/missing-parent rejection", async () => {
    const v1 = (await publishApproved({ title: `Root ${prefix}`, body: `First version ${prefix}`, tags: ["reviewed"], idempotency_key: key("v1") })).published;
    assert.equal(v1.revision, 1); assert.deepEqual(v1.based_on_feedback_ids ?? [], []);
    const fb = async (name: string) => (await ok(b, "experience-feedback", "POST", { experience_id: v1.id, revision: 1, usage: `Used ${name} locally`, body: `Feedback ${name} ${prefix}`, outcome: "needs_changes", visibility: "public", idempotency_key: key(`fb-${name}`) })).id;
    const f1 = await fb("one"), f2 = await fb("two");
    const v2 = (await publishApproved({ title: `Revised ${prefix}`, body: `Second version ${prefix}`, tags: ["reviewed"], previous_version_id: v1.id, based_on_feedback_ids: [f1, f2], idempotency_key: key("v2") })).published;
    assert.equal(v2.revision, 2); assert.equal(v2.previous_version_id, v1.id);
    assert.deepEqual(v2.based_on_feedback_ids, [f1, f2]);
    const expectRejected = async (payload: Record<string, unknown>, code: string) => {
      const approval = await ok(a, "content-approvals", "POST", { agent_id: agentId, visibility: "public", content: { action: "publish_experience", payload }, idempotency_key: key(`approval-${payload.idempotency_key}`) });
      assert.equal((await rest(ka, "experiences", "POST", { ...payload, approval_id: approval.id })).body.error.code, code);
    };
    await expectRejected({ title: "Bad", body: `${prefix} nonexistent feedback`, previous_version_id: v1.id, based_on_feedback_ids: ["nonexistent-feedback"], idempotency_key: key("bad-id") }, "invalid_request");
    await expectRejected({ title: "Bad", body: `${prefix} no parent`, based_on_feedback_ids: [f1], idempotency_key: key("bad-parent") }, "invalid_request");
    const other = (await ok(a, "experiences", "POST", { title: `Other ${prefix}`, body: `Unrelated version ${prefix}`, tags: ["other"], idempotency_key: key("other") })).id;
    const foreign = (await ok(b, "experience-feedback", "POST", { experience_id: other, revision: 1, usage: "foreign feedback", body: `Feedback on other ${prefix}`, outcome: "helpful", visibility: "public", idempotency_key: key("fb-foreign") })).id;
    await expectRejected({ title: "Bad", body: `${prefix} foreign feedback`, previous_version_id: v1.id, based_on_feedback_ids: [foreign], idempotency_key: key("bad-foreign") }, "invalid_request");
  });

  await t.test("approval snapshot binds based_on_feedback_ids; modification re-approves; duplicate request is one version", async () => {
    const root = (await publishApproved({ title: `Snapshot ${prefix}`, body: `Snapshot v1 ${prefix}`, tags: ["snapshot"], idempotency_key: key("snap-v1") })).published;
    const fid = (await ok(b, "experience-feedback", "POST", { experience_id: root.id, revision: 1, usage: "snapshot usage", body: `Snapshot feedback ${prefix}`, outcome: "needs_changes", visibility: "public", idempotency_key: key("snap-fb") })).id;
    const payload = { title: `Snapshot v2 ${prefix}`, body: `Snapshot v2 ${prefix}`, tags: ["snapshot"], previous_version_id: root.id, based_on_feedback_ids: [fid], idempotency_key: key("snap-v2") };
    const approval = await ok(a, "content-approvals", "POST", { agent_id: agentId, visibility: "public", content: { action: "publish_experience", payload }, idempotency_key: key("snap-approval") });
    const first = await ok(ka, "experiences", "POST", { ...payload, approval_id: approval.id });
    const replay = await ok(ka, "experiences", "POST", { ...payload, approval_id: approval.id });
    assert.equal(replay.id, first.id);
    const [count] = await sql()`select count(*)::int n from posts where publisher_id=(select publisher_id from gongzhi_owners where id=${agentId}) and idempotency_key=${payload.idempotency_key}`;
    assert.equal(count.n, 1, "one immutable version per request key");
    assert.equal((await rest(ka, "experiences", "POST", { ...payload, based_on_feedback_ids: [], approval_id: approval.id })).body.error.code, "idempotency_conflict");
    assert.equal((await rest(ka, "experiences", "POST", { ...payload, body: `changed ${prefix}`, approval_id: approval.id })).body.error.code, "idempotency_conflict");
  });

  await t.test("lineage exposes the feedback -> new version explicit edge", async () => {
    const root = (await publishApproved({ title: `Edge root ${prefix}`, body: `Edge v1 ${prefix}`, tags: ["edge"], idempotency_key: key("edge-v1") })).published;
    const fid = (await ok(b, "experience-feedback", "POST", { experience_id: root.id, revision: 1, usage: "edge usage", body: `Edge feedback ${prefix}`, outcome: "needs_changes", visibility: "public", idempotency_key: key("edge-fb") })).id;
    const child = (await publishApproved({ title: `Edge child ${prefix}`, body: `Edge v2 ${prefix}`, tags: ["edge"], previous_version_id: root.id, based_on_feedback_ids: [fid], idempotency_key: key("edge-v2") })).published;
    const lineage = await ok(undefined, `experiences/${child.id}/lineage`);
    assert.equal(lineage.root.id, root.id);
    assert.deepEqual(lineage.versions.map((v: { experience: { id: string } }) => v.experience.id), [root.id, child.id]);
    const [v1, v2] = lineage.versions;
    assert.equal(v1.experience.revision, 1); assert.equal(v2.experience.revision, 2);
    assert.equal(v2.experience.previous_version_id, root.id);
    assert.equal(v2.experience.based_on_feedback_ids.length, 1); assert.equal(v2.experience.based_on_feedback_ids[0], fid);
    assert.equal(v1.feedback.length, 1); assert.equal(v1.feedback[0].id, fid);
    assert.equal(v2.feedback.length, 0);
  });
});