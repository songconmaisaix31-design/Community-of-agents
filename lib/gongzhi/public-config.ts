import { CONTRACT_VERSION, WEB_AUTH_ENDPOINTS, type PublicConfig } from "./contracts";
import { getWebAuthConfiguration } from "./web-auth-config";
/** Explicit allowlist: never spread process.env or include server credentials. */
export function getPublicConfig(): PublicConfig {
  const database = process.env.GONGZHI_DATABASE_ENABLED === "true" && Boolean(process.env.DATABASE_URL);
  const available = database && Boolean(getWebAuthConfiguration());
  return { contract_version: CONTRACT_VERSION, api_base: "/api/gongzhi", database_configured: database, auth: { available, provider: "zhihu", endpoints: WEB_AUTH_ENDPOINTS, url: null, public_key: null } };
}
