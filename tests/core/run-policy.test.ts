import test from "node:test";
import assert from "node:assert/strict";
import { getRunPolicy, settleRunBudget } from "../../lib/gongzhi/run-policy.ts";
import type { RunBudget } from "../../lib/gongzhi/contracts.ts";
import { RunLookupSchema } from "../../lib/gongzhi/contracts.ts";
import { createApiClient } from "../../lib/gongzhi/api-client.ts";

// Explicit synthetic price/model configuration; no provider clients or calls.
const configured = {
  GONGZHI_ASSISTANT_ENABLED: "true", GONGZHI_MODEL_API_KEY: "unit-only-not-a-credential",
  GONGZHI_MODEL_ID: "test-model", GONGZHI_MODEL_PRICING_MODEL_ID: "test-model",
  GONGZHI_MODEL_CONTEXT_TOKENS: "10000", GONGZHI_MODEL_INPUT_USD_PER_MILLION: "1",
  GONGZHI_MODEL_OUTPUT_USD_PER_MILLION: "2", GONGZHI_RUN_MAX_COST_USD: "0.06",
  GONGZHI_RUN_DAILY_MAX_COST_USD: "0.12",
};
test("run admission configuration fails closed for missing, mismatched or unbounded costs", () => {
  assert.throws(() => getRunPolicy({}), { code: "unavailable" });
  for (const key of Object.keys(configured)) assert.throws(() => getRunPolicy({ ...configured, [key]: undefined }), { code: "unavailable" });
  for (const [key, value] of [
    ["GONGZHI_MODEL_ID", "different"], ["GONGZHI_MODEL_INPUT_USD_PER_MILLION", "0"],
    ["GONGZHI_RUN_MAX_COST_USD", "1e3"], ["GONGZHI_RUN_MAX_COST_USD", "0.001"],
    ["GONGZHI_RUN_DAILY_MAX_COST_USD", "0.001"], ["GONGZHI_MODEL_CONTEXT_TOKENS", "NaN"],
    ["GONGZHI_RUN_MAX_STEPS", "5"], ["GONGZHI_RUN_MAX_OUTPUT_TOKENS", "2001"],
    ["GONGZHI_RUN_MAX_CONCURRENT_PER_USER", "3"], ["GONGZHI_RUN_MAX_COST_USD", "999999999999999"],
  ]) assert.throws(() => getRunPolicy({ ...configured, [key]: value }), { code: "unavailable" });
});
test("reservation uses full context on every call and exact decimal micros", () => {
  const p = getRunPolicy(configured);
  assert.equal(p.reserved_microusd, 56000);
  assert.equal(p.daily_max_cost_microusd, 120000);
  assert.equal(p.limits.max_steps, 4); assert.equal(p.limits.deadline_ms, 60000);
  assert.equal(p.max_concurrent_global, 2); assert.equal(p.max_concurrent_per_user, 1);
  assert.equal(getRunPolicy({ ...configured, GONGZHI_MODEL_INPUT_USD_PER_MILLION: "0.000001" }).limits.input_price_microusd_per_million, 1);
});
test("unknown usage retains cost; complete bounded usage settles conservatively", () => {
  const p = getRunPolicy(configured);
  const b: RunBudget = { limits: p.limits, reserved_microusd: p.reserved_microusd, settled_microusd: null, usage_complete: false, currency: "USD" };
  const usage = { model_steps: 2, zhihu_queries: 0, input_tokens: 500, output_tokens: 20 };
  assert.deepEqual(settleRunBudget(b, usage), b);
  assert.deepEqual(settleRunBudget(b, { ...usage, output_tokens: null }, true), b);
  const settled = settleRunBudget(b, usage, true)!;
  assert.equal(settled.settled_microusd, 541); assert.equal(settled.usage_complete, true);
  assert.deepEqual(settleRunBudget(settled, usage, true), settled);
  assert.equal(settleRunBudget(b, { ...usage, input_tokens: 20001 }, true)?.usage_complete, false);
  assert.equal(settleRunBudget(null, usage, true), null);
  for (const key of ["model_steps", "zhihu_queries", "input_tokens", "output_tokens"]) {
    for (const value of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, null, undefined]) {
      const invalid = settleRunBudget(settled, { ...usage, [key]: value } as typeof usage, true)!;
      assert.equal(invalid.usage_complete, false); assert.equal(invalid.settled_microusd, null);
      assert.equal(invalid.reserved_microusd, b.reserved_microusd);
    }
  }
});
test("original-key lookup is read-only, encoded, and returns a pending null without retry", async () => {
  assert.equal(RunLookupSchema.safeParse({ need_id: "a", idempotency_key: "b", owner_id: "forged" }).success, false);
  let calls = 0;
  const api = createApiClient("live", { fetch: (async (url, init) => {
    calls++; assert.equal(String(url), "/api/gongzhi/runs?need_id=a%2F1&idempotency_key=k%2B2");
    assert.equal(init?.method, "GET"); assert.equal(init?.body, undefined);
    return Response.json({ ok: true, mode: "live", data: null });
  }) as typeof fetch });
  assert.equal(await api.lookupRun({ need_id: "a/1", idempotency_key: "k+2" }), null);
  assert.equal(calls, 1);
});
