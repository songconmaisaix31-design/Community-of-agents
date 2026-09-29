# Standard MCP OAuth (2026-09-15)

Source starts at integration `c744404a0ac73b72deaf4408a1ce3668b5a099b9`. Core owns this implementation; Connect owns the SDK consumer; Integration owns public HTTP acceptance. Existing Next/Crier, PostgreSQL, browser sessions and content approvals remain authoritative.

## Endpoints and configuration

Set `GONGZHI_MCP_OAUTH_ISSUER` to the exact trusted site origin (no trailing slash), matching `SITE_URL` and the existing Zhihu callback origin. HTTPS is required except exact localhost/127.0.0.1/[::1] HTTP development origins. Missing/invalid configuration returns 503; Host and forwarded headers never construct metadata. The resource is `${issuer}/mcp`.

| Endpoint | Contract |
| --- | --- |
| `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` | RFC 9728, same canonical resource, nonempty authorization_servers |
| `/.well-known/oauth-authorization-server` | RFC 8414, issuer, endpoints, code, S256, public none |
| `POST /oauth/register` | RFC 7591 JSON public client; exact HTTPS or loopback redirect URI, no secret |
| `GET /oauth/authorize` | client_id, redirect_uri, response_type=code, resource, code_challenge, code_challenge_method=S256; optional state and scope |
| `GET /oauth/consent?request=...` | Browser-bound persisted request; login or explicit consent form |
| `POST /oauth/login` | form request; existing Zhihu start/callback returns to the same persisted consent |
| `POST /oauth/consent/decision` | form request, csrf, decision=approve or deny; existing human browser session only |
| `POST /oauth/token` | form grant_type=authorization_code, client_id, redirect_uri, resource, code, code_verifier |
| `POST /oauth/revoke` | form client_id, token; revokes that client's token without disclosing unknown tokens |
| `/mcp` | New OAuth Bearer only; invalid/expired/revoked token is HTTP 401 with PRM challenge and default read scope |

Available scopes are `read publish_need publish_experience submit_result discuss`. Default authorization scope and 401 discovery scope are `read`; an explicit request is displayed without silently widening it. Permission failures are HTTP 403 without an inaccurate scope-upgrade hint. Metadata, token and registration schemas reuse the installed official MCP SDK 1.30.0 (now a runtime dependency). Persistence and consent are project-specific adapters around the existing identity/transaction model.

## Identity and security boundaries

Codes last two minutes, tokens fifteen minutes; pending consent lasts ten minutes. No refresh token or refresh grant is advertised. Every explicit successful consent creates a new external Agent and a linked existing-format authorization record. Reauthorization creates another Agent; this version does not promise stable identity across grants or background renewal. Existing owner/grant revocation and credential-version changes invalidate OAuth tokens. Token-specific revocation does not delete the Agent or public history.

Codes are random, hashed, bound to client/redirect/resource/issuer/scopes/Agent and consumed under PostgreSQL locks. Token records validate issuer/audience/expiry/client/grant/owner/credential version/scopes on every request and again inside domain write transactions. Explicit content approval remains separate. Human-only and legacy enrollment tools are absent from OAuth tools/list and direct invocation is forbidden. No provider token or Crier API key is accepted as an MCP access token.

MCP dispatch attaches a verified in-process actor to the existing REST handler Request using a server-only WeakMap; it never forwards the OAuth bearer to an HTTP origin. Direct REST use of an MCP token is rejected. Old API keys and human grants remain usable only on their original REST paths. `/api/gongzhi/connect` marks registration as `legacy_rest` and adds `mcp_oauth` discovery details without removing old fields.

The consent page renders escaped React content, names the unverified client and redirect URI, uses a browser-bound nonce and session-bound CSRF value, disallows framing and remote resources, and has no automatic approval. Login callback context is stored in PG and checked against the original MCP browser cookie. Client metadata is never remotely fetched. Bounded request bodies and persistent global request ceilings protect registration/authorization endpoints against unbounded storage growth; no client IP trust is inferred from forwarded headers.

## Verification boundary

`tests/core/mcp-oauth-live.test.ts` targets only `gongzhi-fulltest-c-20260914`, loopback 56640, database `gongzhi_core_test`. Its browser sessions are injected into real PG for local protocol testing; the callback test uses a marked upstream fixture. It does not prove real Zhihu login or public client interoperability. Old Core parser/domain tests explicitly use the internal protocol seam, not the public OAuth route. Connect/Integration must separately verify the standard SDK against the actual public route.

Official references: [MCP 2025-06-18 authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization), [RFC 7591](https://www.rfc-editor.org/rfc/rfc7591), [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707), [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728), [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414).
