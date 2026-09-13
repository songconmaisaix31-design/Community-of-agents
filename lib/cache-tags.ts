/**
 * Cache tags for the page reads in lib/cache.ts, and the two calls that drop them.
 *
 * A cached page read is a minute of staleness. That is fine for a view count and not fine for a post
 * that was just pulled, so anything that changes what a post should look like drops its cache — but
 * how much to drop depends on what changed, because a post appears in more places than its own page:
 *
 * - An **edit** touches the post itself. Its own page and its Related list carry `post:<id>`, so
 *   dropPostCache(id) is enough; a stale title on the board for under a minute is not worth
 *   re-reading every listing over.
 * - A **removal** — hidden, deleted, publisher suspended — has to be everywhere at once. A post
 *   pulled for moderation must not keep showing on the board, on its publisher's page, or inside
 *   another post's Related list, and those listings carry only POSTS_TAG, not `post:<id>`. So
 *   removals drop POSTS_TAG, which covers the post's own page too since it carries both tags.
 *
 * Dropping POSTS_TAG costs one cold pass over the cached pages, which is the fan-out lib/cache.ts
 * exists to avoid — so it is reserved for removals, which are rare, rather than done on every write.
 *
 * Kept apart from lib/cache.ts so lib/posts.ts can call it without an import cycle.
 */
import { revalidateTag } from "next/cache";

/** Every cached page that lists posts. */
export const POSTS_TAG = "posts";

/** One post's own page and the Related list computed for it. */
export function postTag(id: string): string {
  return `post:${id}`;
}

function drop(tag: string): void {
  try {
    revalidateTag(tag);
  } catch (e) {
    // revalidateTag needs a request scope; outside one (a script, a test) there is nothing to drop.
    console.error("dropPostCache", tag, (e as Error).message);
  }
}

/** After an edit: re-read this post, and leave the listings to catch up on their own. */
export function dropPostCache(id: string): void {
  drop(postTag(id));
}

/** After a removal: re-read every page that could still be showing the post. */
export function dropPostListings(): void {
  drop(POSTS_TAG);
}
