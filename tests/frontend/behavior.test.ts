import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupServer } from "msw/node";
import { handlers } from "../../mocks/handlers.ts";
import { resetState } from "../../mocks/state.ts";
import { createApiClient, ApiClientError } from "../../lib/gongzhi/api-client.ts";
const server = setupServer(...handlers);
const api = createApiClient("demo", { fetch: (input, options) => fetch(new URL(String(input), "http://localhost"), options) });
before(() => { Object.defineProperty(globalThis, "location", { value: new URL("http://localhost/demo/space"), configurable: true }); server.listen({ onUnhandledRequest: "error" }); });
beforeEach(() => resetState());
after(() => { server.close(); Reflect.deleteProperty(globalThis, "location"); });
const input = { title: "独立的新需求", body: "不同于固定故事的新条件", constraints: "公开资料", expected_result: "一份文字", tags: ["活动"], visibility: "public" as const, idempotency_key: "create-one" };
test("公告与Agent图复用稳定记录，只有公开Agent回复形成边且去重", async () => {
  const board = await api.discoverBoard(), graph = await api.getAgentGraph();
  assert.equal(graph.nodes.length, 2); assert.equal(new Set(graph.nodes.map(n => n.id)).size, 2);
  assert.ok(graph.nodes.every(n => n.kind === "external_agent" || n.kind === "platform_agent"));
  for (const edge of graph.edges) { const source = await api.readRecord(edge.evidence_id), target = await api.readRecord(edge.reply_to_id); assert.equal(source.reply_to_id, target.id); assert.equal(source.speaker_id, edge.source); assert.equal(target.speaker_id, edge.target); assert.equal(source.thread_id, target.thread_id); assert.ok(board.records.some(r => r.id === source.id)); }
  assert.equal(graph.edges.length, 1);
  await api.postReply({ thread_id: "story-a", body: "人类回复不创造Agent节点或Agent间关系", category: "reply", expected_revision: 1, idempotency_key: "human-reply" });
  assert.deepEqual(await api.getAgentGraph(), graph);
});
test("讨论幂等、跨线程、旧需求版本和关闭约束都由MSW HTTP执行", async () => {
  const reply = { thread_id: "story-a", reply_to_id: "demo-discussion-b", body: "公开补充", category: "supplement" as const, expected_revision: 1, idempotency_key: "supplement-one" };
  const created = await api.postReply(reply); assert.deepEqual(await api.postReply(reply), created);
  await assert.rejects(api.postReply({ ...reply, body: "异文" }), (e: unknown) => e instanceof ApiClientError && e.error.code === "idempotency_conflict");
  await assert.rejects(api.postReply({ ...reply, reply_to_id: "story-b", idempotency_key: "cross-thread" }), (e: unknown) => e instanceof ApiClientError && e.error.code === "invalid_request");
  await api.updateNeed("story-a", { ...input, expected_revision: 1, idempotency_key: "revise-thread" });
  await assert.rejects(api.postReply({ ...reply, idempotency_key: "old-reply" }), (e: unknown) => e instanceof ApiClientError && e.error.code === "revision_conflict");
  await api.closeNeed("story-a", { expected_revision: 2, idempotency_key: "close-thread" });
  await assert.rejects(api.postReply({ ...reply, expected_revision: 2, idempotency_key: "closed-reply" }), (e: unknown) => e instanceof ApiClientError && e.error.code === "immutable");
});
test("示例授权登记不返回凭据、重复登记不增点，撤销保留历史归属", async () => {
  const grant = await api.createAuthorization({ scopes: ["read", "discuss"], expires_in_seconds: 3600, idempotency_key: "grant-one" });
  assert.equal(grant.grant_token, undefined); assert.equal(grant.credential_state, "not_recoverable");
  const registered = await api.registerAgent({ name: "我的 Agent · 示例", capabilities: ["描述不是权限"], idempotency_key: `grant:${grant.authorization.id}` });
  assert.equal(registered.api_key, undefined); assert.deepEqual(registered.scopes, ["read", "discuss"]);
  assert.deepEqual(await api.registerAgent({ name: "我的 Agent · 示例", capabilities: ["描述不是权限"], idempotency_key: `grant:${grant.authorization.id}` }), registered);
  assert.equal((await api.getAgentGraph()).nodes.length, 3); const revoked = await api.revokeAuthorization(grant.authorization.id); assert.ok(revoked.revoked_at);
  assert.ok((await api.getNetwork()).owners.find(o => o.id === registered.owner.id)?.revoked_at);
  assert.equal((await api.getAgentGraph()).nodes.length, 3);
});
test("HTTP 创建、修改、重放返回原创建快照且不新增，冲突不静默覆盖", async () => {
  const created = await api.createNeed(input);
  const changed = await api.updateNeed(created.id, { ...input, title: "更新后的标题", expected_revision: 1, idempotency_key: "edit-one" });
  assert.equal(changed.revision, 2);
  assert.deepEqual(await api.createNeed(input), created);
  await assert.rejects(api.createNeed({ ...input, title: "同一个 key 的另一个内容" }), (error: unknown) => error instanceof ApiClientError && error.error.code === "idempotency_conflict");
  const n = await api.getNetwork(); assert.equal(n.needs.length, 4); assert.equal(n.results.length, 0);
});
test("旧需求版本产物不可采纳，新内容不会触发预写帮助", async () => {
  const result = await api.request<{ id: string }>("/stories/F-A", "POST", {});
  const original = (await api.readNeed("story-a")).need;
  await api.updateNeed("story-a", { ...input, title: original.title, expected_revision: 1, idempotency_key: "edit-a" });
  await assert.rejects(api.decideResult("story-a", { result_id: result.id, expected_revision: 2, decision: "accept", note: "", idempotency_key: "accept-old" }), (e: unknown) => e instanceof ApiClientError && e.error.code === "revision_conflict");
  await assert.rejects(api.request("/stories/F-A", "POST", {}), (e: unknown) => e instanceof ApiClientError && e.error.code === "revision_conflict");
  await api.createNeed(input); assert.equal((await api.getNetwork()).results.length, 1);
});
test("F-B 保持待回应并可撤回，F-C 引用精确版本，关系均有可定位依据", async () => {
  assert.equal((await api.readNeed("story-b")).results.length, 0);
  await api.closeNeed("story-b", { expected_revision: 1, idempotency_key: "close-b" });
  assert.equal((await api.readNeed("story-b")).need.status, "closed");
  await api.request("/stories/F-C", "POST", {});
  const n = await api.getNetwork(), r = n.results[0];
  assert.equal(r.method_refs[0].revision, 1); assert.equal((await api.readExperience(r.method_refs[0].experience_id)).revision, 1);
  const records = new Set([...n.owners, ...n.needs, ...n.experiences, ...n.results, ...n.decisions].map(x => x.id));
  for (const edge of n.graph.edges) { assert.ok(records.has(edge.source)); assert.ok(records.has(edge.target)); assert.ok(records.has(edge.evidence_id)); }
});
test("示例密钥不伪造，撤销保留历史，未知 API 与真实路径 fail closed", async () => {
  const bound = await api.bindOwner({ name: "测试示例", kind: "external_agent", capabilities: ["整理"] }); assert.equal(bound.api_key, undefined);
  await api.revokeOwner(bound.owner.id); assert.ok((await api.listOwners()).find(x => x.id === bound.owner.id)?.revoked_at);
  await assert.rejects(api.request("/not-implemented", "POST", {}), (e: unknown) => e instanceof ApiClientError && e.error.code === "unavailable");
  const response = await fetch("http://localhost/api/gongzhi/needs", { method: "POST", body: JSON.stringify(input) }); assert.equal(response.status, 409);
});
test("经验独立发布，拒绝不安全来源和非 public，失败不写记录", async () => {
  const e = await api.publishExperience({ title: "独立的方法", body: "步骤一", applicability: "小团队", tags: [], sources: [], visibility: "public", idempotency_key: "experience-one" }); assert.equal(e.revision, 1); assert.deepEqual(e.sources, []);
  const invalid = await fetch("http://localhost/demo/api/experiences", { method: "POST", body: JSON.stringify({ title: "恶意链接", body: "不能执行", sources: [{ id: "x", kind: "url", title: "x", retrieved_at: "2026-09-13T00:00:00.000Z", content_type: "reference", url: "javascript:alert(1)" }], idempotency_key: "unsafe" }) }); assert.equal(invalid.status, 400);
  const privateNeed = await fetch("http://localhost/demo/api/needs", { method: "POST", body: JSON.stringify({ ...input, visibility: "private" }) }); assert.equal(privateNeed.status, 400); assert.equal((await api.getNetwork()).experiences.length, 2);
});
