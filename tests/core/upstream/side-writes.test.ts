import { test } from "node:test";
import assert from "node:assert/strict";

// Same trick as tests/db-timeout.test.ts: the wrapper reads its budgets once, at import. Set this
// first so the case that waits out a side write's budget runs in milliseconds.
process.env.CRIER_DB_SIDE_TIMEOUT_MS = "60";

const { DB_SIDE_TIMEOUT_MS, withTimeout } = await import("../../../lib/db-timeout.ts");
const {
  MAX_PENDING_POSTS, SIDE_WRITE_TIMEOUT_KEY,
  applyCounts, drainCounts, drainSideWritesLost, makeSideWrite, noteRetrievals, noteView,
} = await import("../../../lib/side-writes.ts");
type Tx = Parameters<typeof applyCounts>[0];

/**
 * The two things lib/side-writes.ts has handed to it, wired as lib/db.ts wires them — except for
 * the keepalive, which each case supplies so it can see what was registered and when. The bound is
 * the real one: a side write's whole point is that the bound is honoured, so mocking it would test
 * nothing.
 */
const sideWriteWith = (keepalive: (task: () => Promise<void>) => void) =>
  makeSideWrite({ keepalive, bound: withTimeout, defaultMs: DB_SIDE_TIMEOUT_MS });

/**
 * `flush()` itself cannot be imported here — lib/metrics.ts pulls in `next/server`, which is not
 * resolvable outside the bundler (the same reason tests/metrics-view.test.ts keeps its subject in a
 * module of its own). So the flush's counter half lives in lib/side-writes.ts, and what is checked
 * here is the statements it issues against a recorder: what the flush delegates is what the flush
 * does. The rest of flush() — the transaction, the budget, the drain order — is the part a unit
 * test could only restate.
 */

/** Stands in for a postgres.js transaction: records the statements, and can be told to fail on one. */
function fakeTx(opts: { failOn?: RegExp } = {}) {
  const statements: { sql: string; args: unknown[] }[] = [];
  const savepoints: string[] = [];
  let rolledBack = false;
  const tag = (strings: TemplateStringsArray, ...args: unknown[]) => {
    const sql = strings.join("?").replace(/\s+/g, " ").trim();
    statements.push({ sql, args });
    if (opts.failOn?.test(sql)) return Promise.reject(new Error("deadlock detected"));
    return Promise.resolve([]);
  };
  const tx = Object.assign(tag, {
    async savepoint(fn: (sp: Tx) => Promise<unknown>) {
      savepoints.push("s" + savepoints.length);
      try {
        return await fn(tx as unknown as Tx);
      } catch (e) {
        // What postgres.js does: roll back to the savepoint, then rethrow for the caller to catch.
        rolledBack = true;
        throw e;
      }
    },
  });
  return { tx: tx as unknown as Tx, statements, savepoints, get rolledBack() { return rolledBack; } };
}

/** Run something that may warn, and hand back both what it returned and what it said. */
async function capturingWarnings<T>(fn: () => Promise<T>): Promise<{ result: T; warnings: string[] }> {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")); };
  try {
    return { result: await fn(), warnings };
  } finally {
    console.warn = original;
  }
}

/** The buffers are module state; empty them so a case starts from nothing whatever ran before it. */
function reset() {
  drainCounts();
  drainSideWritesLost();
}

/* ---------------- the buffers ---------------- */

test("views accumulate per id rather than one write per view", () => {
  reset();
  noteView("aaaaaaaa");
  noteView("bbbbbbbb");
  noteView("aaaaaaaa");
  noteView("aaaaaaaa");
  const counts = drainCounts();
  assert.deepEqual(counts.views.sort(), [["aaaaaaaa", 3], ["bbbbbbbb", 1]]);
  assert.deepEqual(counts.retrievals, [], "a view is not a retrieval");
});

test("draining empties the buffer, so the next flush does not count the same views again", () => {
  reset();
  noteView("aaaaaaaa");
  assert.deepEqual(drainCounts().views, [["aaaaaaaa", 1]]);
  assert.deepEqual(drainCounts().views, [], "the second drain has nothing left to take");
});

test("a page of results is one retrieval each, and repeated ids add up", () => {
  reset();
  noteRetrievals(["aaaaaaaa", "bbbbbbbb"]);
  noteRetrievals(["bbbbbbbb", "cccccccc"]);
  const counts = drainCounts();
  assert.deepEqual(counts.retrievals.sort(), [["aaaaaaaa", 1], ["bbbbbbbb", 2], ["cccccccc", 1]]);
});

test("past the cap, new ids are dropped and counted; ids already held keep counting", () => {
  reset();
  noteView("first");
  for (let i = 0; i < MAX_PENDING_POSTS - 1; i++) noteView(`id${i}`);   // fills it exactly
  noteView("first");            // already held: still counted
  noteView("one-too-many");     // new, and there is no room
  const counts = drainCounts();
  assert.equal(counts.views.length, MAX_PENDING_POSTS, "the buffer is bounded by the cap");
  assert.deepEqual(counts.views.find((v) => v[0] === "first"), ["first", 2]);
  assert.equal(counts.views.find((v) => v[0] === "one-too-many"), undefined);
  assert.equal(drainSideWritesLost(), 1, "and the dropped bump is counted as a lost side write");
});

/* ---------------- what the flush issues ---------------- */

test("the flush issues one batched statement each for views and retrievals, inside a savepoint", async () => {
  reset();
  noteView("aaaaaaaa");
  noteView("aaaaaaaa");
  noteView("bbbbbbbb");
  noteRetrievals(["cccccccc"]);
  const t = fakeTx();

  assert.equal(await applyCounts(t.tx, drainCounts()), true);
  assert.equal(t.savepoints.length, 1, "both statements share one savepoint");
  assert.equal(t.statements.length, 2, "one statement per counter, not one per post");

  const [views, retrievals] = t.statements;
  assert.match(views.sql, /update posts p set views = p\.views \+ v\.n/);
  assert.match(views.sql, /for update skip locked/, "a view bump still never waits on a row lock");
  assert.deepEqual(views.args[0], ["aaaaaaaa", "bbbbbbbb"], "ids go in as one array");
  assert.deepEqual(views.args[1], [2, 1], "and their counts alongside, in the same order");
  assert.deepEqual(views.args[2], ["aaaaaaaa", "bbbbbbbb"], "the lock subquery takes the same ids");
  assert.match(retrievals.sql, /update posts p set retrievals = p\.retrievals \+ r\.n/);
  assert.match(retrievals.sql, /for update skip locked/);
  assert.deepEqual(retrievals.args[0], ["cccccccc"]);
  assert.equal(drainSideWritesLost(), 0, "nothing was lost");
});

test("nothing pending issues nothing at all", async () => {
  reset();
  const t = fakeTx();
  assert.equal(await applyCounts(t.tx, drainCounts()), true);
  assert.deepEqual(t.statements, [], "an idle instance does not open a savepoint to write nothing");
});

test("only retrievals pending: no empty views statement", async () => {
  reset();
  noteRetrievals(["aaaaaaaa"]);
  const t = fakeTx();
  assert.equal(await applyCounts(t.tx, drainCounts()), true);
  assert.equal(t.statements.length, 1);
  assert.match(t.statements[0].sql, /set retrievals/);
});

test("a failed views statement rolls back to its savepoint and lets the transaction commit", async () => {
  reset();
  noteView("aaaaaaaa");
  noteRetrievals(["bbbbbbbb"]);
  const counts = drainCounts();
  const t = fakeTx({ failOn: /set views/ });

  // The case the savepoint exists for: cron:tick and the counters are in this same transaction, and
  // a view bump that met a lock must not be able to take them with it. applyCounts absorbs the
  // rethrow rather than propagating it, so flush() goes on to commit everything else.
  const { result, warnings } = await capturingWarnings(() => applyCounts(t.tx, counts));
  assert.equal(result, false, "it reports the loss instead of throwing");
  assert.equal(t.rolledBack, true, "and the savepoint was rolled back");
  assert.equal(drainSideWritesLost(), 1, `so ${SIDE_WRITE_TIMEOUT_KEY} records it on the next flush`);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /side write failed flush:counts/);
  assert.match(warnings[0], /deadlock detected/, "the reason survives into the log");
});

test("a failed counter statement is a lost batch, not a retry that could double-count", async () => {
  reset();
  noteView("aaaaaaaa");
  const t = fakeTx({ failOn: /set views/ });
  await capturingWarnings(() => applyCounts(t.tx, drainCounts()));
  assert.equal(t.statements.filter((s) => /set views/.test(s.sql)).length, 1, "exactly one attempt");
});

/* ---------------- the sideWrite helper ---------------- */

test("a side write is registered with the platform, not simply fired", async () => {
  reset();
  const registered: (() => Promise<void>)[] = [];
  const sideWrite = sideWriteWith((task) => { registered.push(task); });
  let ran = 0;

  sideWrite("subscription:polled", () => { ran++; return Promise.resolve([]); });
  assert.equal(registered.length, 1, "the work went to `after`, not to a bare void promise");
  assert.equal(ran, 0, "and the query is not even built yet: the registration decides when");

  await registered[0]();
  assert.equal(ran, 1);
  assert.equal(drainSideWritesLost(), 0);
});

test("a side write that never answers is bounded, cancelled, counted and warned about", async () => {
  reset();
  const registered: (() => Promise<void>)[] = [];
  const sideWrite = sideWriteWith((task) => { registered.push(task); });
  let cancelled = 0;

  sideWrite("deliveries:polled", () => Object.assign(
    // Never settles, which is the shape lib/db-timeout.ts exists for: a pooler that authenticated
    // the client and then went quiet looks exactly like this.
    new Promise<unknown>(() => {}),
    { execute: () => {}, cancel: () => { cancelled++; } },
  ));

  const started = Date.now();
  const { warnings } = await capturingWarnings(() => registered[0]());
  const elapsed = Date.now() - started;

  assert.equal(cancelled, 1, "the query is cancelled so its pool slot comes back");
  assert.ok(elapsed >= DB_SIDE_TIMEOUT_MS, `gave up after ${elapsed} ms, before the ${DB_SIDE_TIMEOUT_MS} ms budget`);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /side write failed deliveries:polled/);
  assert.match(warnings[0], /\d+ ms after it was queued/, "elapsed time is what tells a frozen timer from a slow query");
  assert.equal(drainSideWritesLost(), 1, "and the loss is counted, not only logged");
});

test("a side write is warned about, never thrown, so nothing upstream fails because of one", async () => {
  reset();
  const registered: (() => Promise<void>)[] = [];
  const sideWrite = sideWriteWith((task) => { registered.push(task); });
  sideWrite("unmet_queries", () => Promise.reject(new Error("relation does not exist")));

  const { warnings } = await capturingWarnings(async () => {
    await assert.doesNotReject(registered[0]());
  });
  assert.match(warnings[0], /side write failed unmet_queries .*relation does not exist/);
  assert.equal(drainSideWritesLost(), 1);
});

test("a side write that succeeds counts nothing and says nothing", async () => {
  reset();
  const registered: (() => Promise<void>)[] = [];
  const sideWrite = sideWriteWith((task) => { registered.push(task); });
  sideWrite("subscription:polled", () => Promise.resolve([]));

  const { warnings } = await capturingWarnings(() => registered[0]());
  assert.deepEqual(warnings, [], "the healthy path is silent");
  assert.equal(drainSideWritesLost(), 0);
});
