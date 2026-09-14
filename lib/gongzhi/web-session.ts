import { inTransaction, sql } from "../db";
import { sha256 } from "../ids";
import type { WebSession } from "./contracts";
import { assertDatabaseConfigured, GongzhiError } from "./errors";
import { getWebAuthConfiguration } from "./web-auth-config";

export const SESSION_COOKIE = "__Host-gongzhi_session";
export const STATE_COOKIE = "__Host-gongzhi_oauth";
export const hasExplicitCredential = (req: Request) => req.headers.has("authorization") || req.headers.has("x-api-key");
export const isMutation = (req: Request) => !["GET", "HEAD", "OPTIONS"].includes(req.method);
export function opaqueCookie(req: Request, name: string): string | null {
  const matches = (req.headers.get("cookie") ?? "").split(";").map(v => v.trim()).filter(v => v.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
export function webCookie(name: string, value: string, seconds: number) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(seconds))}`;
}
export function assertBrowserOrigin(req: Request) {
  const config = getWebAuthConfiguration();
  if (!config) throw new GongzhiError(503, "unavailable", "尚未配置本项目知乎登录。");
  if (req.headers.get("origin") !== config.origin || req.headers.get("sec-fetch-site") === "cross-site")
    throw new GongzhiError(403, "forbidden", "此登录会话只允许本站同源操作。");
}
type SessionRow = { user_id: string; name: string | null; avatar_url: string | null; expires_at: Date };
export async function readWebSession(req: Request, lock = false): Promise<WebSession> {
  // Explicit credentials never silently become a browser session.
  if (hasExplicitCredential(req)) throw new GongzhiError(401, "unauthenticated", "此接口仅使用本站浏览器会话。");
  const token = opaqueCookie(req, SESSION_COOKIE);
  if (!token) return { user: null, expires_at: null };
  if (isMutation(req)) assertBrowserOrigin(req);
  if (!getWebAuthConfiguration()) throw new GongzhiError(503, "unavailable", "本站登录配置不可用。");
  assertDatabaseConfigured();
  const hash = sha256(token);
  const rows = lock
    ? await sql()<SessionRow[]>`select s.user_id,u.name,u.avatar_url,s.expires_at from gongzhi_web_sessions s join gongzhi_web_users u on u.id=s.user_id where s.session_hash=${hash} and s.revoked_at is null and s.expires_at>clock_timestamp() for update of s`
    : await sql()<SessionRow[]>`select s.user_id,u.name,u.avatar_url,s.expires_at from gongzhi_web_sessions s join gongzhi_web_users u on u.id=s.user_id where s.session_hash=${hash} and s.revoked_at is null and s.expires_at>clock_timestamp()`;
  const row = rows[0];
  return row ? { user: { id: row.user_id, provider: "zhihu", name: row.name, avatar_url: row.avatar_url }, expires_at: row.expires_at.toISOString() } : { user: null, expires_at: null };
}
export async function verifiedWebUser(req: Request, lock = false): Promise<string> {
  const session = await readWebSession(req, lock);
  if (!session.user) throw new GongzhiError(401, "unauthenticated", "登录已失效，请重新登录。");
  return session.user.id;
}
/** Hold the session row through REST human writes, serializing logout against consent. */
export async function withCookieMutation<T>(req: Request, run: () => Promise<T>): Promise<T> {
  if (hasExplicitCredential(req) || !isMutation(req) || !opaqueCookie(req, SESSION_COOKIE)) return run();
  return inTransaction(async () => { await verifiedWebUser(req, true); return run(); });
}
