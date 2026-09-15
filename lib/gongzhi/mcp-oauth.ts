import { createHash, randomBytes, randomUUID } from "node:crypto";
import { OAuthClientMetadataSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import { z } from "zod";
import { inTransaction, sql } from "../db";
import { HttpError, rateLimit } from "../http";
import { sha256 } from "../ids";
import { assertWritable } from "../limits";
import { registerPublisher } from "../publishers";
import { assertDatabaseConfigured, GongzhiError } from "./errors";
import { bindOwner, resolveIdentity, assertIdentity } from "./identity";
import { mcpOAuthConfig, oauthMetadata, OAUTH_SCOPES } from "./mcp-oauth-config";
import { opaqueCookie, readWebSession, verifiedWebUser, webCookie } from "./web-session";
import type { AgentScope } from "./contracts";
import { handleWebAuth } from "./web-auth";

export const MCP_BROWSER_COOKIE = "__Host-gongzhi_mcp";
const random = () => randomBytes(32).toString("base64url");
const headers = { "Cache-Control": "no-store", "Pragma": "no-cache", "Referrer-Policy": "no-referrer" };
class OAuthError extends Error { constructor(public error: string, public status = 400) { super(error); } }
const invalid = () => new OAuthError("invalid_request");
export function oauthErrorResponse(error: unknown) {
  const status = error instanceof OAuthError || error instanceof GongzhiError || error instanceof HttpError ? error.status : error instanceof z.ZodError ? 400 : 503;
  return Response.json({ error: error instanceof OAuthError ? error.error : status === 401 ? "login_required" : status === 403 ? "access_denied" : status === 400 ? "invalid_request" : "temporarily_unavailable" }, { status, headers });
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const redirect = (url: string) => new Response(null, { status: 303, headers: { ...headers, Location: url } });
function scopeList(value: string | null): AgentScope[] {
  const scopes = (value ?? "read").split(" ");
  if (!scopes.length || scopes.some(s => !OAUTH_SCOPES.includes(s as AgentScope)) || new Set(scopes).size !== scopes.length) throw new OAuthError("invalid_scope");
  return scopes as AgentScope[];
}
function single(params: URLSearchParams) {
  if ([...params.keys()].some(k => params.getAll(k).length !== 1)) throw invalid();
  return params;
}
async function body(req: Request, format: "json" | "form") {
  if (req.headers.get("content-type")?.split(";")[0].trim() !== (format === "json" ? "application/json" : "application/x-www-form-urlencoded") || !req.body) throw invalid();
  const reader = req.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel(); reject(invalid()); }, 3000); });
    for (;;) { const next = await Promise.race([reader.read(), timeout]); if (next.done) break; size += next.value.length; if (size > 16384) throw invalid(); chunks.push(next.value); }
    const text = Buffer.concat(chunks).toString("utf8");
    return format === "json" ? JSON.parse(text) : single(new URLSearchParams(text));
  } catch { throw invalid(); } finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}
function origin(req: Request) {
  if (req.headers.get("origin") !== mcpOAuthConfig().issuer || req.headers.get("sec-fetch-site") === "cross-site" || req.headers.has("authorization") || req.headers.has("x-api-key")) throw new OAuthError("access_denied", 403);
}
function validRedirect(value: string) {
  try {
    const u = new URL(value);
    return value.length <= 2048 && value === u.href && !u.username && !u.password && !u.hash && !/[\s\\]/.test(value)
      && (u.protocol === "https:" || u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname));
  } catch { return false; }
}
type Pending = { id: string; browser_hash: string; client_id: string; redirect_uri: string; issuer: string; resource: string; scopes: AgentScope[]; state: string | null; challenge: string; csrf_hash: string | null; user_id: string | null; name: string };
export async function readMcpConsent(req: Request, id: string, lock = false): Promise<Pending> {
  const c = mcpOAuthConfig(), browser = opaqueCookie(req, MCP_BROWSER_COOKIE);
  if (!browser || !/^[A-Za-z0-9_-]{43}$/.test(id)) throw invalid();
  if (lock) await sql()`select id from gongzhi_oauth_requests where id=${id} for update`;
  const [pending] = await sql()<Pending[]>`select r.*,c.name from gongzhi_oauth_requests r join gongzhi_oauth_clients c on c.id=r.client_id
    where r.id=${id} and r.browser_hash=${sha256(browser)} and r.expires_at>clock_timestamp() and r.consumed_at is null and c.revoked_at is null
    and r.issuer=${c.issuer} and r.resource=${c.resource}`;
  if (!pending) throw invalid();
  return pending;
}
export async function consentView(req: Request, id: string) {
  const pending = await readMcpConsent(req, id), session = await readWebSession(req);
  if (!session.user) return { pending, user: null, csrf: null };
  const csrf = random();
  await sql()`update gongzhi_oauth_requests set csrf_hash=${sha256(csrf)},user_id=${session.user.id} where id=${id} and consumed_at is null`;
  return { pending, user: session.user, csrf };
}
export async function handleOAuthLogin(req: Request): Promise<Response> {
  try {
    origin(req);
    const params = await body(req, "form") as URLSearchParams, id = params.get("request") ?? "";
    await readMcpConsent(req, id);
    const login = new Request(`${mcpOAuthConfig().issuer}/api/gongzhi/auth/zhihu/start`, { method: "POST", headers: { Cookie: req.headers.get("cookie") ?? "", Origin: mcpOAuthConfig().issuer, "Content-Type": "application/json" }, body: "{}" });
    const result = await handleWebAuth(login, "start", undefined, id);
    if (!result.ok) return result;
    const response = redirect((await result.json()).data.authorization_url);
    for (const cookie of result.headers.getSetCookie()) response.headers.append("Set-Cookie", cookie);
    return response;
  } catch (error) { return oauthErrorResponse(error); }
}
export async function handleOAuth(req: Request, action: "resource" | "server" | "register" | "authorize" | "consent" | "token" | "revoke") {
  try {
    const c = mcpOAuthConfig();
    if (action === "resource" || action === "server") return json(oauthMetadata(action));
    assertDatabaseConfigured(); assertWritable();
    // Durable global ceilings cannot be bypassed by spoofing Forwarded headers.
    await rateLimit(`mcp-oauth:${action}`, action === "register" ? 200 : 3000, 3600, "OAuth requests");
    if (action === "register") {
      const input = OAuthClientMetadataSchema.parse(await body(req, "json"));
      if ((input.token_endpoint_auth_method ?? "none") !== "none" || (input.grant_types && (input.grant_types.length !== 1 || input.grant_types[0] !== "authorization_code")) ||
        (input.response_types && (input.response_types.length !== 1 || input.response_types[0] !== "code")) || input.jwks || input.jwks_uri || input.software_statement) throw new OAuthError("invalid_client_metadata");
      if (!input.redirect_uris.length || input.redirect_uris.length > 5 || input.redirect_uris.some(u => !validRedirect(u))) throw new OAuthError("invalid_redirect_uri");
      const name = input.client_name ?? "MCP client";
      if (!name.trim() || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) throw new OAuthError("invalid_client_metadata");
      if (input.scope) scopeList(input.scope);
      const id = randomUUID();
      await sql()`insert into gongzhi_oauth_clients(id,name,redirect_uris) values(${id},${name},${input.redirect_uris})`;
      return json({ client_id: id, client_id_issued_at: Math.floor(Date.now()/1000), client_name: name, redirect_uris: input.redirect_uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"] }, 201);
    }
    if (action === "authorize") {
      const p = single(new URL(req.url).searchParams);
      const client = p.get("client_id") ?? "", uri = p.get("redirect_uri") ?? "";
      const [registered] = await sql()`select id from gongzhi_oauth_clients where id=${client} and ${uri}=any(redirect_uris) and revoked_at is null`;
      if (!registered) throw invalid(); // Never redirect to unvalidated client input.
      if (p.get("response_type") !== "code") throw new OAuthError("unsupported_response_type");
      if (p.get("resource") !== c.resource) throw new OAuthError("invalid_target");
      if (p.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(p.get("code_challenge") ?? "")) throw invalid();
      if ((p.get("state")?.length ?? 0) > 2048) throw invalid();
      const scopes = scopeList(p.get("scope")), id = random(), browser = opaqueCookie(req, MCP_BROWSER_COOKIE) ?? random();
      await sql()`insert into gongzhi_oauth_requests(id,browser_hash,client_id,redirect_uri,issuer,resource,scopes,state,challenge,expires_at)
        values(${id},${sha256(browser)},${client},${uri},${c.issuer},${c.resource},${scopes},${p.get("state")},${p.get("code_challenge")!},clock_timestamp()+interval '10 minutes')`;
      const response = redirect(`/oauth/consent?request=${id}`);
      response.headers.append("Set-Cookie", webCookie(MCP_BROWSER_COOKIE, browser, 600)); return response;
    }
    const p = await body(req, "form") as URLSearchParams;
    if (action === "consent") {
      origin(req);
      return await inTransaction(async () => {
        const pending = await readMcpConsent(req, p.get("request") ?? "", true), user = await verifiedWebUser(req, true);
        if (pending.user_id !== user || !pending.csrf_hash || sha256(p.get("csrf") ?? "") !== pending.csrf_hash || !["approve", "deny"].includes(p.get("decision") ?? "")) throw new OAuthError("access_denied", 403);
        const target = new URL(pending.redirect_uri);
        if (pending.state !== null) target.searchParams.set("state", pending.state);
        await sql()`update gongzhi_oauth_requests set consumed_at=clock_timestamp() where id=${pending.id}`;
        if (p.get("decision") === "deny") { target.searchParams.set("error", "access_denied"); return redirect(target.href); }
        await bindOwner(req, { kind: "human", name: "共治用户", capabilities: [] });
        const human = await resolveIdentity(req); await assertIdentity(human, true);
        if (human.owner.kind !== "human") throw new OAuthError("access_denied", 403);
        const agentId = randomUUID(), grantId = randomUUID();
        const { row: publisher } = await registerPublisher({ name: pending.name, accept_terms: true, client: "gongzhi-mcp-oauth" });
        const [agent] = await sql()`insert into gongzhi_owners(id,user_id,publisher_id,kind,capabilities,scopes)
          values(${agentId},${user},${publisher.id},'external_agent',${[]},${pending.scopes}) returning credential_version`;
        await sql()`insert into gongzhi_authorizations(id,owner_id,scopes,token_hash,idempotency_key,fingerprint,expires_at,agent_id)
          values(${grantId},${human.owner.id},${pending.scopes},${sha256(random())},${`oauth:${pending.id}`},${sha256(pending.id)},clock_timestamp()+interval '17 minutes',${agentId})`;
        const code = random();
        await sql()`insert into gongzhi_oauth_codes(code_hash,client_id,redirect_uri,issuer,resource,scopes,challenge,agent_id,grant_id,credential_version,expires_at)
          values(${sha256(code)},${pending.client_id},${pending.redirect_uri},${c.issuer},${c.resource},${pending.scopes},${pending.challenge},${agentId},${grantId},${agent.credential_version},clock_timestamp()+interval '2 minutes')`;
        target.searchParams.set("code", code); return redirect(target.href);
      });
    }
    if (req.headers.has("authorization") || req.headers.has("x-api-key") || p.has("client_secret")) throw new OAuthError("invalid_client", 401);
    const client = p.get("client_id") ?? "";
    if (action === "revoke") {
      await inTransaction(async () => {
        await sql()`select o.id from gongzhi_owners o join gongzhi_oauth_tokens t on t.agent_id=o.id where t.token_hash=${sha256(p.get("token") ?? "")} and t.client_id=${client} for update of o`;
        await sql()`update gongzhi_oauth_tokens set revoked_at=coalesce(revoked_at,clock_timestamp()) where token_hash=${sha256(p.get("token") ?? "")} and client_id=${client}`;
      }); return json({});
    }
    if (p.get("grant_type") !== "authorization_code") throw new OAuthError("unsupported_grant_type");
    if (p.get("resource") !== c.resource) throw new OAuthError("invalid_target");
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(p.get("code_verifier") ?? "")) throw new OAuthError("invalid_grant");
    return await inTransaction(async () => {
      const challenge = createHash("sha256").update(p.get("code_verifier")!).digest("base64url");
      const [code] = await sql()`select * from gongzhi_oauth_codes where code_hash=${sha256(p.get("code") ?? "")} for update`;
      if (!code || code.consumed_at || code.expires_at.getTime() <= Date.now() || code.client_id !== client || code.redirect_uri !== p.get("redirect_uri") || code.issuer !== c.issuer || code.resource !== c.resource || code.challenge !== challenge) throw new OAuthError("invalid_grant");
      const [agent] = await sql()`select o.id from gongzhi_owners o join publishers p on p.id=o.publisher_id join gongzhi_authorizations g on g.agent_id=o.id
        join gongzhi_oauth_clients c on c.id=${client} where o.id=${code.agent_id} and o.revoked_at is null and p.status='active' and o.credential_version=${code.credential_version}
        and g.id=${code.grant_id} and g.revoked_at is null and g.expires_at>clock_timestamp() and c.revoked_at is null for update of o`;
      if (!agent) throw new OAuthError("invalid_grant");
      await sql()`update gongzhi_oauth_codes set consumed_at=clock_timestamp() where code_hash=${code.code_hash}`;
      const token = `gongzhi_oauth_${random()}`;
      await sql()`insert into gongzhi_oauth_tokens(token_hash,client_id,issuer,resource,scopes,agent_id,grant_id,credential_version,expires_at)
        values(${sha256(token)},${client},${c.issuer},${c.resource},${code.scopes},${code.agent_id},${code.grant_id},${code.credential_version},clock_timestamp()+interval '15 minutes')`;
      return json({ access_token: token, token_type: "Bearer", expires_in: 900, scope: (code.scopes as string[]).join(" ") });
    });
  } catch (error) { return oauthErrorResponse(error); }
}
