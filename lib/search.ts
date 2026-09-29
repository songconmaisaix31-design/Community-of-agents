import { z } from "zod";
import { budget, sql, toVectorLiteral, withTimeout } from "./db";
import type { Budget } from "./db";
import { embedQuery, rerank } from "./cohere";
import { HttpError, decodeCursor, encodeCursor } from "./http";
import { KINDS, POST_COLUMNS, PostRow, PublicPost, publicPost } from "./posts";
import { hasBudget } from "./limits";
import { track } from "./metrics";

/**
 * One query grammar for /search, /feed.xml, subscriptions and the MCP search tool.
 * Everything is optional. Filters alone are a valid query.
 */
export const SearchQuerySchema = z.object({
  q: z.string().trim().max(500).optional(),
  kind: z.string().trim().optional(),          // "event" or "event,offer"
  tags: z.string().trim().optional(),          // "a,b" -> any of
  near: z.string().trim().regex(/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/, "near must be 'lat,lng'").optional(),
  radius_km: z.coerce.number().min(0.1).max(500).optional(),
  after: z.string().trim().optional(),
  before: z.string().trim().optional(),
  verified: z.string().trim().optional(),      // "true"
  publisher: z.string().trim().max(40).optional(),
  include_expired: z.string().trim().optional(),
  include_syndicated: z.string().trim().optional(), // default true; "false" hides syndicated posts
  thread: z.string().trim().max(60).optional(),     // only replies in this thread
  include_replies: z.string().trim().optional(),    // "true" to include replies in general search
  sort: z.enum(["relevance", "newest", "soonest"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(500).optional(),
  rerank: z.string().trim().optional(),        // "false" to skip the Cohere rerank pass
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export function parseSearchQuery(input: Record<string, string | undefined> | URLSearchParams): SearchQuery {
  const obj: Record<string, string> = {};
  const entries = input instanceof URLSearchParams ? [...input.entries()] : Object.entries(input);
  for (const [k, v] of entries) if (v !== undefined && v !== "") obj[k] = String(v);
  const parsed = SearchQuerySchema.safeParse(obj);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_query", "Search parameters did not validate.", "See /llms.txt for the query grammar.", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const q = parsed.data;
  if (q.after && Number.isNaN(Date.parse(q.after))) throw new HttpError(400, "invalid_query", "after must be an ISO 8601 date-time.");
  if (q.before && Number.isNaN(Date.parse(q.before))) throw new HttpError(400, "invalid_query", "before must be an ISO 8601 date-time.");
  if (q.kind) {
    for (const k of q.kind.split(",")) if (!(KINDS as readonly string[]).includes(k.trim())) {
      throw new HttpError(400, "invalid_query", `Unknown kind "${k.trim()}".`, `kind must be one of ${KINDS.join(", ")}.`);
    }
  }
  return q;
}

type Built = { where: string; params: unknown[]; distanceExpr: string | null; nearLat?: number; nearLng?: number };

function buildWhere(q: SearchQuery, opts: { alias?: string } = {}): Built {
  const p = opts.alias ?? "p";
  const params: unknown[] = [];
  const add = (v: unknown) => { params.push(v); return "$" + params.length; };
  const clauses: string[] = [`${p}.deleted_at is null`, `${p}.hidden_at is null`, `u.status = 'active'`];
  if (q.include_expired !== "true") clauses.push(`${p}.expires_at > now()`);
  if (q.kind) clauses.push(`${p}.kind = any(${add(q.kind.split(",").map((s) => s.trim()))}::text[])`);
  if (q.tags) clauses.push(`${p}.tags && ${add(q.tags.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))}::text[]`);
  if (q.verified === "true") clauses.push(`u.domain_verified_at is not null`);
  if (q.publisher) clauses.push(`${p}.publisher_id = ${add(q.publisher)}`);
  if (q.include_syndicated === "false") clauses.push(`${p}.syndicated = false`);
  if (q.thread) clauses.push(`${p}.parent_id = ${add(q.thread)}`);
  else if (q.include_replies !== "true") clauses.push(`${p}.parent_id is null`);
  // Time window applies to the event window when present, else to creation time.
  if (q.after) clauses.push(`coalesce(${p}.ends_at, ${p}.starts_at, ${p}.created_at) >= ${add(new Date(q.after))}`);
  if (q.before) clauses.push(`coalesce(${p}.starts_at, ${p}.created_at) <= ${add(new Date(q.before))}`);
  let distanceExpr: string | null = null;
  let nearLat: number | undefined, nearLng: number | undefined;
  if (q.near) {
    const [latS, lngS] = q.near.split(",");
    nearLat = parseFloat(latS); nearLng = parseFloat(lngS);
    if (Math.abs(nearLat) > 90 || Math.abs(nearLng) > 180) throw new HttpError(400, "invalid_query", "near is out of range.");
    const r = q.radius_km ?? 25;
    const dLat = r / 111;
    const dLng = r / (111 * Math.max(0.1, Math.cos((nearLat * Math.PI) / 180)));
    const latP = add(nearLat), lngP = add(nearLng);
    distanceExpr = `(6371 * acos(least(1.0, greatest(-1.0, cos(radians(${latP})) * cos(radians(${p}.lat)) * cos(radians(${p}.lng) - radians(${lngP})) + sin(radians(${latP})) * sin(radians(${p}.lat))))))`;
    clauses.push(`${p}.lat between ${add(nearLat - dLat)} and ${add(nearLat + dLat)}`);
    clauses.push(`${p}.lng between ${add(nearLng - dLng)} and ${add(nearLng + dLng)}`);
    clauses.push(`${distanceExpr} <= ${add(r)}`);
  }
  return { where: clauses.join(" and "), params, distanceExpr, nearLat, nearLng };
}

export type SearchResult = { posts: PublicPost[]; next_cursor: string | null; mode: "keyset" | "hybrid"; reranked: boolean; sort: "relevance" | "newest" | "soonest" };

const POOL = 100;   // max candidates considered for a text query
const RERANK_POOL = 40;
// Calibrated against Cohere embed-v4.0 / rerank-v3.5 (see docs/search-calibration.md).
const VECTOR_CANDIDATE_MAX_DISTANCE = Number(process.env.CRIER_VECTOR_MAX_DISTANCE || 0.78);
const RERANK_MIN_SCORE = Number(process.env.CRIER_RERANK_MIN_SCORE || 0.05);

export async function search(q: SearchQuery, opts: { track?: boolean; at?: Budget } = {}): Promise<SearchResult> {
  const limit = q.limit ?? 20;
  const s = sql();
  // Shared across every statement below, so a hybrid search is bounded once rather than per query.
  // A caller with its own budget (a page that reads something else first) passes it in.
  const at = opts.at ?? budget();
  const b = buildWhere(q);
  const distSel = b.distanceExpr ? `, ${b.distanceExpr} as distance_km` : ", null::float as distance_km";

  let rows: PostRow[];
  let next_cursor: string | null = null;
  let mode: SearchResult["mode"] = "keyset";
  let reranked = false;
  let sortUsed: SearchResult["sort"] = "relevance";

  if (!q.q) {
    // Keyset pagination over a stable order.
    const sort = q.sort === "soonest" || (q.sort === undefined && (q.after || q.before) && q.kind?.split(",").every((k) => k.trim() === "event")) ? "soonest" : "newest";
    sortUsed = sort;
    const params = [...b.params];
    let where = b.where;
    const cur = decodeCursor<{ k: string; id: string }>(q.cursor);
    const orderKey = sort === "soonest" ? "coalesce(p.starts_at, p.created_at)" : "p.created_at";
    if (cur) {
      params.push(new Date(cur.k), cur.id);
      where += sort === "soonest"
        ? ` and (${orderKey}, p.id) > ($${params.length - 1}, $${params.length})`
        : ` and (${orderKey}, p.id) < ($${params.length - 1}, $${params.length})`;
    }
    params.push(limit + 1);
    const order = sort === "soonest" ? `${orderKey} asc, p.id asc` : `${orderKey} desc, p.id desc`;
    rows = await withTimeout(s.unsafe<PostRow[]>(
      `select ${POST_COLUMNS}${distSel}, ${orderKey} as order_key
         from posts p join publishers u on u.id = p.publisher_id
        where ${where}
        order by ${order}
        limit $${params.length}`, params as never[]), at("search:keyset"));
    if (rows.length > limit) {
      rows = rows.slice(0, limit);
      const last = rows[rows.length - 1] as PostRow & { order_key: Date };
      next_cursor = encodeCursor({ k: last.order_key.toISOString(), id: last.id });
    }
  } else {
    mode = "hybrid";
    const cur = decodeCursor<{ o: number }>(q.cursor);
    const offset = Math.max(0, Math.min(cur?.o ?? 0, POOL));
    const text = q.q;
    const vec = await embedQuery(text);

    // Full-text candidates.
    const ftsParams = [...b.params, text, POOL];
    const fts = withTimeout(s.unsafe<{ id: string }[]>(
      `select p.id from posts p join publishers u on u.id = p.publisher_id
        where ${b.where} and p.tsv @@ websearch_to_tsquery('english', $${ftsParams.length - 1})
        order by ts_rank_cd(p.tsv, websearch_to_tsquery('english', $${ftsParams.length - 1})) desc, p.created_at desc
        limit $${ftsParams.length}`, ftsParams as never[]), at("search:fts"));
    // Semantic candidates.
    const vecParams = [...b.params, vec ? toVectorLiteral(vec) : null, VECTOR_CANDIDATE_MAX_DISTANCE, POOL];
    const sem = vec
      ? withTimeout(s.unsafe<{ id: string }[]>(
        `select p.id from posts p join publishers u on u.id = p.publisher_id
          where ${b.where} and p.embedding is not null and (p.embedding <=> $${vecParams.length - 2}::vector) <= $${vecParams.length - 1}
          order by p.embedding <=> $${vecParams.length - 2}::vector
          limit $${vecParams.length}`, vecParams as never[]), at("search:semantic"))
      : Promise.resolve([] as { id: string }[]);
    // Trigram fallback for typos and short names, only when FTS is thin.
    const [ftsRows, semRows] = await Promise.all([fts, sem]);
    let trgRows: { id: string }[] = [];
    if (ftsRows.length < 5) {
      const trgParams = [...b.params, text, 20];
      trgRows = await withTimeout(s.unsafe<{ id: string }[]>(
        `select p.id from posts p join publishers u on u.id = p.publisher_id
          where ${b.where} and (p.title % $${trgParams.length - 1} or p.place_name % $${trgParams.length - 1})
          order by greatest(similarity(p.title, $${trgParams.length - 1}), similarity(coalesce(p.place_name,''), $${trgParams.length - 1})) desc
          limit $${trgParams.length}`, trgParams as never[]), at("search:trigram"));
    }

    // Reciprocal rank fusion.
    const K = 60;
    const score = new Map<string, number>();
    const lists = [ftsRows, semRows, trgRows];
    lists.forEach((list, li) => {
      const weight = li === 2 ? 0.5 : 1;
      list.forEach((r, i) => score.set(r.id, (score.get(r.id) ?? 0) + weight / (K + i + 1)));
    });
    let ids = [...score.entries()].sort((a, b2) => b2[1] - a[1]).map(([id]) => id).slice(0, POOL);

    if (ids.length === 0) {
      rows = [];
    } else {
      const fetchParams = [...b.params, ids];
      const fetched = await withTimeout(s.unsafe<PostRow[]>(
        `select ${POST_COLUMNS}${distSel} from posts p join publishers u on u.id = p.publisher_id
          where ${b.where} and p.id = any($${fetchParams.length}::text[])`, fetchParams as never[]), at("search:hydrate"));
      const byId = new Map(fetched.map((r) => [r.id, r]));
      let ordered = ids.map((id) => byId.get(id)).filter((r): r is PostRow => !!r);

      // Rerank the head of the fused list with Cohere unless disabled.
      if (q.rerank !== "false" && ordered.length > 1 && (await hasBudget("reranks_per_day"))) {
        const head = ordered.slice(0, RERANK_POOL);
        const docs = head.map((r) => `${r.title}\n${r.tags.join(", ")}\n${r.place_name ?? ""}\n${r.body.slice(0, 1500)}`);
        const rr = await rerank(text, docs, head.length);
        if (rr) {
          reranked = true;
          // Keep only what the reranker considers relevant; the un-reranked tail is by construction worse.
          ordered = rr.filter((x) => x.score >= RERANK_MIN_SCORE).map((x) => { const r = head[x.index]; r.score = x.score; return r; });
        }
      }
      ids = ordered.map((r) => r.id);
      const page = ordered.slice(offset, offset + limit);
      rows = page;
      if (offset + limit < ordered.length) next_cursor = encodeCursor({ o: offset + limit });
    }
  }

  // Collapse syndicated duplicates of the same source within a page (keep the first, which is the best-ranked/newest).
  const seenSource = new Set<string>();
  rows = rows.filter((r) => {
    if (!r.source_key) return true;
    if (seenSource.has(r.source_key)) return false;
    seenSource.add(r.source_key);
    return true;
  });

  const posts = rows.map((r) => {
    const p = publicPost(r, { withDistance: !!b.distanceExpr });
    if (reranked && r.score != null) p.relevance = Math.round(r.score * 1000) / 1000;
    return p;
  });
  if (opts.track !== false && posts.length) {
    const ids = posts.map((p) => p.id);
    // Counters, batched into the metrics flush: one statement for every search an instance served
    // between flushes, rather than one per search. Rows something else is updating are still
    // skipped rather than queued behind — see lib/side-writes.ts.
    track.retrievals(ids);
    track.stat("retrievals", ids.length);
  }
  if (opts.track !== false) track.stat("searches");
  return { posts, next_cursor, mode, reranked, sort: sortUsed };
}

/** Describe a query in words, for feed titles and subscription summaries. */
export function describeQuery(q: SearchQuery): string {
  const parts: string[] = [];
  if (q.q) parts.push(`"${q.q}"`);
  if (q.kind) parts.push(q.kind.split(",").join("/") + "s");
  if (q.tags) parts.push("tagged " + q.tags.split(",").join(", "));
  if (q.near) parts.push(`within ${q.radius_km ?? 25} km of ${q.near}`);
  if (q.after) parts.push("after " + q.after);
  if (q.before) parts.push("before " + q.before);
  if (q.verified === "true") parts.push("verified publishers only");
  if (q.thread) parts.push("replies in thread " + q.thread);
  return parts.length ? parts.join(", ") : "everything";
}
