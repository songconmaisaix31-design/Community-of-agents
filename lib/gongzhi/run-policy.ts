import type { Run, RunBudget, RunExecutionLimits } from "./contracts";
import { GongzhiError } from "./errors";

export interface RunPolicy {
  limits: RunExecutionLimits;
  max_cost_microusd: number;
  daily_max_cost_microusd: number;
  max_concurrent_global: number;
  max_concurrent_per_user: number;
  reserved_microusd: number;
}
const invalid = () => new GongzhiError(503, "unavailable", "平台助手缺少有效的模型、价格或费用上限配置。");
function integer(value: string | undefined, min: number, max: number): number {
  if (!value || !/^\d+$/.test(value)) throw invalid();
  const n = Number(value); if (!Number.isSafeInteger(n) || n < min || n > max) throw invalid();
  return n;
}
function micros(value: string | undefined): number {
  if (!value || !/^\d+(\.\d{1,6})?$/.test(value)) throw invalid();
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (amount <= 0 || amount > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid();
  return Number(amount);
}
function charge(limits: RunExecutionLimits, input: number, output: number): number {
  const raw = BigInt(input) * BigInt(limits.input_price_microusd_per_million) + BigInt(output) * BigInt(limits.output_price_microusd_per_million);
  const rounded = (raw + 999_999n) / 1_000_000n;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid();
  return Number(rounded);
}

/** No provider calls. Prices and context must match the operator's selected model. */
export function getRunPolicy(env: Record<string, string | undefined> = process.env): RunPolicy {
  const model = env.GONGZHI_MODEL_ID?.trim();
  if (env.GONGZHI_ASSISTANT_ENABLED !== "true" || !env.GONGZHI_MODEL_API_KEY?.trim() || !model || env.GONGZHI_MODEL_PRICING_MODEL_ID?.trim() !== model) throw invalid();
  const limits: RunExecutionLimits = {
    model_id: model,
    model_context_tokens: integer(env.GONGZHI_MODEL_CONTEXT_TOKENS, 1, 2_000_000),
    max_output_tokens: integer(env.GONGZHI_RUN_MAX_OUTPUT_TOKENS ?? "2000", 1, 2000),
    max_steps: integer(env.GONGZHI_RUN_MAX_STEPS ?? "4", 1, 4),
    max_zhihu_queries: 2, deadline_ms: 60_000,
    input_price_microusd_per_million: micros(env.GONGZHI_MODEL_INPUT_USD_PER_MILLION),
    output_price_microusd_per_million: micros(env.GONGZHI_MODEL_OUTPUT_USD_PER_MILLION),
  };
  if (limits.max_output_tokens > limits.model_context_tokens) throw invalid();
  const policy: RunPolicy = {
    limits,
    max_cost_microusd: micros(env.GONGZHI_RUN_MAX_COST_USD),
    daily_max_cost_microusd: micros(env.GONGZHI_RUN_DAILY_MAX_COST_USD),
    max_concurrent_global: integer(env.GONGZHI_RUN_MAX_CONCURRENT_GLOBAL ?? "2", 1, 16),
    max_concurrent_per_user: integer(env.GONGZHI_RUN_MAX_CONCURRENT_PER_USER ?? "1", 1, 4),
    // Reserve the configured model's entire context on every possible call. This
    // deliberately overestimates; character counts are not a token cost bound.
    reserved_microusd: charge(limits, limits.model_context_tokens, limits.max_output_tokens) * limits.max_steps,
  };
  if (!Number.isSafeInteger(policy.reserved_microusd) || policy.max_concurrent_per_user > policy.max_concurrent_global || policy.reserved_microusd > policy.max_cost_microusd || policy.reserved_microusd > policy.daily_max_cost_microusd) throw invalid();
  return policy;
}

/** Internal conservative USD accounting, never a claim about the provider invoice. */
export function settleRunBudget(budget: RunBudget | null | undefined, usage: Run["usage"], complete = false): RunBudget | null {
  if (!budget) return null;
  if (!complete || usage.input_tokens === null || usage.output_tokens === null) return budget;
  const limits = budget.limits;
  if (usage.model_steps > limits.max_steps || usage.zhihu_queries > limits.max_zhihu_queries || usage.input_tokens > limits.model_context_tokens * usage.model_steps || usage.output_tokens > limits.max_output_tokens * usage.model_steps) {
    // Usage outside the reserved envelope is unknown, never silently free.
    return { ...budget, usage_complete: false, settled_microusd: null };
  }
  // Per-call rounding cannot exceed aggregate rounding plus calls minus one.
  const cost = charge(limits, usage.input_tokens, usage.output_tokens) + Math.max(0, usage.model_steps - 1);
  return { ...budget, usage_complete: true, settled_microusd: Math.min(budget.reserved_microusd, Math.max(budget.settled_microusd ?? 0, cost)) };
}
