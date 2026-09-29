import { z } from "zod";
import { createHmac } from "node:crypto";
import { sideWrite, sql, toVectorLiteral, withTimeout } from "./db";
import { env } from "./env";
import { HttpError, decodeCursor, encodeCursor } from "./http";
import { newSecret, newSubscriptionId } from "./ids";
import { embedQuery } from "./cohere";
import { POST_COLUMNS, PostRow, PublicPost, publicPost } from "./posts";
import { PublisherRow } from "./publishers";
import { SearchQuery, SearchQuerySchema, describeQuery, parseSearchQuery } from "./search";
import { assertSafeOutboundUrl } from "./safety";

// Cosine distance at or below which a post is considered a semantic match for a subscription's q.
const SEMANTIC_MATCH_DISTANCE = Number(process.env.CRIER_SEMANTIC_MATCH_DISTANCE || 0.65);

export const SubscriptionInputSchema = z.object({
  query: z.record(z.string(), z.union([z.string(), z.number()])).refine((q) => Object.keys(q).length > 0, { message: "query must have at least one filter" }),
  webhook_url: z.url().max(1000).optional(),
  label: z.string().trim().max(120).optional(),
});

export type SubscriptionRow = {
  id: string;
  publisher_id: string;
  query: Record<string, string> & { label?: string };
  webhook_url: string | null;
  secret: string;
  active: boolean;
  created_at: Date;
  last_matched_at: Date | null;
  last_polled_at: Date | null;
  failures: number;
  webhook_verified_at: Date | null;
  webhook_challenge: string | null;
};

export type PublicSubscription = {
  id: string;
  label: string | null;
  query: Record<string, string>;
  describes: string;
  webhook_url: string | null;
  webhook_verified: boolean;
  poll_url: string;
  active: boolean;
  created_at: string;
  last_matched_at: string | null;
  failures: number;
  secret?: string;
};

export function publicSubscription(s: SubscriptionRow, opts: { withSecret?: boolean } = {}): PublicSubscription {
  const { label, ...query } = s.query;
  const out: PublicSubscription = {
    id: s.id,
    label: label ?? null,
    query,
    describes: describeQuery(query as SearchQuery),
    webhook_url: s.webhook_url,
    webhook_verified: !!s.webhook_verified_at,
    poll_url: `${env.SITE_URL}/api/v1/subscriptions/${s.id}/pending`,
    active: s.active,
    created_at: s.created_at.toISOString(),
    last_matched_at: s.last_matched_at ? s.last_matched_at.toISOString() : null,
    failures: s.failures,
  };
  if (opts.withSecret) out.secret = s.secret;
  return out;
}

export async function createSubscription(publisher: PublisherRow, input: z.infer<typeof SubscriptionInputSchema>) {
  // Validate the query with the same grammar as /search (drops pagination-only keys).
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.query)) raw[k] = String(v);
  const parsed = parseSearchQuery(raw);
  const query: Record<string, string> = {};
  for (const k of Object.keys(SearchQuerySchema.shape)) {
    if (["limit", "cursor", "sort", "rerank", "include_expired"].includes(k)) continue;
    const v = (parsed as Record<string, unknown>)[k];
    if (v !== undefined) query[k] = String(v);
  }
  if (input.label) query.label = input.label;
  const [{ n }] = await withTimeout(sql()<{ n: number }[]>`select count(*)::int as n from subscriptions where publisher_id = ${publisher.id} and active`, { label: "subscriptions:count" });
  if (n >= 50) throw new HttpError(409, "too_many_subscriptions", "A publisher can hold at most 50 active subscriptions.", "Delete one you no longer need, or combine filters.");
  if (input.webhook_url) await assertSafeOutboundUrl(input.webhook_url, "webhook_url");
  const vec = query.q ? await embedQuery(query.q) : null;
  const [row] = await sql()<SubscriptionRow[]>`
    insert into subscriptions (id, publisher_id, query, query_embedding, webhook_url, secret, webhook_challenge)
    values (${newSubscriptionId()}, ${publisher.id}, ${sql().json(query)}, ${vec ? toVectorLiteral(vec) : null}::vector, ${input.webhook_url ?? null}, ${newSecret()}, ${input.webhook_url ? newSecret() : null})
    returning *`;
  if (row.webhook_url) return (await verifyWebhook(row)).sub;
  return row;
}

/**
 * Webhook consent. Before Crier will ever deliver to a URL, the endpoint has to prove it wants the
 * traffic by echoing a challenge. This is what stops subscriptions being used to flood third parties.
 */
export async function verifyWebhook(sub: SubscriptionRow): Promise<{ sub: SubscriptionRow; verified: boolean; status: number }> {
  if (!sub.webhook_url) return { sub, verified: false, status: 0 };
  const challenge = sub.webhook_challenge ?? newSecret();
  const body = JSON.stringify({ type: "webhook.verify", subscription_id: sub.id, challenge, meta: { docs: `${env.SITE_URL}/llms.txt`, how: "Respond 2xx with the challenge string in the body (raw, or as JSON {\"challenge\": ...}) to confirm you want deliveries." } });
  let status = 0; let ok = false;
  try {
    const target = await assertSafeOutboundUrl(sub.webhook_url, "webhook_url");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(target, {
      method: "POST", body, redirect: "manual", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "User-Agent": "Crier-Webhook/1.0 (+https://crier.network/llms.txt)", "X-Crier-Signature": signPayload(sub.secret, body), "X-Crier-Subscription": sub.id, "X-Crier-Event": "webhook.verify" },
    });
    clearTimeout(t);
    status = res.status;
    if (res.ok) {
      const text = (await res.text()).slice(0, 4096);
      ok = text.includes(challenge);
    }
  } catch { ok = false; }
  const [updated] = await sql()<SubscriptionRow[]>`
    update subscriptions set webhook_challenge = ${challenge}, webhook_verified_at = ${ok ? sql()`now()` : sql()`webhook_verified_at`} where id = ${sub.id} returning *`;
  return { sub: updated, verified: !!updated.webhook_verified_at, status };
}

export async function getSubscription(id: string): Promise<SubscriptionRow | null> {
  const [row] = await withTimeout(sql()<SubscriptionRow[]>`select * from subscriptions where id = ${id}`, { label: "getSubscription" });
  return row ?? null;
}

export async function listSubscriptions(publisherId: string): Promise<SubscriptionRow[]> {
  return withTimeout(sql()<SubscriptionRow[]>`select * from subscriptions where publisher_id = ${publisherId} order by created_at desc`, { label: "listSubscriptions" });
}

export async function deleteSubscription(publisher: PublisherRow, id: string) {
  const s = await getSubscription(id);
  if (!s) throw new HttpError(404, "not_found", "No such subscription.");
  if (s.publisher_id !== publisher.id) throw new HttpError(403, "forbidden", "This subscription belongs to another publisher.");
  await sql()`delete from subscriptions where id = ${id}`;
}

/** Matches since cursor, oldest first. The cursor is the client's watermark; nothing is consumed server-side. */
export async function pendingForSubscription(sub: SubscriptionRow, cursor: string | undefined, limit: number): Promise<{ posts: (PublicPost & { delivery_id: number; matched_at: string })[]; next_cursor: string | null }> {
  const cur = decodeCursor<{ d: number }>(cursor);
  const after = cur?.d ?? 0;
  const rows = await withTimeout(sql().unsafe<(PostRow & { delivery_id: number; matched_at: Date })[]>(
    `select ${POST_COLUMNS}, d.id as delivery_id, d.created_at as matched_at
       from deliveries d join posts p on p.id = d.post_id join publishers u on u.id = p.publisher_id
      where d.subscription_id = $1 and d.id > $2 and p.deleted_at is null
      order by d.id asc
      limit $3`, [sub.id, after, limit + 1]), { label: "pendingForSubscription" });
  const page = rows.slice(0, limit);
  const next = rows.length > limit ? encodeCursor({ d: page[page.length - 1].delivery_id }) : null;
  sideWrite("subscription:polled", () => sql()`update subscriptions set last_polled_at = now() where id = ${sub.id}`);
  if (page.length) {
    const ids = page.map((r) => r.delivery_id);
    // Registered, not merely bounded, and this is the one where that matters beyond a lost number.
    // Marking a delivery `polled` is what keeps it out of deliverWebhooks(), which takes `pending`
    // rows whose subscription has a verified webhook. The two sets are disjoint today — this
    // statement only touches subscriptions with no verified webhook — so losing it cannot double up
    // a delivery now. It can later: a subscriber who polls, then adds and verifies a webhook, hands
    // the sender a backlog of rows still marked `pending` and gets every one of them a second time,
    // by push, because `next_attempt_at` is long past. The cursor is unaffected either way; it is
    // the client's watermark and consumes nothing server-side.
    sideWrite("deliveries:polled", () => sql()`update deliveries set status = 'polled' where id = any(${ids}::bigint[]) and status = 'pending' and subscription_id in (select id from subscriptions where webhook_url is null or webhook_verified_at is null)`);
  }
  return {
    posts: page.map((r) => ({ ...publicPost(r), delivery_id: r.delivery_id, matched_at: r.matched_at.toISOString() })),
    next_cursor: next,
  };
}

/* ---------------- matching + delivery (run by the cron) ---------------- */

/** Match newly created posts against every active subscription and enqueue deliveries. Returns counts. */
export async function matchNewPosts(): Promise<{ scanned: number; matched: number }> {
  const s = sql();
  const [state] = await s<{ value: { after?: string; id?: string } }[]>`select value from cron_state where key = 'deliver'`;
  const after = state?.value?.after ? new Date(state.value.after) : new Date(Date.now() - 3600e3);
  const afterId = state?.value?.id ?? "";
  const posts = await s<{ id: string; created_at: Date }[]>`
    select id, created_at from posts
     where deleted_at is null and hidden_at is null and (created_at, id) > (${after}, ${afterId})
     order by created_at asc, id asc limit 500`;
  if (posts.length === 0) return { scanned: 0, matched: 0 };
  const ids = posts.map((p) => p.id);

  const inserted = await s.unsafe<{ n: number }[]>(
    `with m as (
       insert into deliveries (subscription_id, post_id)
       select s.id, p.id
         from posts p
         join publishers u on u.id = p.publisher_id
         cross join subscriptions s
        where p.id = any($1::text[]) and s.active
          and p.created_at >= s.created_at          -- subscriptions are about the future
          and (s.query->>'kind' is null or p.kind = any(string_to_array(s.query->>'kind', ',')))
          and (s.query->>'tags' is null or p.tags && string_to_array(lower(s.query->>'tags'), ','))
          and (coalesce(s.query->>'verified','') <> 'true' or u.domain_verified_at is not null)
          and (s.query->>'publisher' is null or p.publisher_id = s.query->>'publisher')
          and (case when s.query->>'thread' is not null then p.parent_id = s.query->>'thread'
                    when coalesce(s.query->>'include_replies','') = 'true' then true
                    else p.parent_id is null end)
          and (coalesce(s.query->>'include_syndicated','true') <> 'false' or p.syndicated = false)
          and (s.query->>'after' is null or coalesce(p.ends_at, p.starts_at, p.created_at) >= (s.query->>'after')::timestamptz)
          and (s.query->>'before' is null or coalesce(p.starts_at, p.created_at) <= (s.query->>'before')::timestamptz)
          and (s.query->>'near' is null or (
                p.lat is not null and
                6371 * acos(least(1.0, greatest(-1.0,
                  cos(radians(split_part(s.query->>'near', ',', 1)::float)) * cos(radians(p.lat)) *
                  cos(radians(p.lng) - radians(split_part(s.query->>'near', ',', 2)::float)) +
                  sin(radians(split_part(s.query->>'near', ',', 1)::float)) * sin(radians(p.lat)))))
                <= coalesce((s.query->>'radius_km')::float, 25)))
          and (s.query->>'q' is null
               or p.tsv @@ websearch_to_tsquery('english', s.query->>'q')
               or (s.query_embedding is not null and p.embedding is not null and (p.embedding <=> s.query_embedding) <= $2))
       on conflict do nothing
       returning subscription_id)
     select count(*)::int as n from m`, [ids, SEMANTIC_MATCH_DISTANCE]);
  const matched = inserted[0]?.n ?? 0;
  if (matched) {
    await s`update subscriptions set last_matched_at = now() where id in (select distinct subscription_id from deliveries where post_id = any(${ids}::text[]))`;
  }
  const last = posts[posts.length - 1];
  await s`insert into cron_state (key, value, updated_at) values ('deliver', ${s.json({ after: last.created_at.toISOString(), id: last.id })}, now())
          on conflict (key) do update set value = excluded.value, updated_at = now()`;
  return { scanned: posts.length, matched };
}

const BACKOFF_MINUTES = [1, 5, 30, 120, 720];

export function signPayload(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

/** Push pending deliveries to subscriptions that have a webhook. */
export async function deliverWebhooks(): Promise<{ attempted: number; delivered: number; failed: number }> {
  const s = sql();
  const due = await s.unsafe<(PostRow & { delivery_id: number; attempts: number; subscription_id: string; webhook_url: string; secret: string; sub_query: Record<string, string> })[]>(
    `select ${POST_COLUMNS}, d.id as delivery_id, d.attempts, d.subscription_id, sub.webhook_url, sub.secret, sub.query as sub_query
       from deliveries d
       join subscriptions sub on sub.id = d.subscription_id
       join posts p on p.id = d.post_id
       join publishers u on u.id = p.publisher_id
      where d.status = 'pending' and d.next_attempt_at <= now() and sub.webhook_url is not null and sub.webhook_verified_at is not null and sub.active
      order by d.id asc
      limit 100`);
  let delivered = 0, failed = 0;
  await Promise.all(due.map(async (d) => {
    const payload = {
      type: "post.matched",
      subscription_id: d.subscription_id,
      delivery_id: d.delivery_id,
      matched_query: (() => { const { label, ...q } = d.sub_query; return q; })(),
      post: publicPost(d),
      meta: { docs: `${env.SITE_URL}/llms.txt` },
    };
    const body = JSON.stringify(payload);
    let status = 0;
    try {
      // Re-check the destination at delivery time (DNS can change after verification). A refusal is a failed attempt, not a fetch.
      const target = await assertSafeOutboundUrl(d.webhook_url, "webhook_url");
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Crier-Webhook/1.0 (+https://crier.network/llms.txt)",
          "X-Crier-Signature": signPayload(d.secret, body),
          "X-Crier-Subscription": d.subscription_id,
          "X-Crier-Delivery": String(d.delivery_id),
        },
        body,
        signal: ctrl.signal,
        redirect: "manual",
      });
      clearTimeout(t);
      status = res.status;
    } catch { status = 0; }
    if (status >= 200 && status < 300) {
      delivered++;
      await s`update deliveries set status = 'delivered', delivered_at = now(), attempts = attempts + 1, last_status = ${status} where id = ${d.delivery_id}`;
      await s`update subscriptions set failures = 0 where id = ${d.subscription_id}`;
    } else {
      const attempts = d.attempts + 1;
      if (attempts >= BACKOFF_MINUTES.length) {
        failed++;
        await s`update deliveries set status = 'failed', attempts = ${attempts}, last_status = ${status} where id = ${d.delivery_id}`;
      } else {
        await s`update deliveries set attempts = ${attempts}, last_status = ${status}, next_attempt_at = now() + make_interval(mins => ${BACKOFF_MINUTES[attempts]}) where id = ${d.delivery_id}`;
      }
      await s`update subscriptions set failures = failures + 1, active = (failures + 1) < 50 where id = ${d.subscription_id}`;
    }
  }));
  if (delivered) await s`select bump_stat('deliveries', ${delivered})`;
  return { attempted: due.length, delivered, failed };
}

/**
 * Housekeeping: drop old delivery rows, stale rate-limit windows, and actor/unmet-query tokens past
 * 90 days. The search log outlives them at 365 days because it holds no token to expire — a row is a
 * query shape and a day — and a year is what makes "asked every spring" visible at all (FR-40).
 */
export async function housekeeping() {
  const s = sql();
  await s`delete from deliveries where created_at < now() - interval '30 days'`;
  await s`delete from rate_limits where window_start < now() - interval '2 days'`;
  await s`delete from daily_actors where day < current_date - 90`;
  await s`delete from unmet_queries where day < current_date - 90`;
  await s`delete from search_log where day < current_date - 365`;
}
