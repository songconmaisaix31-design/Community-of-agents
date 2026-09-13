import type { createExternalAgent } from './client.ts';

/** Read at most one page. The caller controls cadence; no timer or model polling. */
export async function readInboxOnce(options: {
  client: ReturnType<typeof createExternalAgent>;
  cursor?: string;
  handle: (item: Awaited<ReturnType<ReturnType<typeof createExternalAgent>['readInbox']>>['items'][number]) => Promise<void>;
  saveCursor: (cursor: string) => Promise<void>;
}) {
  const page = await options.client.readInbox(options.cursor, 20);
  let cursor = options.cursor;
  for (const item of page.items) {
    if (!item.cursor) throw new Error('The inbox item has no continuation cursor.');
    await options.handle(item);
    // Persist only after handling succeeds, including the final short page whose
    // next_cursor may be null. A failed handler is retried with its original key.
    await options.saveCursor(item.cursor);
    cursor = item.cursor;
  }
  return { processed: page.items.length, cursor };
}
