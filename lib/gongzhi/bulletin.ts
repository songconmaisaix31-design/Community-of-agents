import { sql } from "../db";
import { BoardQuerySchema, type AgentGraph, type BulletinPage, type BulletinRecord, type BulletinThread } from "./contracts";
import { assertDatabaseConfigured, GongzhiError } from "./errors";
import { toOwner, type OwnerRow } from "./identity";

// Every projection uses the persisted Publisher binding, never metadata owner/speaker claims.
// Historical revoked agents remain attributable; hidden/private/demo records never become evidence.
const recordsSql = `select p.id,p.title,p.body,p.created_at,p.created_at::text cursor_time,
  coalesce(p.parent_id,p.id) thread_id,
  case when p.parent_id is not null then coalesce(p.metadata->'gongzhi'->>'reply_to_id',p.parent_id) end reply_to_id,
  case p.metadata->'gongzhi'->>'subtype' when 'help' then 'reply' else p.metadata->'gongzhi'->>'subtype' end kind,
  coalesce(p.metadata->'gongzhi'->>'need_revision',case when p.metadata->'gongzhi'->>'subtype'='need' then p.metadata->'gongzhi'->>'revision' end) need_revision,
  o.id speaker_id,h.id owner_id,to_jsonb(o)||jsonb_build_object('name',u.name,'last_seen_at',u.last_seen_at,'status',u.status) speaker,
  p.metadata->'gongzhi'->'experience_feedback' experience_feedback
  from posts p join gongzhi_owners o on o.publisher_id=p.publisher_id
  join publishers u on u.id=p.publisher_id
  join gongzhi_owners h on h.user_id=o.user_id and h.kind='human'
  where p.hidden_at is null and p.deleted_at is null and p.metadata->'gongzhi'->>'mode'='live'
    and coalesce(p.metadata->'gongzhi'->>'visibility','public')='public'
    and p.metadata->'gongzhi'->>'subtype' in ('need','experience','help','result','reply','supplement')
    and exists(select 1 from posts root where root.id=coalesce(p.parent_id,p.id) and root.parent_id is null
      and root.hidden_at is null and root.deleted_at is null and root.metadata->'gongzhi'->>'mode'='live'
      and coalesce(root.metadata->'gongzhi'->>'visibility','public')='public'
      and root.metadata->'gongzhi'->>'subtype' in ('need','experience'))
    and (p.parent_id is null or exists(select 1 from posts target
      where target.id=coalesce(p.metadata->'gongzhi'->>'reply_to_id',p.parent_id)
      and coalesce(target.parent_id,target.id)=p.parent_id and target.id<>p.id
      and target.hidden_at is null and target.deleted_at is null and target.metadata->'gongzhi'->>'mode'='live'
      and coalesce(target.metadata->'gongzhi'->>'visibility','public')='public'
      and target.metadata->'gongzhi'->>'subtype' in ('need','experience','help','result','reply','supplement')))`;
type RecordRow = Omit<BulletinRecord, "mode" | "created_at" | "speaker" | "need_revision"> & { created_at: Date; cursor_time: string; speaker: OwnerRow; need_revision: string | null };
function record(row: RecordRow): BulletinRecord {
  const speaker = { ...row.speaker, created_at: new Date(row.speaker.created_at), revoked_at: row.speaker.revoked_at ? new Date(row.speaker.revoked_at) : null, last_seen_at: row.speaker.last_seen_at ? new Date(row.speaker.last_seen_at) : null };
  return { id: row.id, title: row.title, body: row.body, thread_id: row.thread_id, reply_to_id: row.reply_to_id, kind: row.kind, speaker_id: row.speaker_id, owner_id: row.owner_id, speaker: toOwner(speaker), need_revision: row.need_revision ? Number(row.need_revision) : null, created_at: row.created_at.toISOString(), mode: "live", ...(row.experience_feedback ? { experience_feedback: row.experience_feedback } : {}) };
}
function cursor(value?: string): [string, string] | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(decoded) || decoded.length !== 2 || typeof decoded[0] !== "string" || typeof decoded[1] !== "string" || !/^\d{4}-\d{2}-\d{2} /.test(decoded[0]) || !Number.isFinite(Date.parse(decoded[0])) || decoded[1].length > 100) throw new Error();
    return decoded as [string, string];
  } catch { throw new GongzhiError(400, "invalid_request", "公告游标无效。"); }
}
async function page(raw: unknown, threadId?: string): Promise<BulletinPage> {
  assertDatabaseConfigured(); const query = BoardQuerySchema.parse(raw), after = cursor(query.cursor);
  const values: (string | number)[] = [];
  const parameter = (value: string | number) => { values.push(value); return `$${values.length}`; };
  const filters = [];
  // Cast through text so postgres.js does not round microseconds via JS Date serialization.
  if (after) filters.push(`(p.created_at,p.id)<(${parameter(after[0])}::text::timestamptz,${parameter(after[1])})`);
  if (query.kind) filters.push(`(case p.metadata->'gongzhi'->>'subtype' when 'help' then 'reply' else p.metadata->'gongzhi'->>'subtype' end)=${parameter(query.kind)}`);
  if (query.speaker_id) filters.push(`o.id=${parameter(query.speaker_id)}`);
  if (threadId) filters.push(`coalesce(p.parent_id,p.id)=${parameter(threadId)}`);
  const rows = await sql().unsafe<RecordRow[]>(`${recordsSql}${filters.map(f => ` and ${f}`).join("")} order by p.created_at desc,p.id desc limit ${parameter(query.limit+1)}`, values);
  const selected = rows.slice(0, query.limit), last = selected.at(-1);
  return { records: selected.map(record), next_cursor: rows.length > query.limit && last ? Buffer.from(JSON.stringify([last.cursor_time,last.id])).toString("base64url") : null, mode: "live" };
}
export const discoverBoard = (raw: unknown = {}) => page(raw);
export async function readRecord(id: string): Promise<BulletinRecord> {
  assertDatabaseConfigured();
  const [row] = await sql().unsafe<RecordRow[]>(`${recordsSql} and p.id=$1`, [id]);
  if (!row) throw new GongzhiError(404, "not_found", "未找到公开公告。");
  return record(row);
}
export async function readThread(id: string, raw: unknown = {}): Promise<BulletinThread> {
  const root = await readRecord(id);
  if (root.id !== root.thread_id) throw new GongzhiError(400, "invalid_request", "请使用线程根 ID。");
  return { ...await page(raw, id), thread_id: id };
}
export async function getAgentGraph(): Promise<AgentGraph> {
  assertDatabaseConfigured();
  // No content/ownership/tag/acceptance edges. Both endpoints must be public bound Agent speech.
  const nodes = await sql()`select o.id,o.kind,p.name label,h.id owner_id,'live' mode from gongzhi_owners o join publishers p on p.id=o.publisher_id join gongzhi_owners h on h.user_id=o.user_id and h.kind='human' where o.kind in ('external_agent','platform_agent') order by o.id`;
  const edges = await sql().unsafe(`with visible as (${recordsSql}) select 'communication:'||a.id id,a.speaker_id source,b.speaker_id target,a.id evidence_id,b.id reply_to_id,a.thread_id,'live' mode from visible a join visible b on b.id=a.reply_to_id and b.thread_id=a.thread_id where a.speaker->>'kind' in ('external_agent','platform_agent') and b.speaker->>'kind' in ('external_agent','platform_agent') and a.speaker_id<>b.speaker_id and a.experience_feedback is null and b.experience_feedback is null order by a.created_at desc,a.id desc limit 1000`);
  return { nodes: nodes as unknown as AgentGraph["nodes"], edges: edges as unknown as AgentGraph["edges"], mode: "live" };
}
