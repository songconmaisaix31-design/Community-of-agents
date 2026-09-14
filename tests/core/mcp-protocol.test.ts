import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { handleMcpPost, handleMcpUnsupportedMethod, SUPPORTED_PROTOCOLS } from "../../lib/mcp.ts";

const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
function environment(t: TestContext, name: string, value: string) {
  const old = process.env[name];
  process.env[name] = value;
  t.after(() => { if (old === undefined) delete process.env[name]; else process.env[name] = old; });
}
function post(body: unknown, headers: Record<string, string> = {}, url = "http://localhost:3045/mcp") {
  return handleMcpPost(new Request(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(body) }));
}

test("Origin trusts the configured public origin behind an HTTP proxy, never forwarded headers", async t => {
  environment(t, "SITE_URL", "https://zhihu.davidwang.space");
  for (const headers of [{}, { Origin: "https://zhihu.davidwang.space" }] as Record<string, string>[]) {
    assert.equal((await post(ping, headers)).status, 200);
  }
  for (const origin of ["null", "https://foreign.invalid", "https://zhihu.davidwang.space.evil.invalid", "http://zhihu.davidwang.space", "https://zhihu.davidwang.space/", "http://localhost:3045", "https://foreign.invalid https://zhihu.davidwang.space"]) {
    const headers = { Origin: origin, "x-forwarded-host": "foreign.invalid", "x-forwarded-proto": "https", Forwarded: "host=foreign.invalid;proto=https" };
    assert.equal((await post(ping, headers)).status, 403);
    assert.equal(handleMcpUnsupportedMethod(new Request("http://localhost:3045/mcp", { headers })).status, 403);
  }
});

test("unconfigured local Origin must match the loopback endpoint exactly; invalid config fails closed", async t => {
  environment(t, "SITE_URL", "");
  assert.equal((await post(ping, { Origin: "http://localhost:3045" })).status, 200);
  assert.equal((await post(ping, { Origin: "http://localhost:3000" })).status, 403);
  assert.equal((await post(ping, { Origin: "https://attacker.invalid" }, "https://attacker.invalid/mcp")).status, 403);
  process.env.SITE_URL = "not a URL";
  assert.equal((await post(ping, { Origin: "http://localhost:3045" })).status, 403);
  // Non-browser CLI calls still need their own authentication at tool dispatch.
  assert.equal((await post(ping)).status, 200);
});

test("GET/HEAD/DELETE do not advertise SSE or a stateful session", async () => {
  for (const method of ["GET", "HEAD", "DELETE", "OPTIONS"]) {
    const response = handleMcpUnsupportedMethod(new Request("http://localhost/mcp", { method }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
    assert.equal(await response.text(), "");
    assert.equal(response.headers.get("mcp-session-id"), null);
  }
});

test("negotiation returns the actual chosen version; subsequent unsupported headers fail", async () => {
  for (const requested of [...SUPPORTED_PROTOCOLS, "future-unsupported-version"]) {
    const response = await post({ ...ping, method: "initialize", params: { protocolVersion: requested, capabilities: {}, clientInfo: { name: "core-test", version: "1" } } });
    const negotiated = SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0];
    assert.equal((await response.json()).result.protocolVersion, negotiated);
    assert.equal(response.headers.get("mcp-protocol-version"), negotiated);
  }
  assert.equal((await post(ping)).headers.get("mcp-protocol-version"), "2025-03-26");
  for (const version of ["", "future", "2025-06-18, 2025-03-26"]) {
    assert.equal((await post(ping, { "MCP-Protocol-Version": version })).status, 400);
    assert.equal(handleMcpUnsupportedMethod(new Request("http://localhost/mcp", { headers: { "MCP-Protocol-Version": version } })).status, 400);
  }
});

test("notifications and client responses are accepted without dispatching tools or returning a JSON body", async t => {
  const oldPool = globalThis.__crier_sql;
  let accesses = 0;
  globalThis.__crier_sql = (() => { accesses++; throw new Error("Unexpected database access"); }) as unknown as NonNullable<typeof oldPool>;
  t.after(() => { globalThis.__crier_sql = oldPool; });
  environment(t, "GONGZHI_DATABASE_ENABLED", "true");
  environment(t, "DATABASE_URL", "postgres://synthetic.invalid/no_connection");
  const messages = [
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", method: "unknown/notification" },
    { jsonrpc: "2.0", method: "tools/call", params: { name: "agent_status", arguments: {} } },
    { jsonrpc: "2.0", method: "tools/call", params: { name: "create_need", arguments: { title: "must never dispatch" } } },
    { jsonrpc: "2.0", id: "server-message", result: {} },
    { jsonrpc: "2.0", id: "server-message", error: { code: -32601, message: "Unsupported" } },
  ];
  for (const message of messages) {
    const response = await post(message, { Authorization: "Bearer crier_sk_synthetic" });
    assert.equal(response.status, 202);
    assert.equal(await response.text(), "");
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(accesses, 0);
  const response = await post({ ...ping, method: "notifications/initialized" });
  assert.equal((await response.json()).error.code, -32601);
});

test("malformed JSON-RPC, invalid parameters, modern batches and incompatible Accept fail explicitly", async () => {
  for (const invalid of [null, [], {}, { ...ping, id: null }, { ...ping, id: false }, { ...ping, id: 1.5 }, { ...ping, params: [] }, { ...ping, result: {} }, { jsonrpc: "2.0", result: {} }, { jsonrpc: "2.0", id: 1, result: {}, error: { code: 1, message: "both" } }]) {
    assert.equal((await post(invalid)).status, 400);
  }
  const parseError = await handleMcpPost(new Request("http://localhost/mcp", { method: "POST", body: "{" }));
  assert.equal(parseError.status, 400);
  assert.equal((await parseError.json()).error.code, -32700);
  for (const message of [{ ...ping, method: "initialize", params: {} }, { ...ping, method: "tools/call", params: { name: "agent_status", arguments: [] } }]) {
    assert.equal((await (await post(message)).json()).error.code, -32602);
  }
  assert.equal((await post([ping], { "MCP-Protocol-Version": "2025-06-18" })).status, 400);
  assert.equal((await post([ping], { "MCP-Protocol-Version": "2025-03-26" })).status, 200);
  assert.equal((await post(ping, { Accept: "text/event-stream" })).status, 406);
  assert.equal((await post(ping, { Accept: "application/json;q=0, text/event-stream" })).status, 406);
});

test("MCP credentials are header-only, including when both a header and tool key are supplied", async () => {
  for (const headers of [{}, { Authorization: "Bearer crier_sk_header_synthetic" }] as Record<string, string>[]) {
    const response = await post({ ...ping, method: "tools/call", params: { name: "agent_status", arguments: { api_key: "crier_sk_argument_synthetic" } } }, headers);
    const body = await response.json();
    assert.equal(body.result.isError, true);
    assert.equal(body.result.structuredContent.error.code, "invalid_arguments");
    assert.ok(!JSON.stringify(body).includes("crier_sk_"));
  }
});
