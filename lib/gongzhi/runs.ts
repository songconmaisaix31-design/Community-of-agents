import { randomUUID } from "node:crypto";
import { inTransaction, sql } from "../db";
import { rateLimit } from "../http";
import { StartRunSchema, type ApiError, type Run, type StartRunInput, type SubmitResultInput } from "./contracts";
import { assertIdentity, resolvePlatformIdentity, type Identity } from "./identity";
import { GongzhiError } from "./errors";
import { assertRevision, currentNeed, submitResult } from "./service";
export { type Identity };
export const resolveRunIdentity = resolvePlatformIdentity;
type RunRow = Omit<Run, "mode" | "deadline_at" | "created_at" | "updated_at"> & { deadline_at: Date; created_at: Date; updated_at: Date };
export type FinishRunInput = { status: "succeeded" | "failed" | "cancelled" | "timed_out" | "unknown"; result_id: string | null; error: ApiError | null; usage: Run["usage"] };
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
    await rateLimit(`gongzhi:run:${actor.owner.id}`, 20, 86400, "platform runs");
    const [row] = await sql()<RunRow[]>`insert into gongzhi_runs(id,owner_id,need_id,need_revision,idempotency_key,status,deadline_at) values(${randomUUID()},${actor.owner.id},${need.id},${need.revision},${input.idempotency_key},'running',${deadline}) returning *`;
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
export async function getRun(actor: Identity, id: string): Promise<Run> {
  return inTransaction(async () => {
    const row = await authorizedRun(actor, id, true);
    await expireRuns(row.need_id);
    return toRun(await authorizedRun(actor, id));
  });
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
    for (const value of Object.values(input.usage)) if (value !== null && (!Number.isInteger(value) || value < 0)) throw new GongzhiError(400, "invalid_request", "用量必须为非负整数或未知。");
    // A late settlement may add observed usage, but never change a terminal
    // outcome or replace its result. Counts are monotonic, never added twice.
    const usage: Run["usage"] = {
      model_steps: Math.max(current.usage.model_steps, input.usage.model_steps),
      zhihu_queries: Math.max(current.usage.zhihu_queries, input.usage.zhihu_queries),
      input_tokens: current.usage.input_tokens === null && input.usage.input_tokens === null ? null : Math.max(current.usage.input_tokens ?? 0, input.usage.input_tokens ?? 0),
      output_tokens: current.usage.output_tokens === null && input.usage.output_tokens === null ? null : Math.max(current.usage.output_tokens ?? 0, input.usage.output_tokens ?? 0),
    };
    if (!["queued", "running"].includes(current.status)) {
      const [settled] = await sql()<RunRow[]>`update gongzhi_runs set usage=${sql().json(usage)},updated_at=now() where id=${id} returning *`;
      return toRun(settled);
    }
    if (input.status === "succeeded" && (!input.result_id || current.result_id !== input.result_id)) throw new GongzhiError(409, "invalid_request", "成功状态需要本任务已提交的真实结果。");
    if (input.result_id && current.result_id !== input.result_id) throw new GongzhiError(403, "forbidden", "不能关联其他任务的结果。");
    const [updated] = await sql()<RunRow[]>`update gongzhi_runs set status=${input.status}, result_id=${input.result_id ?? current.result_id},error=${input.error ? sql().json(input.error as never) : null},usage=${sql().json(usage)},updated_at=now() where id=${id} and status in ('queued','running') returning *`;
    return toRun(updated);
  });
}
export async function submitRunResult(actor: Identity, runId: string, input: SubmitResultInput, signal?: AbortSignal) {
  return submitResult(actor, input, { run_id: runId, signal });
}
