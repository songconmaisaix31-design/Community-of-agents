import { http, HttpResponse, delay } from "msw";
import { BindOwnerSchema, CloseNeedSchema, CreateNeedSchema, UpdateNeedSchema, PublishExperienceSchema, DecideResultSchema, type ApiError, type Need, type Experience, type Owner, type Decision, type ErrorCode } from "../lib/gongzhi/contracts";
import { DEMO_HUMAN, storyResult } from "./fixtures";
import { getState, projectNetwork, resetState, saveState } from "./state";
import { z } from "zod";

const ok = (data: unknown) => HttpResponse.json({ ok: true, data, mode: "demo" });
const fail = (code: ErrorCode, message: string, status = 400) => HttpResponse.json({ ok: false, error: { code, message, retryable: false } satisfies ApiError, mode: "demo" }, { status });
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
function mutation<T>(namespace: string, key: string, input: unknown, action: () => T | Response) {
  const s = getState(), receiptKey = `${namespace}:${key}`, fingerprint = JSON.stringify(input), previous = s.receipts[receiptKey];
  if (previous) return previous.fingerprint === fingerprint ? ok(previous.value) : fail("idempotency_conflict", "同一次提交的内容发生变化，请重新发起操作。", 409);
  const value = action(); if (value instanceof Response) return value;
  s.receipts[receiptKey] = { fingerprint, value: structuredClone(value) }; saveState(); return ok(value);
}
function jsonRoute<S extends z.ZodType>(schema: S, action: (input: z.output<S>, params: Record<string, string | readonly string[] | undefined>) => Response) {
  return async ({ request, params }: { request: Request; params: Record<string, string | readonly string[] | undefined> }) => { await delay(100); try { const input = schema.safeParse(await request.json()); return input.success ? action(input.data, params) : fail("invalid_request", "请检查表单内容与公开确认。", 400); } catch { return fail("invalid_request", "无法读取提交内容。", 400); } };
}
export const handlers = [
  http.get("/demo/api/network", () => ok(projectNetwork())),
  http.get("/demo/api/owners", () => ok(getState().network.owners.filter(x => x.id === DEMO_HUMAN || x.id.startsWith("bound-")))),
  http.post("/demo/api/owners", jsonRoute(BindOwnerSchema, input => {
    const n = getState().network;
    if (input.kind === "human") return ok({ owner: n.owners.find(x => x.id === DEMO_HUMAN) });
    const owner: Owner = { id: `bound-${id()}`, publisher_id: `demo-p-${id()}`, ...input, revoked_at: null, last_seen_at: null, created_at: now(), mode: "demo" }; n.owners.push(owner); saveState(); return ok({ owner });
  })),
  http.delete("/demo/api/owners/:id", ({ params }) => { const owner = getState().network.owners.find(x => x.id === params.id && x.id.startsWith("bound-")); if (!owner) return fail("forbidden", "只能撤销你接入的示例 Agent。", 403); owner.revoked_at = now(); saveState(); return ok(owner); }),
  http.get("/demo/api/needs/:id", ({ params }) => { const n = getState().network, need = n.needs.find(x => x.id === params.id); return need ? ok({ need, results: n.results.filter(x => x.need_id === need.id), decisions: n.decisions.filter(x => x.need_id === need.id) }) : fail("not_found", "找不到这个需求。", 404); }),
  http.post("/demo/api/needs", jsonRoute(CreateNeedSchema, input => mutation("need", input.idempotency_key, input, () => { const { idempotency_key: _, ...fields } = input; const need: Need = { ...fields, id: id(), owner_id: DEMO_HUMAN, publisher_id: "demo-p-human", revision: 1, status: "open", accepted_result_id: null, created_at: now(), updated_at: now(), expires_at: "2026-12-31T16:00:00.000Z", mode: "demo" }; getState().network.needs.unshift(need); return need; }))),
  http.patch("/demo/api/needs/:id", jsonRoute(UpdateNeedSchema, (input, params) => mutation(`edit-${params.id}`, input.idempotency_key, input, () => {
    const n = getState().network.needs.find(x => x.id === params.id); if (!n) return fail("not_found", "需求不存在。", 404); if (n.owner_id !== DEMO_HUMAN) return fail("forbidden", "只有发起人可以修改。", 403); if (n.revision !== input.expected_revision) return fail("revision_conflict", "需求已有更新，请重新打开后修改。", 409); if (n.status === "closed" || n.status === "accepted") return fail("immutable", "这个需求已结束，不能修改。", 409);
    const { idempotency_key: _, expected_revision: __, ...fields } = input; Object.assign(n, fields, { revision: n.revision + 1, status: "open", accepted_result_id: null, updated_at: now() }); return n;
  }))),
  http.post("/demo/api/needs/:id/close", jsonRoute(CloseNeedSchema, (input, params) => mutation(`close-${params.id}`, input.idempotency_key, input, () => { const n = getState().network.needs.find(x => x.id === params.id); if (!n) return fail("not_found", "需求不存在。", 404); if (n.owner_id !== DEMO_HUMAN) return fail("forbidden", "只有发起人可以撤回。", 403); if (n.revision !== input.expected_revision) return fail("revision_conflict", "需求已有更新，请刷新。", 409); if (n.status === "accepted") return fail("immutable", "已采纳的需求不能撤回。", 409); n.status = "closed"; n.updated_at = now(); return n; }))),
  http.get("/demo/api/experiences", ({ request }) => { const q = new URL(request.url).searchParams.get("q") || ""; return ok(getState().network.experiences.filter(x => `${x.title} ${x.body}`.includes(q))); }),
  http.get("/demo/api/experiences/:id", ({ params }) => { const x = getState().network.experiences.find(x => x.id === params.id); return x ? ok(x) : fail("not_found", "找不到这个经验版本。", 404); }),
  http.post("/demo/api/experiences", jsonRoute(PublishExperienceSchema, input => mutation("experience", input.idempotency_key, input, () => { const n = getState().network, prior = n.experiences.find(x => x.id === input.previous_version_id); if (input.previous_version_id && !prior) return fail("not_found", "原版本不存在。", 404); if (prior && prior.owner_id !== DEMO_HUMAN) return fail("forbidden", "只能发布自己经验的新版本。", 403); const { idempotency_key: _, ...fields } = input; const e: Experience = { ...fields, id: id(), owner_id: DEMO_HUMAN, publisher_id: "demo-p-human", previous_version_id: prior?.id ?? null, revision: prior ? prior.revision + 1 : 1, created_at: now(), mode: "demo" }; n.experiences.unshift(e); return e; }))),
  http.post("/demo/api/needs/:id/decisions", jsonRoute(DecideResultSchema, (input, params) => mutation(`decision-${params.id}`, input.idempotency_key, input, () => { const n = getState().network, need = n.needs.find(x => x.id === params.id), result = n.results.find(x => x.id === input.result_id); if (!need || !result || result.need_id !== need.id) return fail("not_found", "找不到对应结果。", 404); if (need.owner_id !== DEMO_HUMAN) return fail("forbidden", "只有需求发起人可以作决定。", 403); if (need.revision !== input.expected_revision || need.revision !== result.need_revision) return fail("revision_conflict", "结果属于旧版需求，不能用于当前版本。", 409); if (need.status === "closed" || need.status === "accepted") return fail("immutable", "这个需求已结束。", 409); const decision: Decision = { id: id(), need_id: need.id, need_revision: need.revision, result_id: result.id, decision: input.decision, note: input.note, owner_id: DEMO_HUMAN, created_at: now(), mode: "demo" }; n.decisions.push(decision); need.status = input.decision === "accept" ? "accepted" : "needs_revision"; need.accepted_result_id = input.decision === "accept" ? result.id : null; need.updated_at = now(); return decision; }))),
  http.post("/demo/api/stories/:id", ({ params }) => { const story = storyResult(String(params.id)); if (!story) return fail("not_found", "这个故事没有预设帮助。", 404); const n = getState().network, need = n.needs.find(x => x.id === story.need_id); if (!need || need.revision !== 1 || need.status === "closed") return fail("revision_conflict", "原示例需求已修改或撤回。重置示例后可看原故事。", 409); const previous = n.results.find(x => x.need_id === story.need_id); if (previous) return ok(previous); const result = { ...story, id: `result-${params.id}`, created_at: now() }; n.results.push(result); need.status = "helping"; saveState(); return ok(result); }),
  http.post("/demo/api/reset", () => { resetState(); return ok(projectNetwork()); }),
  http.all("/demo/api/*", () => fail("unavailable", "这个示例操作尚未开放，没有发送真实请求。", 503)),
  // A controlled demo page must never write to a real API, even by accident.
  http.all("/api/gongzhi/*", () => fail("mode_mismatch", "示例空间不能请求真实接口。", 409)),
];
