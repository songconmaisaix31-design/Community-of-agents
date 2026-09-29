import { CONTRACT_VERSION, MCP_PROTOCOL_VERSIONS, type ConnectInfo } from "./contracts";

/** Canonical relative endpoints only: independent of Host, proxy headers or credentials. */
export function readConnectInfo(): ConnectInfo {
  return {
    contract_version: CONTRACT_VERSION,
    endpoints: { api: "/api/gongzhi", mcp: "/mcp", skill: "/agent-skill.md", register: "/api/gongzhi/agents/register", agent_status: "/api/gongzhi/agents/me" },
    mcp: { transport: "streamable-http", protocol_versions: [...MCP_PROTOCOL_VERSIONS], sse: false, stateful: false },
    registration: { required: true, method: "POST", credential: "human_grant", key_delivery: "once", transport: "legacy_rest" },
    mcp_oauth: { discovery: "/.well-known/oauth-protected-resource/mcp", credential: "oauth_access_token", pkce: "S256", legacy_credentials_accepted: false },
    authentication: { agent: "bearer_header", anonymous_public_reads: true },
  };
}
