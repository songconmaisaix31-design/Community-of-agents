import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { createServer as createPortProbe } from "node:net";
import { resolve } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createExternalAgent, registerExternalAgent } from "../../examples/agent/client.ts";

const configPath = process.env.GONGZHI_TEST_HTTP_DATABASE_ENV;

// Requires an existing production build and an explicitly supplied isolated DB.
// Auth is a local Supabase HTTP stub; all domain requests use actual Next HTTP/PG.
test("Next HTTP and real Postgres: two humans, external agent, adoption and revocation", {
  skip: configPath ? false : "Set GONGZHI_TEST_HTTP_DATABASE_ENV after npm run build",
  timeout: 120_000,
}, async (t) => {
  assert.equal(process.env.GONGZHI_TEST_DATABASE_ENV, undefined,
    "Run the HTTP database suite after npm test, with GONGZHI_TEST_DATABASE_ENV unset, so DB suites cannot overlap");
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
      method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      signal: AbortSignal.timeout(15_000),
    });
    const envelope = await response.json();
    assert.equal(response.status, expectedStatus, `${method} ${path}: ${envelope.error?.code ?? "success"}`);
    assert.equal(envelope.mode, "live");
    assert.equal(envelope.ok, expectedStatus < 400);
    if (expectedCode) assert.equal(envelope.error.code, expectedCode);
    if (expectedStatus >= 400) assert.equal("data" in envelope, false, "A failure must not invent a successful record");
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

  await t.test("disabled assistant returns unavailable over actual HTTP without a fabricated run", async () => {
    await request("http-human-a", "/runs", "POST", { need_id: need.id, need_revision: 1, idempotency_key: `${prefix}:disabled-assistant` }, 503, "unavailable");
  });
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
  await t.test("scoped enrollment and persisted Agent exchanges agree across SDK, REST and MCP", async () => {
    const grantInput = { scopes: ["read", "publish_need", "publish_experience", "submit_result", "discuss"], idempotency_key: `${prefix}:grant-a` };
    const grantA = await request("http-human-a", "/authorizations", "POST", grantInput);
    const grantB = await request("http-human-b", "/authorizations", "POST", { ...grantInput, idempotency_key: `${prefix}:grant-b` });
    const registration = { idempotency_key: `${prefix}:enroll-a` };
    for (const claim of [{ owner_id: humanB.owner.id }, { scopes: ["read", "discuss"] }]) {
      await request(grantA.grant_token, "/agents/register", "POST", { ...registration, ...claim }, 400, "invalid_request");
    }
    const connection = { baseUrl: base, signal: AbortSignal.timeout(60_000) };
    const enrolledA = await registerExternalAgent({ ...connection, grantToken: grantA.grant_token }, registration);
    const enrolledB = await registerExternalAgent({ ...connection, grantToken: grantB.grant_token }, { idempotency_key: `${prefix}:enroll-b` });
    assert.equal(enrolledA.human_owner_id, humanA.owner.id);
    assert.ok(enrolledA.api_key && enrolledB.api_key);
    const replay = await registerExternalAgent({ ...connection, grantToken: grantA.grant_token }, registration);
    assert.equal(replay.owner.id, enrolledA.owner.id);
    assert.equal(replay.api_key, undefined);
    assert.equal(replay.credential_state, "not_recoverable");
    const sdkA = createExternalAgent({ ...connection, apiKey: enrolledA.api_key });
    const sdkB = createExternalAgent({ ...connection, apiKey: enrolledB.api_key });
    const delegated = await sdkA.createNeed({ ...initial, body: `${prefix} delegated publication`, idempotency_key: `${prefix}:delegated` });
    assert.equal(delegated.owner_id, humanA.owner.id);
    await request(enrolledA.api_key, "/needs", "POST", { ...initial, owner_id: humanB.owner.id }, 400, "invalid_request");
    await request(enrolledA.api_key, "/authorizations", "POST", { ...grantInput, idempotency_key: `${prefix}:self-grant` }, 403, "forbidden");
    const replyInput = { thread_id: delegated.id, category: "reply", body: `${prefix} B public reply`, expected_revision: 1, idempotency_key: `${prefix}:public-reply` };
    const reply = await sdkB.postReply(replyInput);
    assert.equal((await sdkB.postReply(replyInput)).id, reply.id);
    const supplement = await sdkA.postReply({ ...replyInput, reply_to_id: reply.id, category: "supplement", body: `${prefix} A supplement`, idempotency_key: `${prefix}:public-supplement` });
    const humanReply = await request("http-human-a", "/discussions", "POST", { ...replyInput, body: `${prefix} human statement`, idempotency_key: `${prefix}:human-reply` });
    const published = await sdkA.publishExperience({ title: "HTTP 独立经验", body: `${prefix} public method`, idempotency_key: `${prefix}:public-experience` });
    const result = await sdkB.submitResult({ ...resultInput, need_id: delegated.id, body: `${prefix} scoped result`, idempotency_key: `${prefix}:scoped-result` });
    const board = await sdkA.discoverBoard({ limit: 100 });
    for (const [id, kind] of [[delegated.id, "need"], [reply.id, "reply"], [supplement.id, "supplement"], [published.id, "experience"], [result.id, "result"]]) {
      assert.equal(board.records.find(record => record.id === id)?.kind, kind);
      assert.deepEqual(await sdkA.readRecord(id), await request("", `/records/${id}`), "Anonymous webpage and SDK read the same public record");
    }
    const rootRecord = await sdkA.readRecord(delegated.id);
    assert.equal(rootRecord.speaker_id, enrolledA.owner.id);
    assert.equal(rootRecord.owner_id, humanA.owner.id);
    const graph = await sdkA.getAgentGraph();
    assert.ok(graph.nodes.every(node => ["external_agent", "platform_agent"].includes(node.kind)));
    assert.equal(new Set(graph.nodes.map(node => node.id)).size, graph.nodes.length);
    assert.ok(!graph.nodes.some(node => [humanA.owner.id, delegated.id, reply.id].includes(node.id)));
    const edge = graph.edges.find(item => item.evidence_id === reply.id);
    assert.deepEqual([edge.source, edge.target, edge.reply_to_id, edge.thread_id], [enrolledB.owner.id, enrolledA.owner.id, delegated.id, delegated.id]);
    assert.ok(graph.edges.some(item => item.evidence_id === supplement.id));
    assert.ok(!graph.edges.some(item => item.evidence_id === humanReply.id));
    // The current Next-hosted community page reads persisted records without MSW.
    // The local auth stub is only used by the preceding programmatic enrollment.
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
      const page = await context.newPage();
      const boardResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/gongzhi/board");
      await page.goto(`${base}/zh`);
      assert.equal((await boardResponse).fromServiceWorker(), false);
      assert.equal(await page.evaluate(() => navigator.serviceWorker.controller), null);
      await expect(page.locator(".cm-graph-wrap canvas")).toBeVisible();
      await expect(page.locator(".cm-agent-chips [data-agent-id]")).toHaveCount(graph.nodes.length);
      await expect(page.locator("[data-cm-graph-note]")).toContainText(`${graph.edges.length} 条公开交流依据`);
      const evidenceDirectory = resolve(tmpdir(), "gongzhi-community-I-real-pg");
      await mkdir(evidenceDirectory, { recursive: true });
      await page.locator("#agents").screenshot({ path: resolve(evidenceDirectory, "actual-agent-graph.png") });
      // Removed Hugo zoom/refresh controls are retired; actual Cosmos pointer,
      // evidence and camera behavior is covered by evomap-static browser tests.
      for (const id of [delegated.id, reply.id, supplement.id, published.id, result.id]) {
        await expect(page.locator(`.cm-record[data-record-id="${id}"]`)).toHaveCount(1);
      }
      await page.locator(`.cm-record[data-record-id="${reply.id}"]`).click();
      await expect(page.getByRole("dialog")).toContainText(reply.body);
      await page.keyboard.press("Escape");
      await page.locator(`.cm-agent-chips [data-agent-id="${enrolledA.owner.id}"]`).click();
      await expect(page.locator(`.cm-record[data-record-id="${supplement.id}"]`)).toHaveCount(1);
      await expect(page.locator(`.cm-record[data-record-id="${reply.id}"]`)).toHaveCount(0);
      await page.screenshot({ path: resolve(evidenceDirectory, "actual-public-records.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: resolve(evidenceDirectory, "actual-public-records-narrow.png"), fullPage: true });
      await page.reload();
      await expect(page.locator(".cm-graph-wrap canvas")).toBeVisible();
      await expect(page.locator(".cm-agent-chips [data-agent-id]")).toHaveCount(graph.nodes.length);
      await page.locator("#agents").screenshot({ path: resolve(evidenceDirectory, "actual-agent-graph-narrow.png") });
      t.diagnostic(`Actual Next/PG scripted graph: ${graph.nodes.length} Agents, ${graph.edges.length} evidenced edges; screenshots ${evidenceDirectory}`);
    } finally { await browser.close(); }
    const limitedGrant = await request("http-human-a", "/authorizations", "POST", { scopes: ["read"], idempotency_key: `${prefix}:limited` });
    const limited = await registerExternalAgent({ ...connection, grantToken: limitedGrant.grant_token }, { capabilities: ["publish_need", "discuss"], idempotency_key: `${prefix}:limited-enroll` });
    await request(limited.api_key, "/needs", "POST", initial, 403, "forbidden");
    const rpc = await fetch(`${base}/mcp`, { method: "POST", headers: { authorization: `Bearer ${limited.api_key}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_need", arguments: initial } }) });
    assert.equal(rpc.status, 200);
    const denied = (await rpc.json()).result;
    assert.equal(denied.isError, true);
    assert.equal(denied.structuredContent.error.code, "forbidden");
    const rpcRead = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "read_record", arguments: { id: reply.id } } }) });
    assert.deepEqual((await rpcRead.json()).result.structuredContent.data, await sdkA.readRecord(reply.id));
    await request("http-human-a", `/authorizations/${grantA.authorization.id}`, "DELETE");
    await request(enrolledA.api_key, "/discussions", "POST", { ...replyInput, idempotency_key: `${prefix}:after-grant-revoke` }, 403, "revoked");
    await request(grantA.grant_token, "/agents/register", "POST", registration, 403, "revoked");
    assert.equal((await request("", `/records/${supplement.id}`)).body, supplement.body);
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
