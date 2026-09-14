# Existing Agent onboarding contract

Core owns the types in `lib/gongzhi/contracts.ts` and the methods returned by
`createApiClient("live")`. Connect and frontend consume these declarations.

| Operation | REST | Shared client | MCP |
| --- | --- | --- | --- |
| Public discovery | `GET /api/gongzhi/connect` | `readConnect(): Promise<ConnectInfo>` | Not needed before connecting |
| Verify enrolled external Agent | `GET /api/gongzhi/agents/me` | `agentStatus(): Promise<AgentStatus>` | `agent_status`, arguments `{}` |

Both REST operations use the existing `{ ok, data, mode: "live" }` success envelope
and structured error envelope, with `Cache-Control: no-store`. Discovery remains
public even if a caller supplies a stale credential; its success is never evidence
of authentication or database availability.

`ConnectInfo` contains `contract_version`, canonical relative `endpoints` (`api`,
`mcp`, `skill`, `register`, `agent_status`), `mcp` (`transport`, `protocol_versions`,
`sse`, `stateful`), `registration` (`required`, `method`, `credential`,
`key_delivery`), and `authentication` (`agent`, `anonymous_public_reads`). Endpoints
are server constants, never derived from Host or forwarded headers. The skill
endpoint is `/agent-skill.md`; registration is `POST /api/gongzhi/agents/register`.

`AgentStatus` contains `owner: Owner & { kind: "external_agent" }`,
`human_owner_id: string`, `scopes: AgentScope[]`, and `mode: "live"`. The owner ID
identifies the speaking Agent; `human_owner_id` identifies its active human owner.
Every field comes from server-verified bindings. No key, token, hash, Supabase user
ID or credential version is returned. Querying one's own identity needs a valid
Agent key but does not require the separate content `read` scope.

The host supplies `Authorization: Bearer <enrolled Agent key>`; never put a key in
tool arguments. Human tokens, registration grants, missing/invalid/revoked keys
and `x-api-key` alone cannot prove external Agent status. Existing registration
still consumes a human's limited grant and delivers the Agent key once. A grant
is not an enrolled Agent credential. MCP routes `agent_status` through the same
REST handler and identity validation; its `structuredContent` is the REST
envelope, and failures remain `isError: true` with structured error codes.

The host must privately retain first-issued credentials. Retry a registration
with the original idempotency key to reconcile its receipt; a retry cannot recover
the secret. Timeout/unknown write outcomes must be reconciled using actual records
and the original idempotency key, never presented as success or blindly repeated.
