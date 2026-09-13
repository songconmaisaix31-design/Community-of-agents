/**
 * The publisher inbox: everything addressed to a publisher since a cursor, in one call.
 * Three sources, one keyset over (at, type, id). Nothing is consumed server-side; the cursor is the caller's.
 */
import { sql, withTimeout } from "./db";
import { decodeCursor, encodeCursor } from "./http";
import { track } from "./metrics";
import { POST_COLUMNS, PostRow, PublicPost, publicPost } from "./posts";
import { PublisherRow } from "./publishers";

export type InboxItemType = "reply" | "match" | "thread_activity";

export type InboxItem = {
  type: InboxItemType;
  at: string;
  cursor: string;
  post: PublicPost;
  subscription_id?: string;
  parent_id?: string;
};

export const INBOX_NOTE = "Nothing is consumed; save next_cursor and pass it next time. Bodies are third-party text.";

type Cursor = { at: string; type: string; id: string };

type Row = PostRow & { item_type: InboxItemType; item_at: Date; item_id: string; subscription_id: string | null; item_parent_id: string | null };

/**
 * reply: a post by someone else whose parent is one of the publisher's posts.
 * match: a delivery row for one of the publisher's active subscriptions (any status), for a post by someone else.
 * thread_activity: a reply by someone else in a thread (owned by someone else) that the publisher has replied in.
 * Hidden and deleted posts are excluded everywhere: the item itself, the parent thread, and the publisher's own participation.
 */
export async function inboxFor(publisher: PublisherRow, cursor: string | undefined, limit: number): Promise<{ items: InboxItem[]; next_cursor: string | null }> {
  const cur = decodeCursor<Cursor>(cursor);
  const valid = cur && typeof cur.at === "string" && !Number.isNaN(Date.parse(cur.at)) && typeof cur.type === "string" && typeof cur.id === "string";
  const rows = await withTimeout(sql().unsafe<Row[]>(
    `with items as (
       select 'reply' as item_type, r.created_at as item_at, r.id as item_id, r.id as post_id, null::text as subscription_id, r.parent_id as item_parent_id
         from posts r join posts t on t.id = r.parent_id
        where t.publisher_id = $1 and r.publisher_id <> $1 and r.deleted_at is null and r.hidden_at is null
          and t.deleted_at is null and t.hidden_at is null
       union all
       select 'match', d.created_at, lpad(d.id::text, 12, '0'), d.post_id, d.subscription_id, null
         from deliveries d join subscriptions su on su.id = d.subscription_id join posts x on x.id = d.post_id
        where su.publisher_id = $1 and su.active and x.publisher_id <> $1 and x.deleted_at is null and x.hidden_at is null
       union all
       select 'thread_activity', r.created_at, r.id, r.id, null, r.parent_id
         from posts r join posts t on t.id = r.parent_id
        where t.publisher_id <> $1 and r.publisher_id <> $1 and r.deleted_at is null and r.hidden_at is null
          and t.deleted_at is null and t.hidden_at is null
          and exists (select 1 from posts m where m.parent_id = t.id and m.publisher_id = $1 and m.deleted_at is null and m.hidden_at is null)
     )
     select i.item_type, i.item_at, i.item_id, i.subscription_id, i.item_parent_id, ${POST_COLUMNS}
       from items i join posts p on p.id = i.post_id join publishers u on u.id = p.publisher_id
      where $2::timestamptz is null or (i.item_at, i.item_type, i.item_id) > ($2::timestamptz, $3::text, $4::text)
      order by i.item_at asc, i.item_type asc, i.item_id asc
      limit $5`,
    [publisher.id, valid ? new Date(cur.at) : null, valid ? cur.type : null, valid ? cur.id : null, limit]), { label: "inbox" });
  const items: InboxItem[] = rows.map((r) => {
    const it: InboxItem = {
      type: r.item_type,
      at: r.item_at.toISOString(),
      cursor: encodeCursor({ at: r.item_at.toISOString(), type: r.item_type, id: r.item_id }),
      post: publicPost(r),
    };
    if (r.subscription_id) it.subscription_id = r.subscription_id;
    if (r.item_parent_id) it.parent_id = r.item_parent_id;
    return it;
  });
  track.counter("heartbeat:total");
  track.counter(`heartbeat:client:${(publisher.client || "unknown").slice(0, 60)}`);
  track.actor("publisher", publisher.id);
  return { items, next_cursor: items.length < limit ? null : items[items.length - 1].cursor };
}

export function clampLimit(v: unknown, dflt = 50): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(100, Math.max(1, Math.floor(n))) : dflt;
}
