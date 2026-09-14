import { randomUUID } from "node:crypto";
import { inTransaction, sql, withBoundedRead, type BoundedReadOptions } from "../db";
import { rateLimit } from "../http";
import { StartRunSchema, RunLookupSchema, type RunLookupInput, type ApiError, type Run, type StartRunInput, type SubmitResultInput } from "./contracts";
import { assertIdentity, resolvePlatformIdentity, type Identity } from "./identity";
import { GongzhiError } from "./errors";
import { assertRevision, currentNeed, submitResult } from "./service";
import { getRunPolicy, settleRunBudget } from "./run-policy";
export { type Identity };
export const resolveRunIdentity = resolvePlatformIdentity;
type RunRow = Omit<Run, "mode" | "deadline_at" | "created_at" | "updated_at"> & { deadline_at: Date; created_at: Date; updated_at: Date };
export type FinishRunInput = { status: "succeeded" | "failed" | "cancelled" | "timed_out" | "unknown"; result_id: string | null; error: ApiError | null; usage: Run["usage"]; usage_complete?: boolean };
function toRun(row: RunRow): Run { return { ...row, deadline_at: row.deadline_at.toISOString(), created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString(), mode: "live" }; }
async function expireRuns(needId: string) {
  await sql()`update gongzhi_runs set status='timed_out', updated_at=now(), error=${sql().json({ code: "timeout", message: "任务已超过期限。", retryable: false })} where need_id=${needId} and status in ('queued','running') and deadline_at<=clock_timestamp()`;
}
function platform(actor: Identity) { if (actor.owner.kind !== "platform_agent") throw new GongzhiError(403, "forbidden", "此操作只适用于本人平台助手。"); }
export async function claimRun(actor: Identity, raw: StartRunInput, deadline_at: string): Promise<{ run: Run; created: boolean }> {
  platform(actor); const input = StartRunSchema.parse(raw); const deadline = new Date(deadline_at);
  if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now() || deadline.getTime() > Date.now() + 61000) throw new GongzhiError(400, "invalid_request", "期限必须在未来 60 秒以内。");
  return inTransaction(async () => {
    await assertIdentity(actor, true);
    // The need lock serializes claims across different owners, not just one key.
    const need = await currentNeed(input.need_id, true);
    await expireRuns(input.need_id);
    const [existing] = await sql()<RunRow[]>`select * from gongzhi_runs where owner_id=${actor.owner.id} and idempotency_key=${input.idempotency_key}`;
    if (existing) {
      if (existing.need_id !== input.need_id || existing.need_revision !== input.need_revision) throw new GongzhiError(409, "idempotency_conflict", "同一幂等键已用于其他任务或版本。");
      return { run: toRun(existing), created: false };
    }
    assertRevision(need, input.need_revision);
    const [needOwner] = await sql()`select user_id from gongzhi_owners where id=${need.owner_id}`;
    if (needOwner?.user_id !== actor.user_id) throw new GongzhiError(403, "forbidden", "只能为本人的需求启动平台助手。");
    const [active] = await sql()`select id from gongzhi_runs where need_id=${need.id} and status in ('queued','running')`;
    if (active) throw new GongzhiError(409, "budget_exceeded", "这个需求已有正在执行的任务。");
    if (["accepted", "closed"].includes(need.status)) throw new GongzhiError(409, "revision_conflict", "此需求已结束。");
    const policy = getRunPolicy();
    // All app replicas share this short admission lock. There is no queue or
    // background runner; the successful caller owns the bounded execution.
    await sql()`select pg_advisory_xact_lock(hashtextextended('gongzhi:run-budget',0))`;
    const [totals] = await sql()`select
      count(*) filter (where r.status in ('queued','running') and r.deadline_at>clock_timestamp())::int as active,
      count(*) filter (where r.status in ('queued','running') and r.deadline_at>clock_timestamp() and o.user_id=${actor.user_id})::int as user_active,
      coalesce(sum(case when r.budget->>'usage_complete'='true' then (r.budget->>'settled_microusd')::numeric else (r.budget->>'reserved_microusd')::numeric end)
        filter (where r.created_at>=clock_timestamp()-interval '24 hours'),0)::text as daily_cost
      from gongzhi_runs r join gongzhi_owners o on o.id=r.owner_id`;
    if (totals.active >= policy.max_concurrent_global || totals.user_active >= policy.max_concurrent_per_user) throw new GongzhiError(429, "budget_exceeded", "平台助手同时运行数已达上限。");
    if (BigInt(totals.daily_cost) + BigInt(policy.reserved_microusd) > BigInt(policy.daily_max_cost_microusd)) throw new GongzhiError(429, "budget_exceeded", "平台助手最近 24 小时的费用额度不足。");
    await rateLimit(`gongzhi:run:${actor.owner.id}`, 20, 86400, "platform runs");
    const budget = { limits: { ...policy.limits }, currency: "USD", reserved_microusd: policy.reserved_microusd, settled_microusd: null, usage_complete: false };
    const [row] = await sql()<RunRow[]>`insert into gongzhi_runs(id,owner_id,need_id,need_revision,idempotency_key,status,deadline_at,budget) values(${randomUUID()},${actor.owner.id},${need.id},${need.revision},${input.idempotency_key},'running',${deadline},${sql().json(budget)}) returning *`;
    return { run: toRun(row), created: true };
  });
}
async function authorizedRun(actor: Identity, id: string, lock = false): Promise<RunRow> {
  platform(actor); await assertIdentity(actor, lock);
  const [row] = lock
    ? await sql()<RunRow[]>`select * from gongzhi_runs where id=${id} and owner_id=${actor.owner.id} for update`
    : await sql()<RunRow[]>`select * from gongzhi_runs where id=${id} and owner_id=${actor.owner.id}`;
  if (!row) throw new GongzhiError(404, "not_found", "没有找到本人的任务。");
  return row;
}
export async function getRun(actor: Identity, id: string, options?: BoundedReadOptions): Promise<Run> {
  if (options) return withBoundedRead(async () => {
    const row = await authorizedRun(actor, id);
    // Monitoring is read-only; normal GET/finish persists expiry. A stale
    // running row must never keep a provider call alive after its deadline.
    return toRun(["queued", "running"].includes(row.status) && row.deadline_at.getTime() <= Date.now()
      ? { ...row, status: "timed_out", error: { code: "timeout", message: "任务已超过期限。", retryable: false } } : row);
  }, options);
  return inTransaction(async () => {
    const row = await authorizedRun(actor, id, true);
    await expireRuns(row.need_id);
    return toRun(await authorizedRun(actor, id));
  });
}
/** Null means no visible receipt yet, never permission to repeat model execution. */
export async function lookupRun(actor: Identity, raw: RunLookupInput): Promise<Run | null> {
  platform(actor); const input = RunLookupSchema.parse(raw);
  return withBoundedRead(async () => {
    await assertIdentity(actor);
    const [row] = await sql()<RunRow[]>`select * from gongzhi_runs where owner_id=${actor.owner.id} and need_id=${input.need_id} and idempotency_key=${input.idempotency_key}`;
    if (!row) return null;
    return toRun(["queued", "running"].includes(row.status) && row.deadline_at.getTime() <= Date.now()
      ? { ...row, status: "timed_out", error: { code: "timeout", message: "任务已超过期限。", retryable: false } } : row);
  }, { timeout_ms: 1000 });
}
export async function cancelRun(actor: Identity, id: string): Promise<Run> {
  return inTransaction(async () => {
    const row = await authorizedRun(actor, id, true); await expireRuns(row.need_id);
    await sql()`update gongzhi_runs set status='cancelled',updated_at=now() where id=${id} and status in ('queued','running')`;
    return toRun(await authorizedRun(actor, id));
  });
}
export async function finishRun(actor: Identity, id: string, input: FinishRunInput): Promise<Run> {
  return inTransaction(async () => {
    const row = await authorizedRun(actor, id, true); await expireRuns(row.need_id);
    const current = await authorizedRun(actor, id);
    if ([input.usage.model_steps, input.usage.zhihu_queries].some(value => !Number.isSafeInteger(value) || value < 0)) throw new GongzhiError(400, "invalid_request", "调用次数必须为非负安全整数。");
    for (const value of [input.usage.input_tokens, input.usage.output_tokens]) if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new GongzhiError(400, "invalid_request", "用量必须为非负安全整数或未知。");
    // A late settlement may add observed usage, but never change a terminal
    // outcome or replace its result. Counts are monotonic, never added twice.
    const usage: Run["usage"] = {
      model_steps: Math.max(current.usage.model_steps, input.usage.model_steps),
      zhihu_queries: Math.max(current.usage.zhihu_queries, input.usage.zhihu_queries),
      input_tokens: current.usage.input_tokens === null && input.usage.input_tokens === null ? null : Math.max(current.usage.input_tokens ?? 0, input.usage.input_tokens ?? 0),
      output_tokens: current.usage.output_tokens === null && input.usage.output_tokens === null ? null : Math.max(current.usage.output_tokens ?? 0, input.usage.output_tokens ?? 0),
    };
    const budget = settleRunBudget(current.budget, usage, input.usage_complete);
    if (!["queued", "running"].includes(current.status)) {
      const [settled] = await sql()<RunRow[]>`update gongzhi_runs set usage=${sql().json(usage)},budget=${budget ? sql().json(budget as never) : null},updated_at=now() where id=${id} returning *`;
      return toRun(settled);
    }
    if (input.status === "succeeded" && (!input.result_id || current.result_id !== input.result_id)) throw new GongzhiError(409, "invalid_request", "成功状态需要本任务已提交的真实结果。");
    if (input.result_id && current.result_id !== input.result_id) throw new GongzhiError(403, "forbidden", "不能关联其他任务的结果。");
    const [updated] = await sql()<RunRow[]>`update gongzhi_runs set status=${input.status}, result_id=${input.result_id ?? current.result_id},error=${input.error ? sql().json(input.error as never) : null},usage=${sql().json(usage)},budget=${budget ? sql().json(budget as never) : null},updated_at=now() where id=${id} and status in ('queued','running') returning *`;
    return toRun(updated);
  });
}
export async function submitRunResult(actor: Identity, runId: string, input: SubmitResultInput, signal?: AbortSignal) {
  return submitResult(actor, input, { run_id: runId, signal });
}
