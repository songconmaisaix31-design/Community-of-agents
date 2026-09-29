// Legacy parser/domain seam only; public MCP OAuth transport is covered in mcp-oauth-live.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { CreateNeedSchema, SubmitResultSchema, SourceSchema } from "../../lib/gongzhi/contracts.ts";
import { createApiClient, ApiClientError } from "../../lib/gongzhi/api-client.ts";
import { handleGongzhiRequest } from "../../lib/gongzhi/http.ts";
import { handleMcpProtocolPost as handleMcpPost } from "../../lib/mcp.ts";
import { createBrowserAuth } from "../../lib/gongzhi/browser-auth.ts";

test("write schemas refuse self-reported identity, mode, unknown fields and private visibility", () => {
  const need = { title: "需求", body: "实际内容", idempotency_key: "need-1" };
  assert.equal(CreateNeedSchema.parse(need).visibility, "public");
  for (const extra of [{ owner_id: "other" }, { publisher_id: "forged" }, { mode: "live" }, { visibility: "private" }]) assert.equal(CreateNeedSchema.safeParse({ ...need, ...extra }).success, false);
  assert.equal(SubmitResultSchema.safeParse({ need_id: "1", need_revision: 0, title: "x", body: "x", idempotency_key: "k" }).success, false);
  assert.equal(SourceSchema.safeParse({ id: "x", kind: "url", title: "x", retrieved_at: new Date().toISOString(), content_type: "reference", url: "javascript:alert(1)" }).success, false);
});
test("demo client omits live credentials and refuses live response", async () => {
  const client = createApiClient("demo", { accessToken: () => "must-not-leak", fetch: (async (url, init) => {
    assert.equal(url, "/demo/api/network"); assert.equal(init?.credentials, "omit");
    assert.equal((init?.headers as Record<string, string>).Authorization, undefined);
    return Response.json({ ok: true, mode: "live", data: {} });
  }) as typeof fetch });
  await assert.rejects(client.getNetwork(), (e: unknown) => e instanceof ApiClientError && e.error.code === "mode_mismatch");
});
test("live failures are surfaced without a fixture retry", async () => {
  let calls = 0;
  const client = createApiClient("live", { fetch: (async () => { calls++; throw new Error("offline"); }) as typeof fetch });
  await assert.rejects(client.getNetwork(), (e: unknown) => e instanceof ApiClientError && e.error.code === "unavailable");
  assert.equal(calls, 1);
});
test("generic demo requests cannot traverse into live API", async () => {
  let calls = 0;
  const client = createApiClient("demo", { fetch: (async () => { calls++; return Response.json({}); }) as typeof fetch });
  await assert.rejects(client.request("/../../api/gongzhi/results", "POST", {}), (e: unknown) => e instanceof ApiClientError && e.error.code === "mode_mismatch");
  assert.equal(calls, 0);
});
test("demo auth and unconfigured server rendering never initialize a Supabase session", async () => {
  const auth = createBrowserAuth("demo"); assert.equal(auth.available, false);
  assert.equal(await auth.initialize(), null); assert.equal(auth.getAccessToken(), undefined);
  await assert.rejects(auth.signIn("a@example.invalid", "unused"), (error: unknown) => error instanceof ApiClientError && error.error.code === "unavailable");
  auth.dispose();
});
test("REST and MCP both reject unauthenticated writes; native free registration is closed", async () => {
  const input = { need_id: "n", need_revision: 1, title: "x", body: "x", idempotency_key: "k" };
  const rest = await handleGongzhiRequest(new Request("http://localhost/api/gongzhi/results", { method: "POST", body: JSON.stringify(input) }), ["results"]);
  assert.equal(rest.status, 401); assert.equal((await rest.json()).error.code, "unauthenticated");
  for (const name of ["submit_result", "register_publisher"]) {
    const response = await handleMcpPost(new Request("http://localhost/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: input } }) }));
    const data = await response.json(); assert.equal(data.result.isError, true);
    assert.equal(data.result.structuredContent.error.code, name === "submit_result" ? "unauthenticated" : "forbidden");
  }
});
