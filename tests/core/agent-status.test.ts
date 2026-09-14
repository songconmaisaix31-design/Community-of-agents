import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { handleGongzhiRequest } from "../../lib/gongzhi/http.ts";
import { handleMcpPost } from "../../lib/mcp.ts";
import { sha256 } from "../../lib/ids.ts";
import { DbTimeoutError } from "../../lib/db-timeout.ts";
import type { OwnerRow } from "../../lib/gongzhi/identity.ts";

const syntheticKey = "crier_sk_unit_test_not_a_credential";
// Synthetic row storage exercises service guards without contacting any database
// or Auth service. This file does not establish live identity acceptance.
function statusStore(t: TestContext) {
  const oldPool = globalThis.__crier_sql;
  const oldEnabled = process.env.GONGZHI_DATABASE_ENABLED;
  const oldUrl = process.env.DATABASE_URL;
  process.env.GONGZHI_DATABASE_ENABLED = "true";
  process.env.DATABASE_URL = "postgres://synthetic.invalid/no_connection";
  const state = {
    row: { id: "agent-owner", user_id: "private-auth-user", publisher_id: "agent-publisher", kind: "external_agent", capabilities: ["review"], scopes: ["discuss"], revoked_at: null, created_at: new Date("2026-09-14T00:00:00Z"), credential_version: 1, name: "Synthetic status test Agent", last_seen_at: null, status: "active" } as OwnerRow,
    humanOwner: "human-owner", secondRow: null as Partial<OwnerRow> | null,
    queries: 0, fail: null as Error | null,
  };
  globalThis.__crier_sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    state.queries++;
    if (state.fail) throw state.fail;
    const query = strings.join("?");
    assert.match(query, /^select /);
    if (query.includes("p.api_key_hash=")) return values[0] === sha256(syntheticKey) && state.row.kind === "external_agent" ? [{ ...state.row }] : [];
    if (query.includes("where o.id=")) return values[0] === state.row.id ? [{ ...state.row, ...state.secondRow }] : [];
    if (query.includes("o.kind='human'") && query.includes("o.revoked_at is null")) return values[0] === state.row.user_id && state.humanOwner ? [{ id: state.humanOwner }] : [];
    throw new Error("Unexpected SQL in isolated status guard test");
  }) as unknown as NonNullable<typeof oldPool>;
  t.after(() => {
    globalThis.__crier_sql = oldPool;
    if (oldEnabled === undefined) delete process.env.GONGZHI_DATABASE_ENABLED; else process.env.GONGZHI_DATABASE_ENABLED = oldEnabled;
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
  });
  return state;
}
function rest(token = syntheticKey, path = ["agents", "me"]) {
  return handleGongzhiRequest(new Request(`http://localhost/api/gongzhi/${path.join("/")}`, { headers: { Authorization: `Bearer ${token}` } }), path);
}
async function mcp(token = syntheticKey, name = "agent_status", args: Record<string, unknown> = {}) {
  const response = await handleMcpPost(new Request("http://localhost/mcp", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "MCP-Protocol-Version": "2025-06-18" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }));
  return (await response.json()).result;
}

test("status returns actual speaker, human owner and scopes through identical REST/MCP authorization", async t => {
  const state = statusStore(t);
  const response = await rest();
  assert.equal(response.status, 200);
  const envelope = await response.json();
  assert.equal(envelope.data.owner.id, "agent-owner");
  assert.equal(envelope.data.owner.kind, "external_agent");
  assert.equal(envelope.data.human_owner_id, "human-owner");
  assert.deepEqual(envelope.data.scopes, ["discuss"]);
  assert.equal(envelope.data.mode, "live");
  assert.deepEqual((await mcp()).structuredContent, envelope);
  for (const privateField of [syntheticKey, "private-auth-user", "api_key", "credential_version", "user_id"]) assert.ok(!JSON.stringify(envelope).includes(privateField));
  // Self-introspection is permitted without read; content access is still denied.
  assert.equal((await rest(syntheticKey, ["needs"])).status, 403);
  assert.equal((await mcp(syntheticKey, "read_need", { id: "some-need" })).structuredContent.error.code, "forbidden");
  const before = state.queries;
  assert.equal((await mcp(syntheticKey, "agent_status", { owner_id: "other-human", scopes: ["read"] })).isError, true);
  assert.equal(state.queries, before);
});

test("invalid, revoked, inactive, changed and unbound Agent identities fail identically", async t => {
  const state = statusStore(t);
  const check = async (code: string, token = syntheticKey) => {
    const response = await rest(token);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, code);
    const tool = await mcp(token);
    assert.equal(tool.isError, true);
    assert.equal(tool.structuredContent.error.code, code);
  };
  await check("unbound_identity", "crier_sk_unknown_synthetic");
  state.row.revoked_at = new Date(); await check("revoked"); state.row.revoked_at = null;
  state.row.status = "suspended"; await check("revoked"); state.row.status = "active";
  for (const changed of [{ credential_version: 2 }, { revoked_at: new Date() }, { user_id: "different-private-auth-user" }]) {
    state.secondRow = changed; await check("revoked");
  }
  state.secondRow = null;
  state.humanOwner = ""; await check("unbound_identity");
  state.humanOwner = "human-owner";
  state.row.kind = "platform_agent"; await check("unbound_identity");
});

test("grant and human tokens cannot reach status storage or substitute for enrolled Agent keys", async t => {
  const state = statusStore(t);
  for (const token of ["human-session-synthetic", "gongzhi_grant_synthetic", "CRIER_SK_invalid_case", "invalid"]) {
    assert.equal((await rest(token)).status, 401);
    assert.equal((await mcp(token)).structuredContent.error.code, "unauthenticated");
  }
  assert.equal(state.queries, 0);
});

test("missing config and storage failures remain unavailable or unknown, never a successful status", async t => {
  const state = statusStore(t);
  process.env.GONGZHI_DATABASE_ENABLED = "false";
  assert.equal((await rest()).status, 503);
  assert.equal((await mcp()).structuredContent.error.code, "unavailable");
  assert.equal(state.queries, 0);
  process.env.GONGZHI_DATABASE_ENABLED = "true";
  state.fail = new DbTimeoutError(8000, "synthetic status timeout");
  assert.equal((await rest()).status, 503);
  const result = await mcp();
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error.code, "timeout");
});
