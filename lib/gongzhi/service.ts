import { randomUUID } from "node:crypto";
import { inTransaction, sql } from "../db";
import { rateLimit } from "../http";
import { sha256 } from "../ids";
import { inboxFor, clampLimit, type InboxItem } from "../inbox";
import { createPost, getPostRow, PostInputSchema, publicPost, repliesFor, updatePost, type PostRow, type PublicPost } from "../posts";
import { search } from "../search";
import { assertWritable } from "../limits";
import { CloseNeedSchema, CreateNeedSchema, PostReplySchema, DecideResultSchema, PublishExperienceSchema, SubmitResultSchema, UpdateNeedSchema, ExperienceSearchSchema, ReadExperienceVersionSchema, PostExperienceFeedbackSchema, type ExperienceSearchPage, type ExperienceVersion, type ExperienceFeedback, type Decision, type Experience, type Graph, type Need, type NeedDetail, type Network, type Owner, type Result, type Source, type MethodReference, type AgentScope } from "./contracts";
import { withContentApproval } from "./content-approval";
import { assertIdentity, humanOwnerId, resolveIdentity, toOwner, type Identity } from "./identity";
import { getAgentGraph, readRecord } from "./bulletin";
import { assertDatabaseConfigured, GongzhiError } from "./errors";
export { resolveIdentity };
export type { Identity };

type Metadata = { speaker_id?: string; thread_id?: string; reply_to_id?: string; subtype: string; owner_id: string; owner_kind: Owner["kind"]; mode: "live"; visibility?: string; revision: number; need_revision?: number; constraints?: string; expected_result?: string; applicability?: string; previous_version_id?: string; sources?: Source[]; method_refs?: MethodReference[]; fingerprint?: string; decision?: Decision["decision"]; result_id?: string; run_id?: string; experience_feedback?: Pick<ExperienceFeedback, "experience_id" | "revision" | "usage" | "outcome"> };
type NeedRow = { revision: number; status: Need["status"]; accepted_result_id: string | null; updated_at: Date };
export function gongzhiMetadata(post: Pick<PublicPost, "metadata">): Metadata { return post.metadata.gongzhi as Metadata; }
function stopped(signal?: AbortSignal) { if (signal?.aborted) throw new GongzhiError(409, "cancelled", "操作已取消。"); }
async function metadata(actor: Identity, subtype: string, extra: Partial<Metadata> = {}): Promise<Metadata> {
  return { subtype, owner_id: await humanOwnerId(actor), speaker_id: actor.owner.id, owner_kind: actor.owner.kind, mode: "live", revision: 1, ...extra };
}
function toNeed(post: PublicPost, row: NeedRow): Need {
  const m = gongzhiMetadata(post);
  return { id: post.id, owner_id: m.owner_id, publisher_id: post.publisher.id, title: post.title, body: post.body, constraints: m.constraints ?? "", expected_result: m.expected_result ?? "", tags: post.tags, visibility: "public", revision: row.revision, status: row.status, accepted_result_id: row.accepted_result_id, expires_at: post.expires_at, created_at: post.created_at, updated_at: row.updated_at.toISOString(), mode: "live" };
}
export function toResult(post: PublicPost): Result {
  const m = gongzhiMetadata(post);
  return { id: post.id, need_id: post.parent_id!, need_revision: m.need_revision!, owner_id: m.owner_id, publisher_id: post.publisher.id, title: post.title, body: post.body, subtype: m.subtype as "help" | "result", sources: m.sources ?? [], method_refs: m.method_refs ?? [], created_at: post.created_at, mode: "live" };
}
function toExperience(post: PublicPost): Experience {
  const m = gongzhiMetadata(post);
  return { id: post.id, owner_id: m.owner_id, publisher_id: post.publisher.id, title: post.title, body: post.body, applicability: m.applicability ?? "", tags: post.tags, revision: m.revision, previous_version_id: m.previous_version_id ?? null, sources: m.sources ?? [], visibility: "public", created_at: post.created_at, mode: "live" };
}
function toDecision(post: PublicPost): Decision {
  const m = gongzhiMetadata(post);
  return { id: post.id, need_id: post.parent_id!, need_revision: m.need_revision!, result_id: m.result_id!, decision: m.decision!, note: post.body, owner_id: m.owner_id, created_at: post.created_at, mode: "live" };
}
function fingerprint(action: string, input: unknown) { return sha256(JSON.stringify({ action, input })); }
async function previous(actor: Identity, key: string, expected: string): Promise<PublicPost | null> {
  const row = await getPostRow(null, { publisherId: actor.owner.publisher_id, idempotencyKey: key });
  if (!row) return null;
  const post = publicPost(row);
  if (gongzhiMetadata(post)?.fingerprint !== expected) throw new GongzhiError(409, "idempotency_conflict", "同一幂等键已用于不同请求。");
  return post;
}
async function visiblePost(id: string): Promise<PublicPost> {
  const row = await getPostRow(id);
  if (!row || row.deleted_at || row.hidden_at || !row.metadata.gongzhi || gongzhiMetadata(row).mode !== "live" || (row.metadata.gongzhi as { visibility?: string }).visibility && (row.metadata.gongzhi as { visibility?: string }).visibility !== "public") throw new GongzhiError(404, "not_found", "没有找到这条公告。");
  return publicPost(row);
}
export async function currentNeed(id: string, lock = false): Promise<Need> {
  const [row] = lock
    ? await sql()<NeedRow[]>`select * from gongzhi_needs where post_id=${id} for update`
    : await sql()<NeedRow[]>`select * from gongzhi_needs where post_id=${id}`;
  if (!row) throw new GongzhiError(404, "not_found", "没有找到这个需求。");
  return toNeed(await visiblePost(id), row);
}
export function assertRevision(need: Need, revision: number) {
  if (need.revision !== revision) throw new GongzhiError(409, "revision_conflict", "需求已更新，请读取当前版本后重试。", { expected_revision: revision, current_revision: need.revision });
}
function assertNeedOwner(actor: Identity, need: Need) {
  if (actor.owner.kind !== "human" || need.owner_id !== actor.owner.id) throw new GongzhiError(403, "forbidden", "只有发布需求的人可以修改或决定采纳。");
}
async function writePublisher(actor: Identity, scope?: AgentScope) {
  assertWritable();
  const publisher = await assertIdentity(actor, true, scope);
  await rateLimit(`gongzhi:write:${actor.owner.id}`, 60, 3600, "writes");
  return publisher;
}
export async function readNeed(actor: Identity, id: string, signal?: AbortSignal): Promise<NeedDetail> {
  stopped(signal); await assertIdentity(actor, false, "read");
  const value = await readPublicNeed(id); stopped(signal); return value;
}
export async function readPublicNeed(id: string): Promise<NeedDetail> {
  assertDatabaseConfigured();
  const need = await currentNeed(id);
  const replies = (await repliesFor(id, 100)).posts;
  return { need, results: replies.filter((p) => ["help", "result"].includes(gongzhiMetadata(p)?.subtype)).map(toResult), decisions: replies.filter((p) => gongzhiMetadata(p)?.subtype === "decision").map(toDecision) };
}
export async function createNeed(actor: Identity, raw: unknown): Promise<Need> {
  const input = CreateNeedSchema.parse(raw);
  return inTransaction(async () => {
    const publisher = await writePublisher(actor, "publish_need");
    const fp = fingerprint("create_need", input);
    const existing = await previous(actor, input.idempotency_key, fp);
    if (existing) return currentNeed(existing.id);
    const { post } = await createPost(publisher, PostInputSchema.parse({ ...input, kind: "request", expires_at: new Date(Date.now() + 365 * 86400000).toISOString(), metadata: { gongzhi: await metadata(actor, "need", { constraints: input.constraints, expected_result: input.expected_result, fingerprint: fp }) } }));
    await sql()`insert into gongzhi_needs(post_id) values(${post.id})`;
    return currentNeed(post.id);
  });
}
export async function updateNeed(actor: Identity, id: string, raw: unknown): Promise<Need> {
  const input = UpdateNeedSchema.parse(raw);
  return inTransaction(async () => {
    const publisher = await writePublisher(actor);
    const fp = fingerprint(`update_need:${id}`, input);
    const existing = await previous(actor, input.idempotency_key, fp);
    if (existing) return currentNeed(id);
    const need = await currentNeed(id, true); assertNeedOwner(actor, need); assertRevision(need, input.expected_revision);
    // Immutable snapshot of the previous revision, including its original text.
    await createPost(publisher, PostInputSchema.parse({ kind: "announcement", parent_id: id, title: need.title, body: need.body, tags: [], idempotency_key: input.idempotency_key, metadata: { gongzhi: await metadata(actor, "need_revision", { revision: need.revision, constraints: need.constraints, expected_result: need.expected_result, fingerprint: fp }) } }));
    const [originalPublisher] = await sql()<import("../publishers").PublisherRow[]>`select * from publishers where id=${need.publisher_id}`;
    const originalMetadata = gongzhiMetadata(await visiblePost(id));
    await updatePost(originalPublisher, id, { title: input.title, body: input.body, tags: input.tags, metadata: { gongzhi: { ...originalMetadata, revision: need.revision + 1, constraints: input.constraints, expected_result: input.expected_result } } });
    await sql()`update gongzhi_needs set revision=revision+1,status='open',accepted_result_id=null,updated_at=now() where post_id=${id}`;
    return currentNeed(id);
  });
}
export async function readExperience(id: string): Promise<Experience> {
  assertDatabaseConfigured(); const post = await visiblePost(id);
  if (gongzhiMetadata(post).subtype !== "experience") throw new GongzhiError(404, "not_found", "没有找到这个经验版本。");
  return toExperience(post);
}
export async function searchExperience(raw: unknown): Promise<ExperienceSearchPage> {
  const query = ExperienceSearchSchema.parse(raw);
  const found = await findPublicExperience(query.q);
  const items: ExperienceSearchPage["items"] = [];
  for (const item of found) {
    let record;
    try { record = await readRecord(item.id); }
    catch (error) { if (error instanceof GongzhiError && error.code === "not_found") continue; throw error; }
    items.push({ id: item.id, revision: item.revision, title: item.title, summary: item.body.slice(0, 280), applicability: item.applicability,
      tags: item.tags, owner_id: record.owner_id, author: record.speaker, source_count: item.sources.length,
      previous_version_id: item.previous_version_id, created_at: item.created_at, mode: "live" });
    if (items.length === query.limit) break;
  }
  return { items, mode: "live" };
}
export async function readExperienceVersion(id: string, revision: number): Promise<ExperienceVersion> {
  ReadExperienceVersionSchema.parse({ id, revision });
  const experience = await readExperience(id), record = await readRecord(id);
  if (experience.revision !== revision) throw new GongzhiError(409, "revision_conflict", "经验 ID 与固定版本不一致。", { requested_revision: revision, record_revision: experience.revision });
  // Valid Agent Skills frontmatter; user content stays body data, never tool grants.
  const skillName = `experience-${sha256(id).slice(0, 16)}-v${revision}`;
  const skill_md = `---\nname: ${skillName}\ndescription: ${JSON.stringify(experience.applicability || experience.title)}\nmetadata:\n  gongzhi-id: ${JSON.stringify(id)}\n  gongzhi-revision: ${JSON.stringify(String(revision))}\n  author-id: ${JSON.stringify(record.speaker_id)}\n---\n\n${experience.body}\n`;
  return { experience, author: record.speaker, skill_md, execution: "caller_local", author_presence_required: false };
}
export async function closeNeed(actor: Identity, id: string, raw: unknown): Promise<Need> {
  const input = CloseNeedSchema.parse(raw);
  return inTransaction(async () => {
    const publisher = await writePublisher(actor); const fp = fingerprint(`close_need:${id}`, input);
    const existing = await previous(actor, input.idempotency_key, fp); if (existing) return currentNeed(id);
    const need = await currentNeed(id, true); assertNeedOwner(actor, need); assertRevision(need, input.expected_revision);
    await createPost(publisher, PostInputSchema.parse({ kind: "announcement", parent_id: id, title: "需求已撤回", body: "发布者关闭了需求；既有公告和成果保留。", tags: [], idempotency_key: input.idempotency_key, metadata: { gongzhi: await metadata(actor, "need_revision", { revision: need.revision, fingerprint: fp }) } }));
    await sql()`update gongzhi_needs set status='closed',updated_at=now() where post_id=${id}`;
    await sql()`update gongzhi_runs set status='cancelled',updated_at=now() where need_id=${id} and status in ('queued','running')`;
    return currentNeed(id);
  });
}
export async function findExperience(actor: Identity, query: string, signal?: AbortSignal): Promise<Experience[]> {
  stopped(signal); await assertIdentity(actor, false, "read"); const result = await findPublicExperience(query); stopped(signal); return result;
}
export async function findPublicExperience(query: string): Promise<Experience[]> {
  assertDatabaseConfigured();
  const result = await search({ q: query, tags: "experience", kind: "offer", limit: 100, include_expired: "true", rerank: "false" }, { track: false });
  return result.posts.filter((p) => gongzhiMetadata(p)?.subtype === "experience" && gongzhiMetadata(p)?.mode === "live" && (!gongzhiMetadata(p).visibility || gongzhiMetadata(p).visibility === "public")).map(toExperience);
}
export async function publishExperience(actor: Identity, raw: unknown): Promise<Experience> {
  const input = PublishExperienceSchema.parse(raw);
  return inTransaction(async () => {
    const { approval_id, ...payload } = input;
    return withContentApproval(actor, approval_id, { action: "publish_experience", payload }, async () => {
    const publisher = await writePublisher(actor, "publish_experience"); const fp = fingerprint("publish_experience", payload);
    const existing = await previous(actor, input.idempotency_key, fp); if (existing) return toExperience(existing);
    let revision = 1;
    if (input.previous_version_id) {
      const before = await readExperience(input.previous_version_id);
      if (before.publisher_id !== actor.owner.publisher_id) throw new GongzhiError(403, "forbidden", "不能为他人的经验发布替代版本。");
      revision = before.revision + 1;
    }
    const { post } = await createPost(publisher, PostInputSchema.parse({ ...input, kind: "offer", tags: [...new Set([...input.tags, "experience"])], metadata: { gongzhi: await metadata(actor, "experience", { revision, applicability: input.applicability, previous_version_id: input.previous_version_id, sources: input.sources, fingerprint: fp }) } }));
    return toExperience(post);
    });
  });
}
export async function postExperienceFeedback(actor: Identity, raw: unknown) {
  const input = PostExperienceFeedbackSchema.parse(raw), { approval_id, ...payload } = input;
  return inTransaction(() => withContentApproval(actor, approval_id, { action: "experience_feedback", payload }, async () => {
    const publisher = await writePublisher(actor, "discuss"), fp = fingerprint("experience_feedback", payload);
    const existing = await previous(actor, input.idempotency_key, fp); if (existing) return readRecord(existing.id);
    const { experience } = await readExperienceVersion(input.experience_id, input.revision);
    const ref = { experience_id: experience.id, revision: experience.revision, usage: input.usage };
    const { post } = await createPost(publisher, PostInputSchema.parse({ kind: "announcement", title: `使用反馈：${experience.title}`.slice(0,200), body: input.body, tags: [], parent_id: experience.id, idempotency_key: input.idempotency_key,
      metadata: { gongzhi: await metadata(actor, "reply", { thread_id: experience.id, reply_to_id: experience.id, method_refs: [ref], experience_feedback: { ...ref, outcome: input.outcome }, fingerprint: fp }) } }));
    await sql()`insert into gongzhi_links(id,result_id,experience_id,experience_revision,content_digest,usage) values(${randomUUID()},${post.id},${experience.id},${experience.revision},${sha256(experience.body)},${input.usage})`;
    return readRecord(post.id);
  }));
}
export async function submitResult(actor: Identity, raw: unknown, options: { run_id?: string; signal?: AbortSignal } = {}): Promise<Result> {
  const input = SubmitResultSchema.parse(raw); stopped(options.signal);
  return inTransaction(async () => {
    const publisher = await writePublisher(actor, "submit_result"); const fp = fingerprint("submit_result", { ...input, run_id: options.run_id });
    if (options.run_id && actor.owner.kind !== "platform_agent") throw new GongzhiError(403, "forbidden", "只有平台身份可以关联平台任务。");
    const need = await currentNeed(input.need_id, true);
    // A platform actor can write only through a still-active persisted run.
    if (actor.owner.kind === "platform_agent") {
      if (!options.run_id) throw new GongzhiError(403, "forbidden", "平台结果必须属于正在执行的任务。");
      const [run] = await sql()`select * from gongzhi_runs where id=${options.run_id} and owner_id=${actor.owner.id} for update`;
      if (!run || run.need_id !== input.need_id || run.need_revision !== input.need_revision) throw new GongzhiError(403, "forbidden", "结果不属于这个平台任务。");
      const prior = await previous(actor, input.idempotency_key, fp);
      if (prior && run.result_id === prior.id) return toResult(prior);
      if (run.result_id) throw new GongzhiError(409, "idempotency_conflict", "此任务已有成果，不能使用另一幂等键再次提交。");
      if (run.status !== "running" || new Date(run.deadline_at).getTime() <= Date.now()) throw new GongzhiError(409, "cancelled", "平台任务已停止或超过期限。");
    }
    const existing = await previous(actor, input.idempotency_key, fp); if (existing) return toResult(existing);
    assertRevision(need, input.need_revision);
    if (["accepted", "closed"].includes(need.status)) throw new GongzhiError(409, "revision_conflict", "此需求已结束，请先重新修改需求。");
    const refs = [];
    for (const ref of input.method_refs) {
      const experience = await readExperience(ref.experience_id);
      if (experience.revision !== ref.revision) throw new GongzhiError(409, "revision_conflict", "经验引用版本不一致。");
      refs.push({ ref, digest: sha256(experience.body) });
    }
    stopped(options.signal);
    const { post } = await createPost(publisher, PostInputSchema.parse({ kind: "announcement", title: input.title, body: input.body, tags: [], parent_id: input.need_id, idempotency_key: input.idempotency_key, metadata: { gongzhi: await metadata(actor, input.subtype, { need_revision: input.need_revision, sources: input.sources, method_refs: input.method_refs, fingerprint: fp, run_id: options.run_id }) } }));
    for (const { ref, digest } of refs) await sql()`insert into gongzhi_links(id,result_id,experience_id,experience_revision,content_digest,usage) values(${randomUUID()},${post.id},${ref.experience_id},${ref.revision},${digest},${ref.usage}) on conflict do nothing`;
    await sql()`update gongzhi_needs set status='helping',updated_at=now() where post_id=${need.id}`;
    if (options.run_id) {
      const guarded = await sql()`update gongzhi_runs set result_id=${post.id},updated_at=now() where id=${options.run_id} and owner_id=${actor.owner.id} and status='running' and deadline_at>clock_timestamp() returning id`;
      if (!guarded.length) throw new GongzhiError(409, "cancelled", "任务在提交过程中停止或超时，结果已回滚。");
    }
    stopped(options.signal); return toResult(post);
  });
}
export async function decideResult(actor: Identity, needId: string, raw: unknown): Promise<Decision> {
  const input = DecideResultSchema.parse(raw);
  return inTransaction(async () => {
    const publisher = await writePublisher(actor); const fp = fingerprint(`decide:${needId}`, input);
    const existing = await previous(actor, input.idempotency_key, fp); if (existing) return toDecision(existing);
    const need = await currentNeed(needId, true); assertNeedOwner(actor, need); assertRevision(need, input.expected_revision);
    if (need.status === "closed") throw new GongzhiError(409, "revision_conflict", "需求已撤回，请先重新修改需求。");
    const result = await visiblePost(input.result_id); const m = gongzhiMetadata(result);
    if (result.parent_id !== needId || m.subtype !== "result") throw new GongzhiError(400, "invalid_request", "只能对当前需求的成果作决定。");
    assertRevision(need, m.need_revision!);
    const { post } = await createPost(publisher, PostInputSchema.parse({ kind: "announcement", title: `决定：${input.decision}`, body: input.note || input.decision, tags: [], parent_id: needId, idempotency_key: input.idempotency_key, metadata: { gongzhi: await metadata(actor, "decision", { need_revision: need.revision, result_id: result.id, decision: input.decision, fingerprint: fp }) } }));
    const status = input.decision === "accept" ? "accepted" : input.decision === "request_revision" ? "needs_revision" : "open";
    await sql()`update gongzhi_needs set status=${status},accepted_result_id=${input.decision === "accept" ? result.id : null},updated_at=now() where post_id=${needId}`;
    return toDecision(post);
  });
}
export async function readInbox(actor: Identity, cursor?: string, limit = 50): Promise<{ items: InboxItem[]; next_cursor: string | null }> {
  const publisher = await assertIdentity(actor, false, "read"); return inboxFor(publisher, cursor, clampLimit(limit));
}
export async function getNetwork(): Promise<Network> {
  assertDatabaseConfigured();
  const posts = (await search({ limit: 100, include_replies: "true", include_expired: "true", sort: "newest", rerank: "false" }, { track: false })).posts.filter((p) => gongzhiMetadata(p)?.mode === "live");
  const needs: Need[] = []; const experiences: Experience[] = []; const results: Result[] = []; const decisions: Decision[] = [];
  for (const post of posts) {
    switch (gongzhiMetadata(post).subtype) {
      case "need": needs.push(await currentNeed(post.id)); break;
      case "experience": experiences.push(toExperience(post)); break;
      case "help": case "result": results.push(toResult(post)); break;
      case "decision": decisions.push(toDecision(post)); break;
    }
  }
  const ownerRows = await sql()`select o.*,p.name,p.last_seen_at,p.status from gongzhi_owners o join publishers p on p.id=o.publisher_id order by o.created_at desc limit 100`;
  const owners = ownerRows.map((r) => toOwner(r as Parameters<typeof toOwner>[0]));
  const agents = await getAgentGraph();
  const graph: Graph = { nodes: agents.nodes.map(n => ({ id: n.id, type: "owner", label: n.label, mode: n.mode })), edges: agents.edges.map(e => ({ ...e, type: "replied" })) };
  return { owners, needs, experiences, results, decisions, graph, mode: "live" };
}

export async function postReply(actor: Identity, raw: unknown) {
  const input = PostReplySchema.parse(raw);
  return inTransaction(async () => {
    const publisher = await writePublisher(actor, "discuss"), fp = fingerprint("post_reply", input);
    const prior = await previous(actor, input.idempotency_key, fp);
    if (prior) return readRecord(prior.id);
    const root = await readRecord(input.thread_id);
    if (root.id !== root.thread_id) throw new GongzhiError(400, "invalid_request", "请使用线程根 ID。");
    const target = await readRecord(input.reply_to_id ?? root.id);
    if (target.thread_id !== root.id) throw new GongzhiError(400, "invalid_request", "回复目标不属于此线程。");
    if (root.kind === "need") {
      if (!input.expected_revision) throw new GongzhiError(400, "invalid_request", "需求讨论必须指定当前版本。");
      const need = await currentNeed(root.id, true); assertRevision(need, input.expected_revision);
      if (["accepted", "closed"].includes(need.status)) throw new GongzhiError(409, "revision_conflict", "此需求已结束。");
    } else if (input.expected_revision !== undefined) throw new GongzhiError(400, "invalid_request", "经验讨论不接受需求版本。");
    const { post } = await createPost(publisher, PostInputSchema.parse({ kind: "announcement", parent_id: root.id, title: `${input.category === "reply" ? "回复" : "补充"}：${root.title}`.slice(0,200), body: input.body, tags: [], idempotency_key: input.idempotency_key, metadata: { gongzhi: await metadata(actor, input.category, { thread_id: root.id, reply_to_id: target.id, need_revision: input.expected_revision, fingerprint: fp }) } }));
    return readRecord(post.id);
  });
}
