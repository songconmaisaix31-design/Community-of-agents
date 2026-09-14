import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Socket } from "node:net";
import { sql, withBoundedRead } from "../../lib/db.ts";

test("bounded read ends a silent local connection and honors cancellation without leaving work", async t => {
  // A local transport that accepts TCP but never authenticates is not a PG test.
  const sockets = new Set<Socket>();
  const server = createServer(socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const before = { url: process.env.DATABASE_URL, enabled: process.env.GONGZHI_DATABASE_ENABLED };
  process.env.GONGZHI_DATABASE_ENABLED = "true";
  process.env.DATABASE_URL = `postgres://bounded_test:synthetic@127.0.0.1:${(server.address() as {port:number}).port}/bounded_test`;
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(r => server.close(() => r()));
    if (before.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = before.url;
    if (before.enabled === undefined) delete process.env.GONGZHI_DATABASE_ENABLED; else process.env.GONGZHI_DATABASE_ENABLED = before.enabled;
  });
  const start = performance.now();
  await assert.rejects(withBoundedRead(async () => sql()`select 1`, { timeout_ms: 150 }), { name: "TimeoutError" });
  assert.ok(performance.now() - start < 1500);
  const controller = new AbortController();
  const pending = withBoundedRead(async () => sql()`select 1`, { signal: controller.signal, timeout_ms: 1000 });
  controller.abort(new DOMException("Test cancelled", "AbortError"));
  await assert.rejects(pending, { name: "AbortError" });
  await assert.rejects(withBoundedRead(async () => 1, { timeout_ms: 2001 }), RangeError);
  await assert.rejects(withBoundedRead(async () => { throw new Error("must not run"); }, { signal: controller.signal }), { name: "AbortError" });
});
