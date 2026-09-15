// Legacy parser/domain seam only; public MCP OAuth transport is covered in mcp-oauth-live.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleMcpProtocolPost as handleMcpPost, handleMcpProtocolUnsupportedMethod as handleMcpUnsupportedMethod } from "../../lib/mcp.ts";

test("official SDK negotiates over a real loopback HTTP socket with JSON-only MCP and structured auth errors", { timeout: 15000 }, async t => {
  // HTTP adapter only; the request handler under test is the production handler.
  // No Auth, DB, cloud endpoint or real credential is used in this transport test.
  const requests: { method: string; protocol: string | null; status: number; rpcMethod?: string }[] = [];
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString();
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      const req = new Request(`http://127.0.0.1${incoming.url}`, { method: incoming.method, headers, ...(body ? { body } : {}) });
      const response = incoming.method === "POST" ? await handleMcpPost(req) : handleMcpUnsupportedMethod(req);
      requests.push({ method: incoming.method!, protocol: headers.get("mcp-protocol-version"), status: response.status, ...(body ? { rpcMethod: JSON.parse(body).method } : {}) });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    } catch { outgoing.writeHead(500); outgoing.end(); }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const client = new Client({ name: "gongzhi-core-interop", version: "1.0.0" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`));
  t.after(() => client.close());
  await client.connect(transport);
  assert.equal(client.getServerVersion()?.name, "gongzhi");
  assert.equal(transport.sessionId, undefined);
  const tools = await client.listTools();
  assert.ok(tools.tools.some(tool => tool.name === "agent_status"));
  assert.ok(tools.tools.some(tool => tool.name === "register_agent"));
  await client.ping();
  const status = await client.callTool({ name: "agent_status", arguments: {} });
  assert.equal(status.isError, true);
  assert.deepEqual(status.structuredContent, { error: { code: "unauthenticated" } });
  const rejected = await client.callTool({ name: "agent_status", arguments: { api_key: "synthetic-not-a-credential" } });
  assert.equal(rejected.isError, true);
  assert.equal((rejected.structuredContent as { error: { code: string } }).error.code, "invalid_arguments");
  assert.ok(requests.some(req => req.rpcMethod === "initialize" && req.status === 200));
  assert.ok(requests.some(req => req.rpcMethod === "notifications/initialized" && req.status === 202));
  assert.ok(requests.some(req => req.method === "GET" && req.status === 405));
  assert.ok(requests.filter(req => req.rpcMethod && req.rpcMethod !== "initialize").every(req => req.protocol === "2025-06-18"));
});
