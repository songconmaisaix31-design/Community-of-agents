import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createPortProbe } from "node:net";
import { resolve } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const configPath = process.env.GONGZHI_TEST_HTTP_DATABASE_ENV;

// Requires an existing production build and an explicitly supplied isolated DB.
// Auth is a local Supabase HTTP stub; all domain requests use actual Next HTTP/PG.
test("Next HTTP and real Postgres: two humans, external agent, adoption and revocation", {
  skip: configPath ? false : "Set GONGZHI_TEST_HTTP_DATABASE_ENV after npm run build",
  timeout: 120_000,
}, async (t) => {
  const configuration = Object.fromEntries((await readFile(configPath, "utf8"))
    .split(/\r?\n/).flatMap((line) => {
      const match = /^([A-Z_]+)=(.*)$/.exec(line);
      return match ? [[match[1], match[2].replace(/^"|"$/g, "")]] : [];
    }));
  assert.ok(configuration.GONGZHI_TEST_CONTAINER, "Use the explicitly isolated integration DB env file");
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(configuration.DATABASE_URL).hostname));

  const users = new Map([["http-human-a", randomUUID()], ["http-human-b", randomUUID()]]);
  const auth = createServer((req, res) => {
    const id = req.method === "GET" && req.url === "/auth/v1/user"
      ? users.get(req.headers.authorization?.replace(/^Bearer /, "")) : undefined;
    res.writeHead(id ? 200 : 401, { "content-type": "application/json" });
    res.end(JSON.stringify(id ? {
      id, aud: "authenticated", role: "authenticated", email: `${id}@example.invalid`,
      created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {},
    } : { message: "invalid token", code: "bad_jwt" }));
  });
  t.after(async () => {
    auth.closeAllConnections();
    await new Promise((done) => auth.close(done));
  });
  await new Promise((done) => auth.listen(0, "127.0.0.1", done));
  const portProbe = createPortProbe();
  await new Promise((done) => portProbe.listen(0, "127.0.0.1", done));
  const port = portProbe.address().port;
  await new Promise((done) => portProbe.close(done));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise((done) => child.once("exit", done));
    child.kill();
    await exited;
  }
  t.after(stop);
  async function start() {
    child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: process.cwd(), windowsHide: true, stdio: "ignore",
      env: {
        ...process.env, DATABASE_URL: configuration.DATABASE_URL,
        GONGZHI_DATABASE_ENABLED: "true", GONGZHI_AUTH_ENABLED: "true",
        SUPABASE_URL: `http://127.0.0.1:${auth.address().port}`,
        SUPABASE_ANON_KEY: "local-test-anon-key", GONGZHI_ASSISTANT_ENABLED: "false",
        NEXT_TELEMETRY_DISABLED: "1", CRIER_HASH_SECRET: randomUUID(),
      },
    });
    let spawnError;
    child.once("error", (error) => { spawnError = error; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError) throw spawnError;
      assert.equal(child.exitCode, null, "Owned Next test server exited before becoming ready");
      try {
        const response = await fetch(`${base}/api/gongzhi/health`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return;
      } catch { /* Wait only for our newly started local server. */ }
      await delay(300);
    }
    assert.fail("Owned Next server did not become ready within the startup limit");
  }
  await start();

  async function request(token, path, method = "GET", input, expectedStatus = 200, expectedCode) {
    const response = await fetch(`${base}/api/gongzhi${path}`, {
      method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      signal: AbortSignal.timeout(15_000),
    });
    const envelope = await response.json();
    assert.equal(response.status, expectedStatus, `${method} ${path}: ${envelope.error?.code ?? "success"}`);
    assert.equal(envelope.mode, "live");
    assert.equal(envelope.ok, expectedStatus < 400);
    if (expectedCode) assert.equal(envelope.error.code, expectedCode);
    return envelope.data;
  }
  const prefix = randomUUID();
  const humanA = await request("http-human-a", "/owners", "POST", { name: "HTTP A", kind: "human" });
  const humanB = await request("http-human-b", "/owners", "POST", { name: "HTTP B", kind: "human" });
  const agentB = await request("http-human-b", "/owners", "POST", { name: "HTTP B Agent", kind: "external_agent" });
  assert.equal(new Set([humanA.owner.id, humanB.owner.id, agentB.owner.id]).size, 3);
  assert.ok(agentB.api_key);
  const initial = { title: "HTTP 验收需求", body: `${prefix} initial`, constraints: "仅隔离测试", expected_result: "文字成果", tags: [], visibility: "public", idempotency_key: `${prefix}:need` };
  const need = await request("http-human-a", "/needs", "POST", initial);
  const path = `/needs/${need.id}`;
  assert.equal((await request(agentB.api_key, path)).need.id, need.id);
  const resultInput = { need_id: need.id, need_revision: 1, title: "外部 Agent 成果", body: `${prefix} result`, subtype: "result", sources: [], method_refs: [], idempotency_key: `${prefix}:result` };
  const oldResult = await request(agentB.api_key, "/results", "POST", resultInput);

  await t.test("B and its external Agent cannot adopt A's result", async () => {
    for (const token of ["http-human-b", agentB.api_key]) {
      await request(token, `${path}/decisions`, "POST", { result_id: oldResult.id, expected_revision: 1, decision: "accept", idempotency_key: randomUUID() }, 403, "forbidden");
    }
  });
  await t.test("A editing to revision 2 invalidates a revision 1 result", async () => {
    const edited = await request("http-human-a", path, "PATCH", { ...initial, body: `${prefix} edited`, expected_revision: 1, idempotency_key: `${prefix}:edit` });
    assert.equal(edited.revision, 2);
    await request("http-human-a", `${path}/decisions`, "POST", { result_id: oldResult.id, expected_revision: 2, decision: "accept", idempotency_key: `${prefix}:stale` }, 409, "revision_conflict");
  });
  let currentResult;
  await t.test("B submits revision 2 and A adopts exactly once", async () => {
    currentResult = await request(agentB.api_key, "/results", "POST", { ...resultInput, need_revision: 2, body: `${prefix} revised result`, idempotency_key: `${prefix}:result-v2` });
    const decision = { result_id: currentResult.id, expected_revision: 2, decision: "accept", idempotency_key: `${prefix}:accept` };
    const first = await request("http-human-a", `${path}/decisions`, "POST", decision);
    const repeated = await request("http-human-a", `${path}/decisions`, "POST", decision);
    assert.equal(first.id, repeated.id);
    const detail = await request("http-human-a", path);
    assert.equal(detail.need.accepted_result_id, currentResult.id);
    assert.equal(detail.results.length, 2);
    assert.equal(detail.decisions.length, 1);
  });
  await t.test("B revokes its external Agent; further HTTP writes are rejected", async () => {
    await request("http-human-b", `/owners/${agentB.owner.id}`, "DELETE");
    await request(agentB.api_key, "/results", "POST", { ...resultInput, need_revision: 2, idempotency_key: `${prefix}:revoked` }, 403, "revoked");
  });
  await t.test("accepted outcome and history survive an owned Next process restart", async () => {
    await stop();
    await start();
    const detail = await request("http-human-a", path);
    assert.equal(detail.need.accepted_result_id, currentResult.id);
    assert.equal(detail.results.find((item) => item.id === oldResult.id).body, resultInput.body);
    assert.equal(detail.decisions.length, 1);
  });
});
