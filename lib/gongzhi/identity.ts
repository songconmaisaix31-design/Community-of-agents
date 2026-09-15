import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { inTransaction, sql } from "../db";
import { bearer } from "../http";
import { sha256 } from "../ids";
import { registerPublisher, rotateApiKey, type PublisherRow } from "../publishers";
import { BindOwnerSchema, type AgentScope, type AgentStatus, type BoundOwner, type Owner } from "./contracts";
import { assertDatabaseConfigured, GongzhiError } from "./errors";
import { getAuthConfiguration } from "./auth-config";
import { hasExplicitCredential, isMutation, verifiedWebUser } from "./web-session";
import { validateMcpToken } from "./mcp-oauth-token";
import { mcpOAuthConfig } from "./mcp-oauth-config";

export interface Identity { readonly owner: Owner; readonly user_id: string }
export type OwnerRow = { id: string; user_id: string; publisher_id: string; kind: Owner["kind"]; capabilities: string[]; scopes: AgentScope[]; revoked_at: Date | null; created_at: Date; credential_version: number; name: string; last_seen_at: Date | null; status: string };
const credentials = new WeakMap<Identity, number>();
const webRequests = new WeakMap<Identity, Request>();
const oauthCredentials = new WeakMap<Identity, string>();
const internalActors = new WeakMap<Request, Identity>();
export function hasInternalActor(req: Request) { return internalActors.has(req); }
/** Server-only in-process dispatch; no bearer is forwarded to REST or an arbitrary origin. */
export function bindInternalActor(req: Request, actor: Identity) {
  if (!oauthCredentials.has(actor) || !credentials.has(actor)) throw new GongzhiError(403, "forbidden", "Verified MCP actor required.");
  internalActors.set(req, actor);
}
export async function resolveMcpIdentity(req: Request): Promise<Identity> {
  const c = mcpOAuthConfig();
  // The route owns origin trust at a reverse proxy; canonical audience always comes from configuration.
  if (new URL(req.url).pathname !== new URL(c.resource).pathname || new URL(req.url).searchParams.has("access_token") || req.headers.has("x-api-key")) throw new GongzhiError(401, "unauthenticated", "MCP Bearer required.");
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  const grant = await validateMcpToken(token);
  const [row] = await sql()<OwnerRow[]>`select o.*,p.name,p.last_seen_at,p.status from gongzhi_owners o join publishers p on p.id=o.publisher_id where o.id=${grant.agent_id}`;
  if (!row || row.credential_version !== grant.credential_version) throw new GongzhiError(401, "unauthenticated", "MCP credential changed.");
  const actor = identity(row); oauthCredentials.set(actor, token); return actor;
}
export function toOwner(row: OwnerRow): Owner {
  return { id: row.id, publisher_id: row.publisher_id, kind: row.kind, name: row.name, capabilities: row.capabilities, revoked_at: row.revoked_at?.toISOString() ?? null, last_seen_at: row.last_seen_at?.toISOString() ?? null, created_at: row.created_at.toISOString(), mode: "live" };
}
function identity(row: OwnerRow): Identity {
  if (row.revoked_at || row.status !== "active") throw new GongzhiError(403, "revoked", "此发言身份已撤销或停用。");
  const value = Object.freeze({ owner: Object.freeze(toOwner(row)), user_id: row.user_id });
  credentials.set(value, row.credential_version);
  return value;
}
export async function verifiedUser(req: Request): Promise<string> {
  if (internalActors.has(req)) throw new GongzhiError(403, "forbidden", "MCP Agent cannot act as a human.");
  if (!hasExplicitCredential(req)) return verifiedWebUser(req);
  const token = bearer(req);
  if (!token || token.startsWith("crier_sk_")) throw new GongzhiError(401, "unauthenticated", "请使用人的 Supabase 登录身份。");
  const { serverUrl: url, key, enabled } = getAuthConfiguration();
  if (!enabled || !url || !key) throw new GongzhiError(503, "unavailable", "尚未配置本项目 Supabase 身份服务。");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) } });
  let result;
  try { result = await client.auth.getUser(token); }
  catch { throw new GongzhiError(503, "unavailable", "身份服务暂时不可用，请稍后重试。"); }
  const { data, error } = result;
  if (error && (!error.status || error.status >= 500 || error.status === 429)) throw new GongzhiError(503, "upstream_failed", "身份服务暂时不可用，请稍后重试。");
  if (error || !data.user) throw new GongzhiError(401, "unauthenticated", "登录已失效，请重新登录。");
  return data.user.id;
}
export async function resolveIdentity(req: Request): Promise<Identity> {
  const internal = internalActors.get(req);
  if (internal) { await validatedIdentityRow(internal); return internal; }
  const token = bearer(req);
  if (hasExplicitCredential(req) && !token) throw new GongzhiError(401, "unauthenticated", "显式凭据无效。");
  // Verify anonymous requests before attempting any database operation.
  const userId = token?.startsWith("crier_sk_") ? null : await verifiedUser(req);
  assertDatabaseConfigured();
  const rows = token?.startsWith("crier_sk_")
    ? await sql()<OwnerRow[]>`select o.*,p.name,p.last_seen_at,p.status from gongzhi_owners o join publishers p on p.id=o.publisher_id where p.api_key_hash=${sha256(token)} and o.kind='external_agent'`
    : await sql()<OwnerRow[]>`select o.*,p.name,p.last_seen_at,p.status from gongzhi_owners o join publishers p on p.id=o.publisher_id where o.user_id=${userId} and o.kind='human'`;
  if (!rows[0]) throw new GongzhiError(403, "unbound_identity", "此凭据尚未绑定共治发言身份。");
  const actor = identity(rows[0]);
  if (!hasExplicitCredential(req)) webRequests.set(actor, req);
  return actor;
}
async function validatedIdentityRow(actor: Identity, lock = false, scope?: AgentScope): Promise<OwnerRow> {
  if (!credentials.has(actor)) throw new GongzhiError(403, "unbound_identity", "身份必须由服务器验证。");
  const oauth = oauthCredentials.get(actor);
  if (oauth) {
    const grant = await validateMcpToken(oauth, lock);
    if (scope && !grant.scopes.includes(scope)) throw new GongzhiError(403, "forbidden", `MCP scope ${scope} required.`);
  }
  const request = webRequests.get(actor);
  if (request && await verifiedWebUser(request, lock) !== actor.user_id) throw new GongzhiError(401, "unauthenticated", "登录会话已失效。");
  const rows = lock
    ? await sql()<OwnerRow[]>`select o.*,p.name,p.last_seen_at,p.status from gongzhi_owners o join publishers p on p.id=o.publisher_id where o.id=${actor.owner.id} for update of o,p`
    : await sql()<OwnerRow[]>`select o.*,p.name,p.last_seen_at,p.status from gongzhi_owners o join publishers p on p.id=o.publisher_id where o.id=${actor.owner.id}`;
  const row = rows[0];
  if (!row || row.user_id !== actor.user_id || row.revoked_at || row.status !== "active" || row.credential_version !== credentials.get(actor)) throw new GongzhiError(403, "revoked", "此发言身份或凭据已撤销。");
  if (scope && row.kind !== "human" && !row.scopes.includes(scope)) throw new GongzhiError(403, "forbidden", `此 Agent 未获 ${scope} 授权。`);
  return row;
}
export async function assertIdentity(actor: Identity, lock = false, scope?: AgentScope): Promise<PublisherRow> {
  const row = await validatedIdentityRow(actor, lock, scope);
  const [publisher] = await sql()<PublisherRow[]>`select * from publishers where id=${row.publisher_id}`;
  return publisher;
}
export async function agentStatus(req: Request): Promise<AgentStatus> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!internalActors.has(req) && !match?.[1].startsWith("crier_sk_")) throw new GongzhiError(401, "unauthenticated", "请由宿主通过 Bearer 提供已登记的 Agent 密钥。");
  const actor = await resolveIdentity(req);
  const row = await validatedIdentityRow(actor);
  if (row.kind !== "external_agent") throw new GongzhiError(403, "forbidden", "此接口仅核验外部 Agent。");
  return { owner: { ...toOwner(row), kind: "external_agent" }, human_owner_id: await humanOwnerId(actor), scopes: [...row.scopes], mode: "live" };
}
export async function humanOwnerId(actor: Identity): Promise<string> {
  const [human] = await sql()`select o.id from gongzhi_owners o join publishers p on p.id=o.publisher_id where o.user_id=${actor.user_id} and o.kind='human' and o.revoked_at is null and p.status='active'`;
  if (!human) throw new GongzhiError(403, "unbound_identity", "请先绑定授权人的身份。");
  return human.id;
}
export async function bindOwner(req: Request, raw: unknown): Promise<BoundOwner> {
  const userId = await verifiedUser(req);
  const input = BindOwnerSchema.parse(raw);
  assertDatabaseConfigured();
  return inTransaction(async () => {
    await sql()`select pg_advisory_xact_lock(hashtextextended(${userId},0))`;
    if (input.kind === "human") {
      const [existing] = await sql()<OwnerRow[]>`select o.*,p.name,p.last_seen_at,p.status from gongzhi_owners o join publishers p on p.id=o.publisher_id where o.user_id=${userId} and o.kind='human'`;
      if (existing) return { owner: identity(existing).owner };
    }
    const { row, apiKey } = await registerPublisher({ name: input.name, accept_terms: true, client: "gongzhi" });
    const [owner] = await sql()<OwnerRow[]>`insert into gongzhi_owners(id,user_id,publisher_id,kind,capabilities) values(${randomUUID()},${userId},${row.id},${input.kind},${input.capabilities}) returning *`;
    const result = { ...owner, name: row.name, last_seen_at: null, status: "active" };
    return { owner: toOwner(result), ...(input.kind === "external_agent" ? { api_key: apiKey } : {}) };
  });
}
export async function listOwners(req: Request): Promise<Owner[]> {
  const userId = await verifiedUser(req); assertDatabaseConfigured();
  const rows = await sql()<OwnerRow[]>`select o.*,p.name,p.last_seen_at,p.status from gongzhi_owners o join publishers p on p.id=o.publisher_id where o.user_id=${userId} order by o.created_at`;
  return rows.map(toOwner);
}
export async function changeOwner(req: Request, id: string, rotate: boolean): Promise<Owner | { api_key: string }> {
  const userId = await verifiedUser(req); assertDatabaseConfigured();
  return inTransaction(async () => {
    const [row] = await sql()<OwnerRow[]>`select o.*,p.name,p.last_seen_at,p.status from gongzhi_owners o join publishers p on p.id=o.publisher_id where o.id=${id} and o.user_id=${userId} for update of o,p`;
    if (!row) throw new GongzhiError(404, "not_found", "未找到本人所有的身份。");
    if (row.kind === "human") throw new GongzhiError(403, "forbidden", "此操作只适用于 Agent。");
    if (rotate && (row.revoked_at || row.kind !== "external_agent")) throw new GongzhiError(403, "revoked", "此身份不能轮换密钥。");
    await sql()`update gongzhi_owners set credential_version=credential_version+1, revoked_at=case when ${rotate} then revoked_at else coalesce(revoked_at,now()) end where id=${id}`;
    if (rotate) return { api_key: await rotateApiKey(row.publisher_id) };
    const [updated] = await sql()<OwnerRow[]>`select o.*,p.name,p.last_seen_at,p.status from gongzhi_owners o join publishers p on p.id=o.publisher_id where o.id=${id}`;
    return toOwner(updated);
  });
}
export async function resolvePlatformIdentity(req: Request): Promise<Identity> {
  const human = await resolveIdentity(req);
  if (human.owner.kind !== "human") throw new GongzhiError(403, "forbidden", "平台助手仅供登录的人发起。");
  return inTransaction(async () => {
    await assertIdentity(human, true);
    let [row] = await sql()<OwnerRow[]>`select o.*,p.name,p.last_seen_at,p.status from gongzhi_owners o join publishers p on p.id=o.publisher_id where o.user_id=${human.user_id} and o.kind='platform_agent'`;
    if (!row) {
      if (!hasExplicitCredential(req) && !isMutation(req)) throw new GongzhiError(403, "unbound_identity", "此用户尚未创建平台助手身份。");
      const { row: pub } = await registerPublisher({ name: "平台体验助手", accept_terms: true, client: "gongzhi-platform" });
      const [created] = await sql()<OwnerRow[]>`insert into gongzhi_owners(id,user_id,publisher_id,kind,capabilities,scopes) values(${randomUUID()},${human.user_id},${pub.id},'platform_agent',${["read_need","find_experience","submit_result"]},${["read","submit_result"]}) returning *`;
      row = { ...created, name: pub.name, last_seen_at: null, status: "active" };
    }
    const actor = identity(row);
    const request = webRequests.get(human);
    if (request) webRequests.set(actor, request);
    return actor;
  });
}
