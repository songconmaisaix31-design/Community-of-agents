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

## MCP transport

The existing stateless handler follows the relevant
[Streamable HTTP transport rules](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).
`POST /mcp` returns JSON; GET/HEAD/DELETE/OPTIONS return empty 405 (`Allow: POST`).
No SSE stream, server session, OAuth onboarding or extra server framework is added.

Initialization returns the supported requested protocol or `2025-06-18`, with the
same negotiated response header. Subsequent unsupported protocol headers return
400; a missing header defaults to `2025-03-26`. Existing older JSON clients retain
negotiation compatibility (`2025-03-26`, `2024-11-05`) and legacy batches; this does
not provide deprecated HTTP+SSE. Modern messages and initialization are single
objects. Valid notifications/client responses return empty 202; notifications
never execute tools. Invalid messages fail before dispatch. JSON-only/omitted
Accept remains compatible; explicitly excluding JSON returns 406. New clients
should send `Accept: application/json, text/event-stream` and JSON Content-Type.

Origin, when present, must exactly match configured `SITE_URL` origin, even behind
an HTTP reverse proxy. Without configuration only the exact loopback request
origin is allowed. Foreign, malformed and null origins fail with 403; forwarded
headers never grant trust. CLI requests may omit Origin. This check applies to
POST and unsupported methods, and does not replace tool authentication.

## Validation and boundaries (2026-09-14)

`tests/core/connect.test.ts` checks discovery and shared client paths.
`agent-status.test.ts` uses explicitly synthetic row storage to check REST/MCP
identity, actual scopes, revocation/races, inactive human bindings, secret omission
and unavailable/timeout outcomes. It never contacts Auth or PostgreSQL.
`mcp-protocol.test.ts` covers proxy/local Origin, negotiation, no-effect
notifications, malformed requests, unsupported methods and header-only keys.

`mcp-sdk.test.ts` uses the pinned official TypeScript SDK **1.30.0** as a development
dependency. A real ephemeral loopback HTTP socket invokes the production handler:
initialize, initialized notification, GET 405, tools/list, ping and structured
unauthenticated/argument-key failures. The SDK offers its newer version and
successfully negotiates `2025-06-18`. This proves transport interoperability, not a
real enrolled Agent or public deployment. The server does not import the SDK.

No database migration, production mutation, real key read or public probe is part
of this slice. Integration I separately validates real scoped Agent keys against
its authorized isolated Auth/PG environment. Public deployment currently has the
coordinator-reported ICP restriction; this work does not work around that block.

Executed checks: `npm run typecheck` passed; `npm run build` passed (including
the self-hosted client bundle, with no migration); `npm run test:core` passed
56/61 with 5 environment-dependent cases skipped (4 live DB/Auth/browser cases
and optional Compose rendering). After the final strict key-prefix correction,
the targeted status/protocol/SDK tests passed 12/12. Existing locked package
versions were retained when adding the SDK development dependency.
