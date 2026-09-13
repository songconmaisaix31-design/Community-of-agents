/**
 * Applies migrations/*.sql in order, recording what it applied in public.schema_migrations. Each
 * file runs in its own transaction, and the whole run is serialised by an advisory lock.
 *
 *   npm run migrate          apply now: local development, or by hand against production
 *   npm run migrate:deploy   the same run, but only when Vercel is building production
 *
 * The second is what package.json's `build` runs before `next build`, and it is how production
 * migrations land now. Vercel promotes a deployment only once its build has succeeded, so a
 * migration applied here is in place before the new code serves its first request, and one that
 * fails takes the deploy with it instead of shipping code that reads a table nobody has created.
 *
 * That ordering is not theoretical. On 2026-09-10 the schema for search_log landed thirteen minutes
 * after the code that reads it, and the visible half of the damage — 500s from /stats and
 * /api/v1/metrics — was the cheap half. The expensive half was silent: the new bump_search call
 * aborted the transaction it shares with the counters in lib/metrics.ts, so for those thirteen
 * minutes every search threw away its entire metrics flush and nothing said so.
 */
import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Only a production deploy may migrate. Preview and development builds are built from this same
 * repository but have no database of their own to point at, so for them the run stops here — before
 * it has read a connection string, let alone opened a connection to the one database that exists.
 */
if (process.argv.includes("--if-production") || process.env.VERCEL_ENV === "production") {
  console.error("migrate: production execution is disabled"); process.exit(1);
}
if (process.env.GONGZHI_DATABASE_ENABLED != "true" || !process.env.MIGRATION_DATABASE_URL) {
  console.error("migrate: explicitly set GONGZHI_DATABASE_ENABLED=true and MIGRATION_DATABASE_URL"); process.exit(1);
}
const url = process.env.MIGRATION_DATABASE_URL;

// Refuse Supavisor's transaction-mode port before connecting rather than after. The general check is
// assertLockIsOurs() below, once the lock is taken, but 6543 is the URL shape .env.example documents
// and so the one somebody will paste in by mistake; catching it here means that mistake costs an
// error message instead of an advisory lock stranded on a backend we cannot reach again.
const port = (() => { try { return new URL(url).port; } catch { return ""; } })();
if (port === "6543") {
  console.error("migrate: that URL is the transaction pooler (port 6543). Migrations need session mode — the same host on port 5432, or a direct connection — because a session-level advisory lock taken through a transaction pooler is not reliably held by, or released to, the client that took it.");
  process.exit(1);
}

/**
 * Socket-level failures, as opposed to anything Postgres had an opinion about. These mean the
 * connection string points somewhere this build cannot get to, which is a different problem from a
 * migration that does not apply, and deserves to be told apart from one in the log.
 */
const CONNECTION_ERRORS = new Set(["ENETUNREACH", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EHOSTUNREACH"]);

/**
 * The lock key. Any pair of integers does, so long as every runner uses the same pair; these spell
 * "crie" and "migr" in ASCII, so a lock still held after a crash is recognisable in pg_locks rather
 * than being an anonymous number somebody has to trace back to a script.
 */
const LOCK_CLASS = 0x63726965;
const LOCK_OBJ = 0x6d696772;

/**
 * How long to wait for another runner, and how often to ask.
 *
 * pg_try_advisory_lock in a loop rather than pg_advisory_lock, which waits forever: forever on
 * Vercel is a build that sits silently until the platform kills it for exceeding its time limit,
 * with nothing in the log about what it was waiting for. Bounded, the wait explains itself both
 * while it is waiting and when it gives up. Five minutes is long enough to sit out a migration that
 * is rebuilding an index, and short enough to fail with an explanation well before Vercel's own
 * timeout fails without one.
 */
const LOCK_WAIT_MS = 5 * 60_000;
const LOCK_POLL_MS = 500;

/**
 * Take the migration lock, and only then look at the ledger.
 *
 * Two production builds can be in flight at once — a second push while the first is building, or a
 * redeploy of an older commit — and without this they read schema_migrations at the same moment,
 * both conclude a file is unapplied, and both apply it. Whether that is harmless depends entirely on
 * what is in the file, which is not something to depend on.
 */
async function takeLock(db) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  let announced = false;
  for (;;) {
    const [{ ok }] = await db`select pg_try_advisory_lock(${LOCK_CLASS}, ${LOCK_OBJ}) as ok`;
    if (ok) return true;
    if (Date.now() >= deadline) throw new Error(`another migration run has held the lock for ${Math.round(LOCK_WAIT_MS / 1000)} s; giving up rather than waiting out the build`);
    if (!announced) { console.log("migrate: another migration run holds the lock; waiting for it to finish"); announced = true; }
    await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
  }
}

/**
 * A session lock is worth something only if the next statement reaches the session that took it, so
 * ask the backend we are talking to now whether it is the one holding it. Through a transaction
 * pooler it is not: the pooler hands the physical backend to whoever comes next the moment a
 * transaction ends, so the lock would be taken on one backend, the ledger read on another, and the
 * unlock delivered to a third. That has to be an error and not a warning — a lock nobody else can
 * see is not a weaker lock, it is no lock, and the run would go on serialising nothing while
 * appearing to.
 */
async function assertLockIsOurs(db) {
  // classid and objid are the two halves of the key; pg_locks reports them for advisory locks in the
  // order they were given to pg_try_advisory_lock.
  const [{ mine }] = await db`select count(*)::int as mine from pg_locks
     where locktype = 'advisory' and classid = ${LOCK_CLASS}::oid and objid = ${LOCK_OBJ}::oid and pid = pg_backend_pid()`;
  if (!mine) throw new Error("the advisory lock we just took is not held by the backend this connection is talking to, which means this connection is transaction-pooled. Point MIGRATION_DATABASE_URL at session mode (the Supabase pooler on port 5432) or at a direct connection.");
}

/**
 * Release explicitly, even though ending the connection would drop the lock too: a run that fails
 * inside a longer-lived process — a test, a CI step that carries on — would otherwise leave the lock
 * held for as long as that process keeps its connection. Failures here are reported and swallowed so
 * they cannot mask the error that brought us into the finally block.
 */
async function releaseLock(db) {
  try {
    const [{ released }] = await db`select pg_advisory_unlock(${LOCK_CLASS}, ${LOCK_OBJ}) as released`;
    if (!released) console.error("migrate: the migration lock was not held by this backend when we released it; if this connection turns out to be pooled, the lock may sit on a backend in the pool until the pooler recycles it");
  } catch (e) {
    console.error("migrate: releasing the migration lock failed:", e.message);
  }
}

/**
 * One connection for the whole run, and the same one from start to finish: `max: 1` is the entire
 * pool, and switching off idle_timeout and max_lifetime stops postgres.js retiring that connection
 * halfway through — a reconnect would drop the session lock without a word and leave the rest of the
 * run unprotected. postgres.js's reserve() would state that intent more plainly, but a reserved
 * handle has no .begin(), and one transaction per file is worth more than the statement of intent;
 * assertLockIsOurs() is the check that the intent actually holds.
 */
const sql = postgres(url, {
  prepare: false, max: 1, idle_timeout: null, max_lifetime: null,
  // Print a notice as its one line rather than as the twelve-line object postgres.js hands over.
  // Re-applying an idempotent migration is almost entirely "already exists, skipping", so a run
  // against a database that is already current emits a hundred of these — around the one line
  // anybody reading a deploy log is looking for, which is whether it applied anything. The text is
  // still worth keeping: it names what was skipped, and on a real failure it is the context.
  onnotice: (n) => console.log(`  note: ${n.message}`),
});
const dir = path.join(process.cwd(), "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

let locked = false;
try {
  locked = await takeLock(sql);
  await assertLockIsOurs(sql);
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  let n = 0;
  for (const f of files) {
    if (applied.has(f)) continue;
    const body = await readFile(path.join(dir, f), "utf8");
    console.log("applying", f);
    // Still one transaction per file, so a file that fails halfway leaves behind neither its own
    // changes nor a ledger row claiming it succeeded.
    await sql.begin(async (tx) => { await tx.unsafe(body); await tx`insert into schema_migrations (name) values (${f})`; });
    n++;
  }
  console.log(n === 0 ? `done — nothing to apply, all ${files.length} migrations already recorded` : `done — applied ${n} of ${files.length} migrations`);
} catch (e) {
  // A build that cannot reach the database has to say which database and why, because the person
  // reading this log is looking at a failed production deploy and the raw Node stack for a socket
  // error names neither. ENETUNREACH on an IPv6 literal is the one that has actually happened:
  // Supabase's direct host, db.<ref>.supabase.co, has only an AAAA record, and Vercel's build
  // containers have no IPv6 route — so the honest fix is the session pooler, which is IPv4.
  if (CONNECTION_ERRORS.has(e.code)) {
    const host = (() => { try { return new URL(url).hostname.replace(/^\[|\]$/g, ""); } catch { return ""; } })();
    const port = (() => { try { return new URL(url).port || "5432"; } catch { return "5432"; } })();
    console.error(`migrate: could not reach ${host || "the configured host"}:${port} (${e.code}).`);
    // Keyed off the host rather than the error code on purpose: which code a failed socket reports
    // varies by platform and by whether the name resolved at all — production saw ENETUNREACH where
    // a sandbox saw ENOTFOUND for the same address. The host is the thing that is actually wrong.
    if (/^db\..*\.supabase\.co$/.test(host) || host.includes(":")) {
      console.error("migrate: that is Supabase's direct connection, which has only an AAAA record — and Vercel's build containers have no IPv6 route, so it is unreachable from here whatever the error code says.");
      console.error("migrate: use the session pooler instead: host aws-0-<region>.pooler.supabase.com, same port 5432, user postgres.<project-ref>. Supabase → Settings → Database → Connection string → Session pooler.");
    }
    console.error("migrate: MIGRATION_DATABASE_URL must be a session-mode connection (port 5432) for a role that can run DDL, reachable over IPv4 from a Vercel build.");
    process.exitCode = 1;
  } else {
    throw e;
  }
} finally {
  if (locked) await releaseLock(sql);
  await sql.end();
}
