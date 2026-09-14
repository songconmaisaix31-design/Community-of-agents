import { randomBytes, randomUUID } from "node:crypto";
import { inTransaction, sql } from "../db";
import { clientIp, rateLimit } from "../http";
import { sha256 } from "../ids";
import { createZhihuOAuth, ZhihuOAuthError, type ZhihuOAuthUser } from "./zhihu/oauth";
import { assertDatabaseConfigured, errorResponse, GongzhiError } from "./errors";
import { getWebAuthConfiguration } from "./web-auth-config";
import { assertBrowserOrigin, hasExplicitCredential, opaqueCookie, readWebSession, SESSION_COOKIE, STATE_COOKIE, webCookie } from "./web-session";

const randomToken = () => randomBytes(32).toString("base64url");
const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const invalid = () => new GongzhiError(400, "invalid_request", "登录请求无效或已使用，请重新发起。");
function configured() {
  const config = getWebAuthConfiguration();
  if (!config) throw new GongzhiError(503, "unavailable", "尚未配置本项目知乎登录。");
  assertDatabaseConfigured(); return config;
}
function result(data: unknown) { return Response.json({ ok: true, data, mode: "live" }, { headers: privateHeaders }); }
async function emptyJson(req: Request) {
  if (req.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || !req.body) throw invalid();
  const reader = req.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0, complete = false;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) { complete = true; break; }
      size += part.value.byteLength;
      if (size > 1024) throw invalid();
      chunks.push(part.value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) throw invalid();
  } catch { throw invalid(); }
  finally { if (!complete) void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function callbackResult(code: string) {
  // Fixed existing product route. Never reflect code/state/provider errors in the URL.
  return new Response(null, { status: 303, headers: { ...privateHeaders, Location: `/zh?auth=${code}`, "Set-Cookie": webCookie(STATE_COOKIE, "", 0) } });
}
async function mapUser(user: ZhihuOAuthUser) {
  const aliases = [user.uid && { subject: `uid:${user.uid}`, kind: "uid" }, user.hashId && { subject: `hash:${user.hashId}`, kind: "hash" }].filter(x => !!x).sort((a, b) => a.subject.localeCompare(b.subject));
  if (!aliases.length || !aliases.some(a => a.subject === user.subject)) throw invalid();
  for (const alias of aliases) await sql()`select pg_advisory_xact_lock(hashtextextended(${`zhihu:${alias.subject}`},0))`;
  const found = await sql()<{ user_id: string }[]>`select distinct user_id from gongzhi_web_subjects where provider='zhihu' and subject in ${sql()(aliases.map(a => a.subject))}`;
  if (found.length > 1) throw new GongzhiError(403, "unauthenticated", "知乎身份标识冲突，请联系管理员核对。");
  const id = found[0]?.user_id ?? randomUUID();
  if (!found.length) await sql()`insert into gongzhi_web_users(id,name,avatar_url) values(${id},${user.name},${user.avatarUrl})`;
  else {
    // Serialize addition of a previously absent identifier kind, without reassigning a subject.
    await sql()`select id from gongzhi_web_users where id=${id} for update`;
    const known = await sql()<{ subject: string; kind: string }[]>`select subject,kind from gongzhi_web_subjects where user_id=${id} and provider='zhihu'`;
    if (aliases.some(a => known.some(k => k.kind === a.kind && k.subject !== a.subject))) throw new GongzhiError(403, "unauthenticated", "知乎身份标识冲突，请联系管理员核对。");
    await sql()`update gongzhi_web_users set name=${user.name},avatar_url=${user.avatarUrl} where id=${id}`;
  }
  for (const alias of aliases) await sql()`insert into gongzhi_web_subjects(provider,subject,kind,user_id) values('zhihu',${alias.subject},${alias.kind},${id}) on conflict(provider,subject) do nothing`;
  return id;
}
export async function handleWebAuth(req: Request, action: "start" | "session" | "logout" | "callback", upstreamFetch?: typeof fetch): Promise<Response> {
  try {
    if (hasExplicitCredential(req)) throw new GongzhiError(401, "unauthenticated", "网页登录不接受 Agent 或其他显式凭据。");
    if (action === "session") {
      if (req.method !== "GET") throw invalid();
      return result(await readWebSession(req));
    }
    const config = configured();
    if (action === "callback") {
      if (req.method !== "GET") throw invalid();
      const url = new URL(req.url), expected = new URL(config.redirectUri);
      const state = url.searchParams.get("state"), browser = opaqueCookie(req, STATE_COOKIE);
      if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || !browser || url.pathname !== expected.pathname ||
          ["state", "authorization_code", "error", "code"].some(k => url.searchParams.getAll(k).length > 1) ||
          [...expected.searchParams].some(([k, v]) => url.searchParams.getAll(k).length !== 1 || url.searchParams.get(k) !== v)) throw invalid();
      // One SQL statement commits the consumption BEFORE any provider network call.
      const [consumed] = await sql()`update gongzhi_web_states set consumed_at=clock_timestamp()
        where state_hash=${sha256(state)} and browser_hash=${sha256(browser)} and redirect_uri=${config.redirectUri}
        and consumed_at is null and cancelled_at is null and expires_at>clock_timestamp() returning state_hash`;
      if (!consumed) throw invalid();
      if (url.searchParams.has("error")) return callbackResult("cancelled");
      const code = url.searchParams.get("authorization_code");
      if (!code || code.length > 4096 || /[\u0000-\u001f\u007f]/.test(code) || url.searchParams.has("code")) throw invalid();
      const adapter = createZhihuOAuth({ ...config, fetch: upstreamFetch });
      const started = Date.now();
      const token = await adapter.exchangeCode(code, req.signal);
      let user: ZhihuOAuthUser;
      try { user = await adapter.readUser(token.accessToken, req.signal); }
      finally { token.accessToken = ""; }
      const expires = new Date(started + Math.min(token.expiresIn, 8 * 3600) * 1000);
      if (expires.getTime() <= Date.now()) throw new GongzhiError(401, "unauthenticated", "知乎授权已到期，请重新登录。");
      const session = randomToken();
      await inTransaction(async () => {
        const [pending] = await sql()`select state_hash from gongzhi_web_states where state_hash=${sha256(state)} and cancelled_at is null for update`;
        if (!pending) throw invalid();
        const userId = await mapUser(user);
        const previous = opaqueCookie(req, SESSION_COOKIE);
        if (previous) await sql()`update gongzhi_web_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()) where session_hash=${sha256(previous)}`;
        await sql()`insert into gongzhi_web_sessions(session_hash,browser_hash,user_id,expires_at) values(${sha256(session)},${sha256(browser)},${userId},${expires})`;
      });
      const response = callbackResult("success");
      response.headers.append("Set-Cookie", webCookie(SESSION_COOKIE, session, (expires.getTime() - Date.now()) / 1000));
      return response;
    }
    if (req.method !== "POST") throw invalid();
    assertBrowserOrigin(req);
    await emptyJson(req);
    if (action === "start") {
      await rateLimit(`web-oauth:${clientIp(req)}`, 20, 600, "login starts");
      const state = randomToken(), browser = randomToken();
      const authorizationUrl = createZhihuOAuth(config).authorizationUrl(state);
      await inTransaction(async () => {
        const previous = opaqueCookie(req, STATE_COOKIE);
        if (previous) {
          await sql()`update gongzhi_web_states set cancelled_at=coalesce(cancelled_at,clock_timestamp()) where browser_hash=${sha256(previous)}`;
          await sql()`update gongzhi_web_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()) where browser_hash=${sha256(previous)}`;
        }
        await sql()`insert into gongzhi_web_states(state_hash,browser_hash,redirect_uri,expires_at) values(${sha256(state)},${sha256(browser)},${config.redirectUri},clock_timestamp()+interval '10 minutes')`;
      });
      const response = result({ authorization_url: authorizationUrl });
      response.headers.append("Set-Cookie", webCookie(STATE_COOKIE, browser, 600));
      return response;
    }
    await inTransaction(async () => {
      const session = opaqueCookie(req, SESSION_COOKIE), browser = opaqueCookie(req, STATE_COOKIE);
      if (browser) {
        await sql()`update gongzhi_web_states set cancelled_at=coalesce(cancelled_at,clock_timestamp()) where browser_hash=${sha256(browser)}`;
        await sql()`update gongzhi_web_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()) where browser_hash=${sha256(browser)}`;
      }
      if (session) await sql()`update gongzhi_web_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()) where session_hash=${sha256(session)}`;
    });
    const response = result({ signed_out: true });
    response.headers.append("Set-Cookie", webCookie(SESSION_COOKIE, "", 0));
    response.headers.append("Set-Cookie", webCookie(STATE_COOKIE, "", 0));
    return response;
  } catch (error) {
    if (action === "callback") {
      const code = error instanceof ZhihuOAuthError ? error.code === "unauthorized" ? "unauthenticated" : error.code === "cancelled" ? "cancelled" : error.code === "unavailable" ? "unavailable" : "upstream_failed"
        : error instanceof GongzhiError && ["invalid_request", "unauthenticated", "unavailable"].includes(error.code) ? error.code : "upstream_failed";
      return callbackResult(code);
    }
    return errorResponse(error);
  }
}
