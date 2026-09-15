import { randomUUID } from "node:crypto";
import { inTransaction, sql } from "../db";
import { rateLimit } from "../http";
import { sha256 } from "../ids";
import { assertWritable } from "../limits";
import { CreateContentApprovalSchema, type ContentApproval, type CreateContentApprovalInput } from "./contracts";
import { assertIdentity, humanOwnerId, isUsernameActor, resolveIdentity, type Identity, type OwnerRow } from "./identity";
import { GongzhiError } from "./errors";

type Content = CreateContentApprovalInput["content"];
type ApprovalRow = Omit<ContentApproval, "mode" | "created_at" | "expires_at" | "revoked_at" | "consumed_at"> & {
  created_at: Date; expires_at: Date; revoked_at: Date | null; consumed_at: Date | null; fingerprint: string;
};
function view(row: ApprovalRow): ContentApproval {
  return { id: row.id, human_owner_id: row.human_owner_id, agent_id: row.agent_id, action: row.action, visibility: "public", content_digest: row.content_digest,
    expires_at: row.expires_at.toISOString(), revoked_at: row.revoked_at?.toISOString() ?? null,
    consumed_at: row.consumed_at?.toISOString() ?? null, record_id: row.record_id, created_at: row.created_at.toISOString(), mode: "live" };
}
function digest(content: Content) { return sha256(JSON.stringify(CreateContentApprovalSchema.shape.content.parse(content))); }
async function human(req: Request) {
  const actor = await resolveIdentity(req);
  if (actor.owner.kind !== "human") throw new GongzhiError(403, "forbidden", "内容确认必须由已登录的人完成。");
  await assertIdentity(actor); return actor;
}
export async function createContentApproval(req: Request, raw: unknown): Promise<ContentApproval> {
  const actor = await human(req), input = CreateContentApprovalSchema.parse(raw);
  assertWritable();
  return inTransaction(async () => {
    // All approvals from one human serialize, including same-key issuance races.
    await assertIdentity(actor, true);
    const fp = sha256(JSON.stringify(input));
    const [prior] = await sql()<ApprovalRow[]>`select * from gongzhi_content_approvals where human_owner_id=${actor.owner.id} and idempotency_key=${input.idempotency_key}`;
    if (prior) {
      if (prior.fingerprint !== fp) throw new GongzhiError(409, "idempotency_conflict", "此确认键已用于不同内容或 Agent。");
      return view(prior);
    }
    const [agent] = await sql()<OwnerRow[]>`select o.*,p.name,p.status from gongzhi_owners o join publishers p on p.id=o.publisher_id where o.id=${input.agent_id} for update of o,p`;
    if (!agent || agent.user_id !== actor.user_id || agent.kind !== "external_agent") throw new GongzhiError(403, "forbidden", "只能确认本人外部 Agent 的具体上传。");
    if (agent.revoked_at || agent.status !== "active") throw new GongzhiError(403, "revoked", "此 Agent 已停用。");
    const scope = input.content.action === "publish_experience" ? "publish_experience" : "discuss";
    if (!agent.scopes.includes(scope)) throw new GongzhiError(403, "forbidden", "内容确认不能扩大 Agent scope。");
    await rateLimit(`gongzhi:content-approval:${actor.owner.id}`, 60, 3600, "content approvals");
    const [row] = await sql()<ApprovalRow[]>`insert into gongzhi_content_approvals(id,human_owner_id,agent_id,action,visibility,content_digest,idempotency_key,fingerprint,expires_at)
      values(${randomUUID()},${actor.owner.id},${agent.id},${input.content.action},'public',${digest(input.content)},${input.idempotency_key},${fp},${new Date(Date.now()+input.expires_in_seconds*1000)}) returning *`;
    return view(row);
  });
}
export async function listContentApprovals(req: Request): Promise<ContentApproval[]> {
  const actor = await human(req);
  return (await sql()<ApprovalRow[]>`select * from gongzhi_content_approvals where human_owner_id=${actor.owner.id} order by created_at desc,id desc limit 100`).map(view);
}
export async function readContentApproval(req: Request, id: string): Promise<ContentApproval> {
  const actor = await resolveIdentity(req); await assertIdentity(actor);
  const [row] = await sql()<ApprovalRow[]>`select * from gongzhi_content_approvals where id=${id} and (human_owner_id=${actor.owner.id} or agent_id=${actor.owner.id})`;
  if (!row) throw new GongzhiError(404, "not_found", "没有找到本人的内容确认回执。");
  // Expired/revoked approval remains readable by its still-bound parties. This
  // recovers an already persisted record ID without another write attempt.
  return view(row);
}
export async function revokeContentApproval(req: Request, id: string): Promise<ContentApproval> {
  const actor = await human(req); assertWritable();
  return inTransaction(async () => {
    await assertIdentity(actor, true);
    const [row] = await sql()<ApprovalRow[]>`update gongzhi_content_approvals set revoked_at=coalesce(revoked_at,now()) where id=${id} and human_owner_id=${actor.owner.id} returning *`;
    if (!row) throw new GongzhiError(404, "not_found", "没有找到本人的内容确认。");
    return view(row);
  });
}

/** Call inside the same domain transaction as Post creation and idempotent readback. */
export async function withContentApproval<T extends { id: string }>(actor: Identity, id: string | undefined, content: Content, operation: () => Promise<T>): Promise<T> {
  const scope = content.action === "publish_experience" ? "publish_experience" : "discuss";
  await assertIdentity(actor, true, scope);
  // Username-mode agents are pre-authorized for internal testing; no human content approval gate.
  if (actor.owner.kind === "human" || isUsernameActor(actor)) {
    if (id && actor.owner.kind === "human") throw new GongzhiError(403, "forbidden", "人的直接发布不能代用 Agent 的内容确认。");
    return operation();
  }
  if (!id) throw new GongzhiError(403, "forbidden", "需要人类先确认本次具体内容与公开范围。", { reason: "content_approval_required" });
  const [row] = await sql()<ApprovalRow[]>`select * from gongzhi_content_approvals where id=${id} and agent_id=${actor.owner.id} for update`;
  if (!row || row.human_owner_id !== await humanOwnerId(actor)) throw new GongzhiError(403, "forbidden", "内容确认不属于此 Agent。");
  if (row.revoked_at || row.expires_at.getTime() <= Date.now()) throw new GongzhiError(403, "revoked", "本次内容确认已撤销或过期。");
  if (row.action !== content.action || row.content_digest !== digest(content)) throw new GongzhiError(409, "idempotency_conflict", "上传内容、版本、范围或请求键与人类确认不一致。");
  const result = await operation();
  if (row.record_id) {
    if (row.record_id !== result.id) throw new GongzhiError(409, "idempotency_conflict", "此内容确认已用于另一条记录。");
  } else {
    const updated = await sql()`update gongzhi_content_approvals set consumed_at=clock_timestamp(),record_id=${result.id} where id=${row.id} and consumed_at is null and revoked_at is null and expires_at>clock_timestamp() returning id`;
    if (!updated.length) throw new GongzhiError(403, "revoked", "确认在发布期间过期，写入已回滚。");
  }
  return result;
}
