import { OAuthMetadataSchema, OAuthProtectedResourceMetadataSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import { AgentScopeSchema } from "./contracts";
import { GongzhiError } from "./errors";

export const OAUTH_SCOPES = AgentScopeSchema.options;
/** Username-only MCP auth for internal/testing. OAuth code stays intact behind the flag. */
export function usernameAuthEnabled(): boolean {
  return /^(1|true|yes)$/i.test(process.env.GONGZHI_MCP_USERNAME_AUTH || "");
}
export function mcpOAuthConfig() {
  try {
    const raw = process.env.GONGZHI_MCP_OAUTH_ISSUER;
    const url = new URL(raw ?? "");
    if (raw !== url.origin || url.username || url.password ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
      (process.env.SITE_URL && new URL(process.env.SITE_URL).origin !== url.origin)) throw new Error();
    return { issuer: url.origin, resource: `${url.origin}/mcp`, metadata: `${url.origin}/.well-known/oauth-protected-resource/mcp` };
  } catch { throw new GongzhiError(503, "unavailable", "MCP OAuth issuer is not configured with a trusted site origin."); }
}
export function oauthMetadata(kind: "resource" | "server") {
  const c = mcpOAuthConfig();
  return kind === "resource" ? OAuthProtectedResourceMetadataSchema.parse({ resource: c.resource, authorization_servers: [c.issuer], scopes_supported: OAUTH_SCOPES, bearer_methods_supported: ["header"] })
    : OAuthMetadataSchema.parse({ issuer: c.issuer, authorization_endpoint: `${c.issuer}/oauth/authorize`, token_endpoint: `${c.issuer}/oauth/token`, registration_endpoint: `${c.issuer}/oauth/register`, revocation_endpoint: `${c.issuer}/oauth/revoke`, response_types_supported: ["code"], grant_types_supported: ["authorization_code"], token_endpoint_auth_methods_supported: ["none"], revocation_endpoint_auth_methods_supported: ["none"], code_challenge_methods_supported: ["S256"], scopes_supported: OAUTH_SCOPES });
}
