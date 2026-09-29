import { randomBytes, randomUUID } from "node:crypto";
import { inTransaction, sql } from "../db";
import { bearer, rateLimit } from "../http";
import { sha256 } from "../ids";
import { assertWritable } from "../limits";
import { registerPublisher } from "../publishers";
import { CreateAuthorizationSchema, RegisterAgentSchema, type AgentAuthorization, type IssuedAuthorization, type RegisteredAgent } from "./contracts";
import { assertIdentity, resolveIdentity, toOwner, type OwnerRow } from "./identity";
import { assertDatabaseConfigured, GongzhiError } from "./errors";

type GrantRow = Omit<AgentAuthorization, "mode" | "created_at" | "expires_at" | "revoked_at"> & { created_at: Date; expires_at: Date; revoked_at: Date | null; fingerprint: string; registration_key: string | null; registration_fingerprint: string | null };
function view(row: GrantRow): AgentAuthorization { return { id: row.id, owner_id: row.owner_id, scopes: row.scopes, expires_at: row.expires_at.toISOString(), revoked_at: row.revoked_at?.toISOString() ?? null, agent_id: row.agent_id, created_at: row.created_at.toISOString(), mode: "live" }; }
async function human(req: Request) {
  const actor = await resolveIdentity(req);
  await assertIdentity(actor);
  if (actor.owner.kind !== "human") throw new GongzhiError(403, "forbidden", "授权只能由绑定的人签发或撤销。");
  return actor;
}
export async function createAuthorization(req: Request, raw: unknown): Promise<IssuedAuthorization> {
  const input = CreateAuthorizationSchema.parse(raw), actor = await human(req); assertWritable();
  const scopes = [...new Set(input.scopes)].sort();
  const fp = sha256(JSON.stringify({ ...input, scopes }));
  return inTransaction(async () => {
    await assertIdentity(actor, true);
    const [existing] = await sql()<GrantRow[]>`select * from gongzhi_authorizations where owner_id=${actor.owner.id} and idempotency_key=${input.idempotency_key}`;
    if (existing) {
      if (existing.fingerprint !== fp) throw new GongzhiError(409, "idempotency_conflict", "同一幂等键已用于不同授权。");
      return { authorization: view(existing), credential_state: "not_recoverable" };
    }
    await rateLimit(`gongzhi:grants:${actor.owner.id}`, 30, 3600, "authorizations");
    const token = `gongzhi_grant_${randomBytes(32).toString("base64url")}`;
    const [row] = await sql()<GrantRow[]>`insert into gongzhi_authorizations(id,owner_id,scopes,token_hash,idempotency_key,fingerprint,expires_at) values(${randomUUID()},${actor.owner.id},${scopes},${sha256(token)},${input.idempotency_key},${fp},${new Date(Date.now()+input.expires_in_seconds*1000)}) returning *`;
    return { authorization: view(row), grant_token: token, credential_state: "issued" };
  });
}
export async function listAuthorizations(req: Request): Promise<AgentAuthorization[]> {
  const actor = await human(req);
  return (await sql()<GrantRow[]>`select * from gongzhi_authorizations where owner_id=${actor.owner.id} order by created_at desc,id desc`).map(view);
}
export async function revokeAuthorization(req: Request, id: string): Promise<AgentAuthorization> {
  const actor = await human(req); assertWritable();
  return inTransaction(async () => {
    const [row] = await sql()<GrantRow[]>`select * from gongzhi_authorizations where id=${id} and owner_id=${actor.owner.id} for update`;
    if (!row) throw new GongzhiError(404, "not_found", "没有找到本人的授权。");
    if (row.agent_id) await sql()`update gongzhi_owners set revoked_at=coalesce(revoked_at,now()),credential_version=credential_version+1 where id=${row.agent_id}`;
    const [updated] = await sql()<GrantRow[]>`update gongzhi_authorizations set revoked_at=coalesce(revoked_at,now()) where id=${row.id} returning *`;
    return view(updated);
  });
}
export async function registerAgent(req: Request, raw: unknown): Promise<RegisteredAgent> {
  const input = RegisterAgentSchema.parse(raw), token = bearer(req);
  if (!token?.startsWith("gongzhi_grant_")) throw new GongzhiError(401, "unauthenticated", "请提供授权人签发的登记令牌。");
  assertDatabaseConfigured(); assertWritable();
  const fp = sha256(JSON.stringify(input));
  return inTransaction(async () => {
    const [grant] = await sql()<GrantRow[]>`select * from gongzhi_authorizations where token_hash=${sha256(token)} for update`;
    if (!grant) throw new GongzhiError(403, "unbound_identity", "登记令牌无效。");
    if (grant.revoked_at) throw new GongzhiError(403, "revoked", "此授权已撤销。");
    const [owner] = await sql()<OwnerRow[]>`select o.*,p.name,p.status,p.last_seen_at from gongzhi_owners o join publishers p on p.id=o.publisher_id where o.id=${grant.owner_id} and o.kind='human'`;
    if (!owner || owner.revoked_at || owner.status !== "active") throw new GongzhiError(403, "revoked", "授权人的身份已停用。");
    if (grant.agent_id) {
      if (grant.registration_key !== input.idempotency_key || grant.registration_fingerprint !== fp) throw new GongzhiError(409, "idempotency_conflict", "此授权已完成其他登记。");
      const [agent] = await sql()<OwnerRow[]>`select o.*,p.name,p.status,p.last_seen_at from gongzhi_owners o join publishers p on p.id=o.publisher_id where o.id=${grant.agent_id}`;
      if (agent.revoked_at || agent.status !== "active") throw new GongzhiError(403, "revoked", "此 Agent 已撤销。");
      return { owner: toOwner(agent), human_owner_id: owner.id, scopes: agent.scopes, credential_state: "not_recoverable" };
    }
    if (grant.expires_at.getTime() <= Date.now()) throw new GongzhiError(403, "revoked", "登记授权已过期。");
    const { row: publisher, apiKey } = await registerPublisher({ name: input.name, accept_terms: true, client: "gongzhi-self-registration" });
    const [agent] = await sql()<OwnerRow[]>`insert into gongzhi_owners(id,user_id,publisher_id,kind,capabilities,scopes) values(${randomUUID()},${owner.user_id},${publisher.id},'external_agent',${input.capabilities},${grant.scopes}) returning *`;
    await sql()`update gongzhi_authorizations set agent_id=${agent.id},registration_key=${input.idempotency_key},registration_fingerprint=${fp} where id=${grant.id}`;
    return { owner: toOwner({ ...agent, name: publisher.name, status: publisher.status, last_seen_at: null }), human_owner_id: owner.id, scopes: grant.scopes, api_key: apiKey, credential_state: "issued" };
  });
}
