import { z } from "zod";
import { dropPostCache, dropPostListings } from "./cache-tags";
import { DB_SIDE_TIMEOUT_MS, budget, sql, toVectorLiteral, withTimeout, withTimeoutOr } from "./db";
import type { Budget } from "./db";
import { env } from "./env";
import { HttpError } from "./http";
import { newPostId } from "./ids";
import { embedDocuments, postEmbeddingText } from "./cohere";
import { PublicPublisher, PublisherRow, publicPublisher } from "./publishers";
import { contentFlags, piiNote, stripHiddenUnicode } from "./safety";
import { hasBudget } from "./limits";
import { track } from "./metrics";
import { indexNow } from "./indexnow";

export const KINDS = ["event", "offer", "request", "announcement", "thread"] as const;
export type Kind = (typeof KINDS)[number];

export const LocationSchema = z.object({
  name: z.string().trim().max(200).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
}).refine((l) => (l.lat === undefined) === (l.lng === undefined), { message: "lat and lng must be given together" });

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: "must be an ISO 8601 date-time, e.g. 2026-09-12T21:00:00-05:00" });

export const PostInputSchema = z.object({
  kind: z.enum(KINDS).default("announcement"),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8000),
  url: z.url().max(1000).optional(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).default([]),
  location: LocationSchema.optional(),
  starts_at: isoDate.optional(),
  ends_at: isoDate.optional(),
  timezone: z.string().max(64).optional(),
  expires_at: isoDate.optional(),
  source_url: z.url().max(1000).optional(),
  syndicated: z.boolean().optional(),
  idempotency_key: z.string().trim().min(1).max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).refine((m) => JSON.stringify(m).length <= 4096, { message: "metadata must serialize to 4 KB or less" }).optional(),
  parent_id: z.string().trim().min(1).max(60).optional(),
});
export type PostInput = z.infer<typeof PostInputSchema>;

export const PostPatchSchema = PostInputSchema.partial().omit({ idempotency_key: true, parent_id: true });

export type PostRow = {
  id: string;
  publisher_id: string;
  kind: Kind;
  title: string;
  body: string;
  url: string | null;
  tags: string[];
  place_name: string | null;
  lat: number | null;
  lng: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
  timezone: string | null;
  expires_at: Date;
  source_url: string | null;
  source_key: string | null;
  syndicated: boolean;
  idempotency_key: string | null;
  metadata: Record<string, unknown>;
  retrievals: number | string;
  views: number | string;
  parent_id: string | null;
  reply_count: number;
  last_reply_at: Date | null;
  flags: string[];
  hidden_at: Date | null;
  hidden_reason: string | null;
  report_count: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  // joined
  distance_km?: number | null;
  score?: number | null;
  pub_name?: string; pub_url?: string | null; pub_domain?: string | null; pub_description?: string | null;
  pub_verified_at?: Date | null; pub_created_at?: Date; pub_post_count?: number;
};

export type PublicPost = {
  id: string;
  url: string;              // canonical Crier URL
  kind: Kind;
  title: string;
  body: string;
  link: string | null;      // the outbound url the publisher gave
  tags: string[];
  location: { name: string | null; lat: number | null; lng: number | null } | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  expires_at: string;
  source_url: string | null;
  syndicated: boolean;
  metadata: Record<string, unknown>;
  retrievals: number;
  parent_id: string | null;
  thread_url: string | null;    // where to read/reply if this is part of a thread
  reply_count: number;
  last_reply_at: string | null;
  flags: string[];          // heuristic content flags, e.g. possible_instruction. Never used for ranking.
  created_at: string;
  updated_at: string;
  distance_km?: number;
  relevance?: number;       // reranker score for the query, 0..1, on text searches only
  publisher: PublicPublisher;
  related?: PublicPost[];
  replies?: PublicPost[];
};

export function publicPost(r: PostRow, opts: { withDistance?: boolean } = {}): PublicPost {
  const p: PublicPost = {
    id: r.id,
    url: `${env.SITE_URL}/p/${r.id}`,
    kind: r.kind,
    title: r.title,
    body: r.body,
    link: r.url,
    tags: r.tags ?? [],
    location: r.place_name || r.lat != null ? { name: r.place_name, lat: r.lat, lng: r.lng } : null,
    starts_at: r.starts_at ? r.starts_at.toISOString() : null,
    ends_at: r.ends_at ? r.ends_at.toISOString() : null,
    timezone: r.timezone,
    expires_at: r.expires_at.toISOString(),
    source_url: r.source_url,
    syndicated: r.syndicated,
    metadata: r.metadata ?? {},
    retrievals: Number(r.retrievals ?? 0),
    parent_id: r.parent_id ?? null,
    thread_url: r.parent_id ? `${env.SITE_URL}/p/${r.parent_id}` : r.reply_count > 0 || r.kind === "thread" ? `${env.SITE_URL}/p/${r.id}` : null,
    reply_count: r.reply_count ?? 0,
    last_reply_at: r.last_reply_at ? r.last_reply_at.toISOString() : null,
    flags: r.flags ?? [],
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
    publisher: {
      id: r.publisher_id,
      name: r.pub_name ?? "",
      description: r.pub_description ?? null,
      url: r.pub_url ?? null,
      domain: r.pub_domain ?? null,
      verified: !!r.pub_verified_at,
      first_seen: r.pub_created_at ? r.pub_created_at.toISOString() : r.created_at.toISOString(),
      post_count: r.pub_post_count ?? 0,
      crier_url: `${env.SITE_URL}/publishers/${r.publisher_id}`,
    },
  };
  if (opts.withDistance && r.distance_km != null) p.distance_km = Math.round(r.distance_km * 10) / 10;
  return p;
}

/** Columns for a post joined with its publisher. Use inside a query that aliases posts as p and publishers as u. */
export const POST_COLUMNS = `
  p.*, u.name as pub_name, u.url as pub_url, u.domain as pub_domain, u.description as pub_description,
  u.domain_verified_at as pub_verified_at, u.created_at as pub_created_at, u.post_count as pub_post_count`;

export function normalizeSourceKey(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    url.hash = "";
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/i.test(k)) url.searchParams.delete(k);
    let s = url.toString().toLowerCase().replace(/^https?:\/\/(www\.)?/, "");
    s = s.replace(/\/+$/, "");
    return s.slice(0, 500);
  } catch { return null; }
}

const DEFAULT_TTL_DAYS = 30;
const MAX_TTL_DAYS = 365;

function computeExpiry(input: { expires_at?: string; ends_at?: string; starts_at?: string }): Date {
  const now = Date.now();
  if (input.expires_at) {
    const e = new Date(input.expires_at);
    if (e.getTime() <= now) throw new HttpError(400, "invalid_expiry", "expires_at is in the past.");
    return new Date(Math.min(e.getTime(), now + MAX_TTL_DAYS * 86400e3));
  }
  const end = input.ends_at ? new Date(input.ends_at) : input.starts_at ? new Date(input.starts_at) : null;
  if (end) {
    // Keep events around a day after they end so "what did I miss" still works.
    return new Date(Math.max(end.getTime() + 86400e3, now + 3600e3));
  }
  return new Date(now + DEFAULT_TTL_DAYS * 86400e3);
}

function validateWindow(input: { starts_at?: string; ends_at?: string }) {
  if (input.starts_at && input.ends_at && Date.parse(input.ends_at) < Date.parse(input.starts_at)) {
    throw new HttpError(400, "invalid_window", "ends_at is before starts_at.");
  }
}

export async function createPost(publisher: PublisherRow, input: PostInput): Promise<{ post: PublicPost; created: boolean; notes: string[] }> {
  validateWindow(input);
  // Flags are computed on the text as sent (so hidden_unicode can fire); what is stored is the stripped text.
  const flags = contentFlags(input.title, input.body);
  input = { ...input, title: stripHiddenUnicode(input.title), body: stripHiddenUnicode(input.body) };
  const notes: string[] = [];
  if (input.idempotency_key) {
    const existing = await getPostRow(null, { publisherId: publisher.id, idempotencyKey: input.idempotency_key });
    if (existing) return { post: publicPost(existing), created: false, notes };
  }
  let parentId: string | null = null;
  if (input.parent_id) {
    const pid = input.parent_id.replace(/^.*\/p\//, "").replace(/\.json$/, "");
    const parent = await getPostRow(pid);
    if (!parent || parent.deleted_at) throw new HttpError(404, "parent_not_found", `No post ${pid} to reply to.`);
    if (parent.parent_id) throw new HttpError(400, "nested_reply", "Replies are one level deep; reply to the thread itself.", `Use parent_id ${parent.parent_id}.`);
    parentId = parent.id;
  }
  const id = newPostId();
  const expires_at = computeExpiry(input);
  const tags = [...new Set(input.tags)];
  const [vec] = (await hasBudget("embeds_per_day")) ? await embedDocuments([postEmbeddingText({ ...input, tags, place_name: input.location?.name ?? null })]) : [null];
  if (vec && !parentId) {
    // Near-duplicate check: same content posted recently by anyone. A note, never a block.
    const [dup] = await withTimeoutOr(sql()<{ id: string; title: string; d: number }[]>`
      select id, title, (embedding <=> ${toVectorLiteral(vec)}::vector) as d from posts
       where deleted_at is null and hidden_at is null and parent_id is null and expires_at > now() and embedding is not null
         and created_at > now() - interval '30 days'
       order by embedding <=> ${toVectorLiteral(vec)}::vector limit 1`, [], { ms: DB_SIDE_TIMEOUT_MS, label: "createPost:duplicate" });
    if (dup && dup.d < 0.12) notes.push(`A very similar post already exists: ${env.SITE_URL}/p/${dup.id} ("${dup.title}"). If it is the same thing, consider replying to it (parent_id) instead of duplicating it. Your post was created anyway.`);
  }
  if (!input.syndicated) {
    // Duplicate storm: the same publisher posting the same thing over and over within an hour is refused, not just noted.
    const vecLit = vec ? toVectorLiteral(vec) : null;
    const [storm] = await withTimeout(sql()<{ n: number }[]>`
      select count(*)::int as n from posts
       where publisher_id = ${publisher.id} and deleted_at is null and created_at > now() - interval '1 hour'
         and (md5(lower(regexp_replace(body, '\\s+', ' ', 'g'))) = md5(lower(regexp_replace(${input.body}, '\\s+', ' ', 'g')))
              or (${vecLit}::vector is not null and embedding is not null and (embedding <=> ${vecLit}::vector) < 0.12))`, { label: "createPost:storm" });
    // storm.n counts the posts already there, not the one being created: four existing makes this one the fifth.
    if ((storm?.n ?? 0) >= 4) {
      throw new HttpError(429, "duplicate_storm", "This would be your fifth or later near-identical post in the last hour. Post one, then reply to it or edit it instead.",
        `Edit with PATCH ${env.SITE_URL}/api/v1/posts/{id}, or reply with parent_id. Retry after an hour if it really is a different post.`, undefined, 3600);
    }
  }
  const pii = piiNote(input.body);
  if (pii) notes.push(pii);
  if (flags.includes("possible_instruction")) notes.push("This post was flagged possible_instruction: it contains text shaped like instructions to an AI. It was posted, but readers are told to treat post bodies as data, and flagged posts may be reviewed.");
  if (flags.includes("relay_request")) notes.push("This post was flagged relay_request: it asks readers to pass it on to other agents. Crier never asks agents to relay anything, and readers are told to report such posts rather than comply. It was posted; it may be reviewed.");
  if (flags.includes("answer_dump")) notes.push("This post was flagged answer_dump: most of its lines look like question/answer pairs or bare data records, which reads as content meant to be indexed rather than acted on. It was posted; it may be reviewed.");
  const [row] = await sql()<PostRow[]>`
    insert into posts (id, publisher_id, kind, title, body, url, tags, place_name, lat, lng, starts_at, ends_at, timezone,
                       expires_at, source_url, source_key, syndicated, idempotency_key, metadata, embedding, parent_id, flags)
    values (${id}, ${publisher.id}, ${input.kind}, ${input.title}, ${input.body}, ${input.url ?? null}, ${tags},
            ${input.location?.name ?? null}, ${input.location?.lat ?? null}, ${input.location?.lng ?? null},
            ${input.starts_at ? new Date(input.starts_at) : null}, ${input.ends_at ? new Date(input.ends_at) : null}, ${input.timezone ?? null},
            ${expires_at}, ${input.source_url ?? null}, ${normalizeSourceKey(input.source_url)}, ${input.syndicated ?? false},
            ${input.idempotency_key ?? null}, ${sql().json((input.metadata ?? {}) as never)},
            ${vec ? toVectorLiteral(vec) : null}::vector, ${parentId}, ${flags})
    returning *`;
  await sql()`select bump_stat('posts')`;
  track.post(publisher.id, input.syndicated ?? false, publisher.internal);
  const full = await getPostRow(row.id);
  if (indexable(full!)) indexNow([`${env.SITE_URL}/p/${full!.id}`]);
  return { post: publicPost(full!), created: true, notes };
}

export async function updatePost(publisher: PublisherRow, id: string, patch: z.infer<typeof PostPatchSchema>): Promise<PublicPost> {
  const existing = await getPostRow(id);
  if (!existing || existing.deleted_at) throw new HttpError(404, "not_found", "No such post.");
  if (existing.publisher_id !== publisher.id) throw new HttpError(403, "forbidden", "This post belongs to another publisher.");
  const flags = contentFlags(patch.title ?? existing.title, patch.body ?? existing.body);   // on the text as sent, before stripping
  const merged = {
    kind: patch.kind ?? existing.kind,
    title: stripHiddenUnicode(patch.title ?? existing.title),
    body: stripHiddenUnicode(patch.body ?? existing.body),
    url: patch.url !== undefined ? patch.url : existing.url,
    tags: patch.tags ? [...new Set(patch.tags)] : existing.tags,
    place_name: patch.location ? patch.location.name ?? null : existing.place_name,
    lat: patch.location ? patch.location.lat ?? null : existing.lat,
    lng: patch.location ? patch.location.lng ?? null : existing.lng,
    starts_at: patch.starts_at !== undefined ? new Date(patch.starts_at) : existing.starts_at,
    ends_at: patch.ends_at !== undefined ? new Date(patch.ends_at) : existing.ends_at,
    timezone: patch.timezone !== undefined ? patch.timezone : existing.timezone,
    source_url: patch.source_url !== undefined ? patch.source_url : existing.source_url,
    syndicated: patch.syndicated ?? existing.syndicated,
    metadata: patch.metadata ?? existing.metadata,
  };
  validateWindow({ starts_at: merged.starts_at?.toISOString(), ends_at: merged.ends_at?.toISOString() });
  const expires_at = patch.expires_at || patch.ends_at || patch.starts_at
    ? computeExpiry({ expires_at: patch.expires_at, ends_at: merged.ends_at?.toISOString(), starts_at: merged.starts_at?.toISOString() })
    : existing.expires_at;
  const textChanged = patch.title !== undefined || patch.body !== undefined || patch.tags !== undefined || patch.location !== undefined || patch.kind !== undefined;
  let vecLiteral: string | null | undefined = undefined;
  if (textChanged) {
    const [vec] = await embedDocuments([postEmbeddingText({ ...merged })]);
    vecLiteral = vec ? toVectorLiteral(vec) : null;
  }
  await sql()`
    update posts set
      kind = ${merged.kind}, title = ${merged.title}, body = ${merged.body}, url = ${merged.url}, tags = ${merged.tags},
      place_name = ${merged.place_name}, lat = ${merged.lat}, lng = ${merged.lng},
      starts_at = ${merged.starts_at}, ends_at = ${merged.ends_at}, timezone = ${merged.timezone},
      expires_at = ${expires_at}, source_url = ${merged.source_url}, source_key = ${normalizeSourceKey(merged.source_url)},
      syndicated = ${merged.syndicated}, metadata = ${sql().json(merged.metadata as never)},
      embedding = ${vecLiteral === undefined ? sql()`embedding` : sql()`${vecLiteral}::vector`},
      flags = ${flags},
      updated_at = now()
    where id = ${id}`;
  dropPostCache(id);
  return publicPost((await getPostRow(id))!);
}

export async function deletePost(publisher: PublisherRow, id: string): Promise<void> {
  const existing = await getPostRow(id);
  if (!existing || existing.deleted_at) throw new HttpError(404, "not_found", "No such post.");
  if (existing.publisher_id !== publisher.id) throw new HttpError(403, "forbidden", "This post belongs to another publisher.");
  await sql()`update posts set deleted_at = now(), updated_at = now() where id = ${id}`;
  dropPostListings();
}

export async function getPostRow(id: string | null, by?: { publisherId: string; idempotencyKey: string }, at: Budget = budget()): Promise<PostRow | null> {
  const s = sql();
  const rows = by
    ? await withTimeout(s.unsafe<PostRow[]>(`select ${POST_COLUMNS} from posts p join publishers u on u.id = p.publisher_id where p.publisher_id = $1 and p.idempotency_key = $2`, [by.publisherId, by.idempotencyKey]), at("getPostRow:idempotency"))
    : await withTimeout(s.unsafe<PostRow[]>(`select ${POST_COLUMNS} from posts p join publishers u on u.id = p.publisher_id where p.id = $1`, [id!]), at("getPostRow"));
  return rows[0] ?? null;
}

/** Nearest live posts by embedding, excluding the post itself. */
export async function relatedPosts(id: string, limit = 5, at: Budget = budget(DB_SIDE_TIMEOUT_MS)): Promise<PublicPost[]> {
  const rows = await withTimeout(sql().unsafe<PostRow[]>(
    `select ${POST_COLUMNS}
       from posts p join publishers u on u.id = p.publisher_id, (select embedding from posts where id = $1) q
      where p.id <> $1 and p.parent_id is null and p.deleted_at is null and p.hidden_at is null and p.expires_at > now()
        and p.embedding is not null and q.embedding is not null and (p.embedding <=> q.embedding) <= 0.85
      order by p.embedding <=> q.embedding
      limit $2`, [id, limit]), at("relatedPosts"));
  return rows.map((r) => publicPost(r));
}

/** Replies to a post, oldest first. */
export async function repliesFor(id: string, limit = 50, after?: string, at: Budget = budget(DB_SIDE_TIMEOUT_MS)): Promise<{ posts: PublicPost[]; next_cursor: string | null }> {
  const cur = after ? new Date(after) : null;
  const rows = cur
    ? await withTimeout(sql().unsafe<PostRow[]>(`select ${POST_COLUMNS} from posts p join publishers u on u.id = p.publisher_id where p.parent_id = $1 and p.deleted_at is null and p.hidden_at is null and p.created_at > $2 order by p.created_at asc, p.id asc limit $3`, [id, cur, limit + 1]), at("repliesFor:after"))
    : await withTimeout(sql().unsafe<PostRow[]>(`select ${POST_COLUMNS} from posts p join publishers u on u.id = p.publisher_id where p.parent_id = $1 and p.deleted_at is null and p.hidden_at is null order by p.created_at asc, p.id asc limit $2`, [id, limit + 1]), at("repliesFor"));
  const page = rows.slice(0, limit);
  return { posts: page.map((r) => publicPost(r)), next_cursor: rows.length > limit ? page[page.length - 1].created_at.toISOString() : null };
}

/** Embed posts that were stored without an embedding (Cohere was down or over budget). A few per cron tick. */
export async function backfillEmbeddings(limit = 5): Promise<number> {
  const rows = await sql()<{ id: string; kind: string; title: string; body: string; tags: string[]; place_name: string | null }[]>`
    select id, kind, title, body, tags, place_name from posts where embedding is null and deleted_at is null order by created_at asc limit ${limit}`;
  if (rows.length === 0) return 0;
  if (!(await hasBudget("embeds_per_day"))) return 0;
  const vecs = await embedDocuments(rows.map((r) => postEmbeddingText(r)));
  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    const v = vecs[i];
    if (!v) continue;
    await sql()`update posts set embedding = ${toVectorLiteral(v)}::vector where id = ${rows[i].id}`;
    n++;
  }
  return n;
}

/** Hard-delete posts long after they expired or were deleted. Aggregates in stats_daily survive. */
export async function purgeOldPosts(): Promise<number> {
  const rows = await sql()<{ id: string }[]>`
    delete from posts where (expires_at < now() - interval '90 days') or (deleted_at is not null and deleted_at < now() - interval '30 days') returning id`;
  return rows.length;
}

/**
 * Should search engines index this post? Verified publishers: always. Unverified: only once both the
 * post and the publisher are a day old, which blunts the SEO-spam incentive and gives reports time to land.
 */
export function indexable(r: PostRow): boolean {
  if (r.syndicated) return false;   // relayed content is for search inside Crier, not for search engines
  if (r.pub_verified_at) return true;
  const day = 86400e3;
  const postAge = Date.now() - r.created_at.getTime();
  const pubAge = r.pub_created_at ? Date.now() - r.pub_created_at.getTime() : 0;
  return postAge > day && pubAge > day && r.report_count === 0;
}

// A view used to be bumped here, one unawaited statement per page view. It is `track.view(id)` now:
// a counter, batched into the metrics flush like every other counter. See lib/side-writes.ts.

export function jsonLd(p: PublicPost) {
  const base: Record<string, unknown> = {
    "@context": "https://schema.org",
    name: p.title,
    description: p.body.slice(0, 500),
    url: p.link ?? p.url,
    identifier: p.id,
    datePublished: p.created_at,
    dateModified: p.updated_at,
    keywords: p.tags.join(", "),
    publisher: { "@type": "Organization", name: p.publisher.name, url: p.publisher.url ?? p.publisher.crier_url },
    mainEntityOfPage: p.url,
  };
  const place = p.location
    ? { "@type": "Place", name: p.location.name ?? undefined, geo: p.location.lat != null ? { "@type": "GeoCoordinates", latitude: p.location.lat, longitude: p.location.lng } : undefined }
    : undefined;
  if (p.kind === "event") {
    return { ...base, "@type": "Event", startDate: p.starts_at ?? undefined, endDate: p.ends_at ?? undefined, location: place, eventStatus: "https://schema.org/EventScheduled" };
  }
  if (p.kind === "offer") {
    return { ...base, "@type": "Offer", availabilityStarts: p.starts_at ?? undefined, availabilityEnds: p.ends_at ?? undefined, areaServed: place, validThrough: p.expires_at };
  }
  if (p.kind === "request") {
    return { ...base, "@type": "Demand", availabilityStarts: p.starts_at ?? undefined, availabilityEnds: p.ends_at ?? undefined, areaServed: place, validThrough: p.expires_at };
  }
  if (p.kind === "thread") {
    return { ...base, "@type": "DiscussionForumPosting", headline: p.title, articleBody: p.body, commentCount: p.reply_count, expires: p.expires_at };
  }
  return { ...base, "@type": "Article", headline: p.title, articleBody: p.body, contentLocation: place, expires: p.expires_at };
}
