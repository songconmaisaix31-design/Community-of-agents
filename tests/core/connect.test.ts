import test from "node:test";
import assert from "node:assert/strict";
import { handleGongzhiRequest } from "../../lib/gongzhi/http.ts";
import { createApiClient } from "../../lib/gongzhi/api-client.ts";
import { readConnectInfo } from "../../lib/gongzhi/connect.ts";

test("public discovery is relative, credential-free and not an authenticated Agent assertion", async () => {
  const req = new Request("https://attacker.invalid/api/gongzhi/connect", { headers: { Authorization: "Bearer invalid", "x-forwarded-host": "attacker.invalid" } });
  const res = await handleGongzhiRequest(req, ["connect"]);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.deepEqual(body.data, readConnectInfo());
  assert.equal(body.data.authentication.anonymous_public_reads, true);
  assert.ok(Object.values(body.data.endpoints).every(value => typeof value === "string" && value.startsWith("/") && !value.startsWith("//")));
  assert.ok(!JSON.stringify(body).includes("attacker"));
});

test("Agent status refuses absent, human, grant and legacy x-api-key inputs before any database access", async () => {
  const credentials: Record<string, string>[] = [{}, { Authorization: "Bearer human-session" }, { Authorization: "Bearer gongzhi_grant_synthetic" }, { "x-api-key": "crier_sk_synthetic" }];
  for (const headers of credentials) {
    const response = await handleGongzhiRequest(new Request("http://localhost/api/gongzhi/agents/me", { headers }), ["agents", "me"]);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "unauthenticated");
  }
});

test("shared client names consume the canonical discovery and status endpoints", async () => {
  const calls: string[] = [];
  const client = createApiClient("live", { fetch: async (url) => { calls.push(String(url)); return Response.json({ ok: true, mode: "live", data: {} }); } });
  await client.readConnect(); await client.agentStatus();
  assert.deepEqual(calls, ["/api/gongzhi/connect", "/api/gongzhi/agents/me"]);
});
