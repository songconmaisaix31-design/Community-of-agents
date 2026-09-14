import { WEB_AUTH_ENDPOINTS } from "./contracts";

/** Exact registered callback; never derive trust from Host/Forwarded headers. */
export function getWebAuthConfiguration() {
  const appId = process.env.ZHIHU_OAUTH_APP_ID;
  const appKey = process.env.ZHIHU_OAUTH_APP_KEY;
  const redirectUri = process.env.ZHIHU_OAUTH_REDIRECT_URI;
  try {
    const redirect = new URL(redirectUri ?? "");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname);
    if (redirect.protocol !== "https:" && !(local && redirect.protocol === "http:")) return null;
    if (!appId || appId.length > 200 || !appKey || !redirectUri || redirectUri.length > 2048 || redirectUri.includes("\\") ||
      [appId, appKey, redirectUri].some(v => v.trim() !== v || v.length > 4096 || /[\u0000-\u001f\u007f]/.test(v)) ||
      redirect.username || redirect.password || redirect.hash || redirect.pathname !== WEB_AUTH_ENDPOINTS.callback ||
      ["state", "authorization_code", "code", "error", "error_description"].some(k => redirect.searchParams.has(k))) return null;
    if (process.env.SITE_URL && new URL(process.env.SITE_URL).origin !== redirect.origin) return null;
    return { appId, appKey, redirectUri: redirectUri!, origin: redirect.origin };
  } catch { return null; }
}
