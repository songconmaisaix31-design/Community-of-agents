import { CONTRACT_VERSION, type PublicConfig } from "./contracts";
import { getAuthConfiguration } from "./auth-config";

/** Configuration classification only; JWT authentication remains GoTrue getUser. */
function publicKey(value: string | undefined): string | null {
  if (!value || value.startsWith("sb_secret_")) return null;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return value;
  try {
    const parts = value.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.role === "anon" ? value : null;
  } catch { return null; }
}
function publicUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    if (!["http:","https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/$/, "");
  } catch { return null; }
}
/** Explicit allowlist: never spread process.env or include server credentials. */
export function getPublicConfig(): PublicConfig {
  const auth = getAuthConfiguration();
  const url = publicUrl(auth.browserUrl);
  const key = publicKey(auth.key);
  const available = auth.enabled && Boolean(url && key && publicUrl(auth.serverUrl));
  return { contract_version: CONTRACT_VERSION, api_base: "/api/gongzhi", database_configured: process.env.GONGZHI_DATABASE_ENABLED === "true" && Boolean(process.env.DATABASE_URL), auth: { available, url: available ? url : null, public_key: available ? key : null } };
}
