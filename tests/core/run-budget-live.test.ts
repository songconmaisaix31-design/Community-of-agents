import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { sql, withBoundedRead } from "../../lib/db.ts";
import { bindOwner, resolveIdentity } from "../../lib/gongzhi/identity.ts";
import { createNeed } from "../../lib/gongzhi/service.ts";
import { claimRun, cancelRun, finishRun, getRun, lookupRun, resolveRunIdentity } from "../../lib/gongzhi/runs.ts";
import { getRunPolicy } from "../../lib/gongzhi/run-policy.ts";
import { testProfileFromEnv, assertLocalAuth, assertLocalDatabase } from "../../infra/local-auth/local-profile.mjs";

test("official GoTrue + PG run budget admission and bounded cancellation reads", { skip: process.env.GONGZHI_RUN_BUDGET_TEST !== "true" }, async t => {
  assert.equal(process.env.GONGZHI_ISOLATED_TEST, "true");
  const profile = testProfileFromEnv(process.env);
  assert.equal(profile.project, "gongzhi-fulltest-c-20260914");
  const auth = assertLocalAuth(process.env.SUPABASE_URL, profile.authPort);
  assertLocalDatabase(process.env.DATABASE_URL, profile.pgPort, "gongzhi_core_test");
  const prefix = `run-budget:${randomUUID()}`;
  t.after(async () => { await sql().end(); });
  const login = async (suffix: string) => {
    const client = createClient(auth.toString(), process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await client.auth.signInWithPassword({ email: process.env[`GONGZHI_TEST${suffix}_EMAIL`]!, password: process.env[`GONGZHI_TEST${suffix}_PASSWORD`]! });
    assert.ok(!result.error && result.data.session);
    t.after(async () => { await client.auth.signOut({ scope: "local" }); client.auth.stopAutoRefresh(); });
    const request = new Request("http://localhost", { headers: { Authorization: `Bearer ${result.data.session.access_token}` } });
    await bindOwner(request, { kind: "human", name: "Core run budget test" });
    return { human: await resolveIdentity(request), platform: await resolveRunIdentity(request) };
  };
  const a = await login(""), b = await login("_OTHER");
  assert.notEqual(a.platform.user_id, b.platform.user_id);
  const need = async (actor: typeof a.human, name: string) => createNeed(actor, { title: "Isolated budget verification", body: `${prefix}:${name}; scripted service test, no model call.`, idempotency_key: `${prefix}:${name}` });
  const a1 = await need(a.human, "a1"), a2 = await need(a.human, "a2"), b1 = await need(b.human, "b1");
  const input = (id: string) => ({ need_id: id, need_revision: 1, idempotency_key: `${prefix}:run:${id}` });
  const deadline = () => new Date(Date.now() + 60000).toISOString();
  Object.assign(process.env, {
    GONGZHI_ASSISTANT_ENABLED: "true", GONGZHI_MODEL_API_KEY: "synthetic-policy-no-model-client",
    GONGZHI_MODEL_ID: "synthetic-policy", GONGZHI_MODEL_PRICING_MODEL_ID: "synthetic-policy",
    GONGZHI_MODEL_CONTEXT_TOKENS: "10000", GONGZHI_MODEL_INPUT_USD_PER_MILLION: "1",
    GONGZHI_MODEL_OUTPUT_USD_PER_MILLION: "2", GONGZHI_RUN_MAX_COST_USD: "1",
    GONGZHI_RUN_DAILY_MAX_COST_USD: "1000", GONGZHI_RUN_MAX_CONCURRENT_GLOBAL: "1",
    GONGZHI_RUN_MAX_CONCURRENT_PER_USER: "1",
  });
  const zero = { model_steps: 0, zhihu_queries: 0, input_tokens: 0, output_tokens: 0 };
  await t.test("missing price fails before reservation and run insertion", async () => {
    delete process.env.GONGZHI_MODEL_INPUT_USD_PER_MILLION;
    await assert.rejects(claimRun(a.platform, input(a1.id), deadline()), { code: "unavailable" });
    process.env.GONGZHI_MODEL_INPUT_USD_PER_MILLION = "1";
    const [count] = await sql()`select count(*)::int n from gongzhi_runs where idempotency_key=${input(a1.id).idempotency_key}`;
    assert.equal(count.n, 0);
  });
  await t.test("two real owners racing different needs share one global slot", async () => {
    const candidates = [{ actor: a.platform, need: a1 }, { actor: b.platform, need: b1 }];
    const results = await Promise.allSettled(candidates.map(c => claimRun(c.actor, input(c.need.id), deadline())));
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.filter(r => r.status === "rejected" && r.reason.code === "budget_exceeded").length, 1);
    for (const [index, r] of results.entries()) if (r.status === "fulfilled") {
      const actor = candidates[index].actor, run = r.value.run;
      assert.equal(run.budget?.reserved_microusd, 56000);
      await cancelRun(actor, run.id);
      assert.equal((await finishRun(actor, run.id, { status: "cancelled", result_id: null, error: null, usage: zero, usage_complete: true })).budget?.settled_microusd, 0);
    }
  });
  process.env.GONGZHI_RUN_MAX_CONCURRENT_GLOBAL = "2";
  const claim = await claimRun(a.platform, { ...input(a1.id), idempotency_key: `${prefix}:fresh-a` }, deadline());
  await t.test("per-human cap, replay and bounded read retain identity and immutable reservation", async () => {
    await assert.rejects(claimRun(a.platform, input(a2.id), deadline()), { code: "budget_exceeded" });
    assert.equal((await claimRun(a.platform, { ...input(a1.id), idempotency_key: `${prefix}:fresh-a` }, deadline())).created, false);
    await assert.rejects(claimRun(a.platform, { ...input(a2.id), idempotency_key: `${prefix}:fresh-a` }, deadline()), { code: "idempotency_conflict" });
    assert.equal((await getRun(a.platform, claim.run.id, { timeout_ms: 1000 })).id, claim.run.id);
    await assert.rejects(getRun(b.platform, claim.run.id, { timeout_ms: 1000 }), { code: "not_found" });
    assert.equal((await lookupRun(a.platform, { need_id: a1.id, idempotency_key: `${prefix}:fresh-a` }))?.id, claim.run.id);
    assert.equal(await lookupRun(b.platform, { need_id: a1.id, idempotency_key: `${prefix}:fresh-a` }), null);
    assert.equal(await lookupRun(a.platform, { need_id: a1.id, idempotency_key: `${prefix}:not-started` }), null);
    await assert.rejects(sql()`update gongzhi_runs set budget=jsonb_set(budget,'{reserved_microusd}','0') where id=${claim.run.id}`, /immutable run budget/);
  });
  await t.test("cancellation releases concurrency but unknown use retains all cost", async () => {
    await cancelRun(a.platform, claim.run.id);
    const ended = await finishRun(a.platform, claim.run.id, { status: "unknown", result_id: null, error: null, usage: { ...zero, input_tokens: null, output_tokens: null } });
    assert.equal(ended.status, "cancelled"); assert.equal(ended.budget?.usage_complete, false);
    assert.equal(ended.budget?.settled_microusd, null);
    await assert.rejects(finishRun(a.platform, claim.run.id, { status: "failed", result_id: null, error: null, usage: { ...zero, model_steps: null } as never, usage_complete: true }), { code: "invalid_request" });
    assert.equal((await getRun(a.platform, claim.run.id)).budget?.usage_complete, false);
    const [cost] = await sql()`select coalesce(sum(case when budget->>'usage_complete'='true' then (budget->>'settled_microusd')::numeric else (budget->>'reserved_microusd')::numeric end),0)::text value from gongzhi_runs where created_at>=clock_timestamp()-interval '24 hours'`;
    process.env.GONGZHI_RUN_DAILY_MAX_COST_USD = (Number(cost.value) / 1000000).toFixed(6);
    assert.ok(getRunPolicy().daily_max_cost_microusd >= 56000);
    await assert.rejects(claimRun(a.platform, input(a2.id), deadline()), { code: "budget_exceeded" });
    const complete = await finishRun(a.platform, claim.run.id, { status: "failed", result_id: null, error: null, usage: zero, usage_complete: true });
    assert.equal(complete.status, "cancelled"); assert.equal(complete.budget?.settled_microusd, 0);
    const next = await claimRun(a.platform, input(a2.id), deadline());
    assert.equal(next.created, true);
    await cancelRun(a.platform, next.run.id);
    await finishRun(a.platform, next.run.id, { status: "cancelled", result_id: null, error: null, usage: zero, usage_complete: true });
  });
  await t.test("active PG query cancels within bound without terminating shared pool", async () => {
    const controller = new AbortController();
    const start = performance.now();
    const pending = withBoundedRead(async () => sql()`select pg_sleep(10)`, { signal: controller.signal, timeout_ms: 1000 });
    const timer = setTimeout(() => controller.abort(new DOMException("Test cancellation", "AbortError")), 100);
    try { await assert.rejects(pending, { name: "AbortError" }); } finally { clearTimeout(timer); }
    assert.ok(performance.now() - start < 1500);
    assert.equal((await sql()`select 1 as n`)[0].n, 1);
  });
});
