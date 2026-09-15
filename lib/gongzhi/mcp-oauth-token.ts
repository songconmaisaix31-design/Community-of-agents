import { sql } from "../db";
import { sha256 } from "../ids";
import { GongzhiError } from "./errors";
import { mcpOAuthConfig } from "./mcp-oauth-config";
import type { AgentScope } from "./contracts";

export async function validateMcpToken(token: string, lock = false) {
  const c = mcpOAuthConfig();
  if (!/^gongzhi_oauth_[A-Za-z0-9_-]{43}$/.test(token)) throw new GongzhiError(401, "unauthenticated", "MCP OAuth access token required.");
  // Lock the same owner rows as writes/revocation, then recheck the token under the lock.
  if (lock) await sql()`select o.id from gongzhi_owners o join gongzhi_oauth_tokens t on t.agent_id=o.id where t.token_hash=${sha256(token)} for update of o`;
  const [row] = await sql()<{ agent_id: string; scopes: AgentScope[]; credential_version: number }[]>`
    select t.agent_id,t.scopes,t.credential_version from gongzhi_oauth_tokens t
    join gongzhi_owners o on o.id=t.agent_id join publishers p on p.id=o.publisher_id
    join gongzhi_authorizations g on g.id=t.grant_id
    join gongzhi_owners h on h.id=g.owner_id join publishers hp on hp.id=h.publisher_id
    join gongzhi_oauth_clients c on c.id=t.client_id
    where t.token_hash=${sha256(token)} and t.issuer=${c.issuer} and t.resource=${c.resource}
    and t.expires_at>clock_timestamp() and t.revoked_at is null and c.revoked_at is null
    and g.revoked_at is null and g.expires_at>clock_timestamp() and g.agent_id=o.id
    and o.kind='external_agent' and o.revoked_at is null and p.status='active'
    and h.kind='human' and h.user_id=o.user_id and h.revoked_at is null and hp.status='active'
    and o.credential_version=t.credential_version and t.scopes <@ o.scopes and t.scopes <@ g.scopes`;
  if (!row) throw new GongzhiError(401, "unauthenticated", "MCP OAuth token is invalid, expired or revoked.");
  return row;
}
