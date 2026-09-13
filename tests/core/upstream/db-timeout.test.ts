import { test } from "node:test";
import assert from "node:assert/strict";
import type { DbTimeoutError as DbTimeout } from "../../../lib/db-timeout.ts";

// The wrapper reads its budgets once, at import. Set them first so the cases run in milliseconds.
process.env.CRIER_DB_TIMEOUT_MS = "60";
process.env.CRIER_DB_RESET_AFTER_TIMEOUTS = "3";

const { DB_TIMEOUT_MS, DbTimeoutError, __resetDbHealth, withTimeout, withTimeoutOr } = await import("../../../lib/db-timeout.ts");

type FakeQuery<T> = PromiseLike<T> & {
  execute: () => void;
  cancel: () => unknown;
  executed: number;
  cancelled: number;
};

/** Stands in for a postgres.js pending query: a thenable with execute() and cancel(). */
function fakeQuery<T>(opts: { value?: T; delayMs?: number; cancel?: "ok" | "throws" | "rejects" } = {}): FakeQuery<T> {
  const inner = new Promise<T>((resolve) => {
    if (opts.delayMs !== undefined) setTimeout(() => resolve(opts.value as T), opts.delayMs);
    // No delay given: never settles, which is the case this whole module exists for.
  });
  const q: FakeQuery<T> = {
    executed: 0,
    cancelled: 0,
    execute() { q.executed++; },
    cancel() {
      q.cancelled++;
      if (opts.cancel === "throws") throw new Error("cancel blew up");
      if (opts.cancel === "rejects") return Promise.reject(new Error("cancel connection refused"));
      return Promise.resolve();
    },
    then: (onFulfilled, onRejected) => inner.then(onFulfilled, onRejected),
  };
  return q;
}

test("a query that never resolves rejects with DbTimeoutError and is cancelled", async () => {
  __resetDbHealth();
  const q = fakeQuery<string>();
  const started = Date.now();
  const err = await withTimeout(q, { label: "never" }).then(() => null, (e: unknown) => e);
  const elapsed = Date.now() - started;

  assert.ok(err instanceof DbTimeoutError, `expected DbTimeoutError, got ${String(err)}`);
  assert.equal((err as DbTimeout).ms, DB_TIMEOUT_MS);
  assert.equal((err as DbTimeout).code, "db_timeout");
  assert.match((err as DbTimeout).message, /never/);
  assert.equal(q.cancelled, 1, "the pending query must be cancelled so its pool slot comes back");
  assert.ok(elapsed >= DB_TIMEOUT_MS, `rejected after ${elapsed} ms, before the budget`);
  assert.ok(elapsed < DB_TIMEOUT_MS + 2000, `rejected after ${elapsed} ms, far past the budget`);
});

test("the clock starts when the query is queued, not on the first await", () => {
  __resetDbHealth();
  const q = fakeQuery<string>();
  const pending = withTimeout(q, { label: "enqueue" });
  // execute() has already run: a query still waiting for a connection is on the same budget as one
  // that has been sent, which is the wait postgres.js does not time out on its own.
  assert.equal(q.executed, 1);
  return pending.then(() => assert.fail("should not resolve"), (e: unknown) => assert.ok(e instanceof DbTimeoutError));
});

test("a query that answers in time passes its value through untouched", async () => {
  __resetDbHealth();
  const q = fakeQuery<{ n: number }>({ value: { n: 7 }, delayMs: 1 });
  assert.deepEqual(await withTimeout(q, { label: "fast" }), { n: 7 });
  assert.equal(q.cancelled, 0);
});

test("a cancel that throws or rejects does not mask the timeout", async () => {
  for (const mode of ["throws", "rejects"] as const) {
    __resetDbHealth();
    const q = fakeQuery<string>({ cancel: mode });
    const err = await withTimeout(q).then(() => null, (e: unknown) => e);
    assert.ok(err instanceof DbTimeoutError, `cancel ${mode}: expected DbTimeoutError`);
    assert.equal(q.cancelled, 1);
  }
});

test("withTimeoutOr falls back instead of throwing", async () => {
  __resetDbHealth();
  assert.deepEqual(await withTimeoutOr(fakeQuery<string[]>(), [], { label: "side" }), []);
  assert.deepEqual(await withTimeoutOr(fakeQuery<string[]>({ value: ["a"], delayMs: 1 }), [], { label: "side" }), ["a"]);
});

test("consecutive timeouts recycle the pool; a success in between does not", async () => {
  __resetDbHealth();
  const ended: string[] = [];
  const fakeClient = { end: () => { ended.push("end"); return Promise.resolve(); } };
  const setClient = () => { (globalThis as { __crier_sql?: unknown }).__crier_sql = fakeClient; };
  const client = () => (globalThis as { __crier_sql?: unknown }).__crier_sql;

  setClient();
  // Two timeouts, then a healthy read: the run is broken, so nothing is recycled.
  await withTimeoutOr(fakeQuery<string>(), null);
  await withTimeoutOr(fakeQuery<string>(), null);
  await withTimeout(fakeQuery<string>({ value: "ok", delayMs: 1 }));
  assert.equal(ended.length, 0, "a successful read must clear the run of timeouts");
  assert.equal(client(), fakeClient);

  // Three in a row with nothing succeeding: the pool is wedged, so it is thrown away.
  await withTimeoutOr(fakeQuery<string>(), null);
  await withTimeoutOr(fakeQuery<string>(), null);
  await withTimeoutOr(fakeQuery<string>(), null);
  assert.deepEqual(ended, ["end"], "the wedged client must be ended");
  assert.equal(client(), undefined, "the next caller must build a fresh pool");

  __resetDbHealth();
  (globalThis as { __crier_sql?: unknown }).__crier_sql = undefined;
});
