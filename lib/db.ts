import postgres from "postgres";
import { AsyncLocalStorage } from "node:async_hooks";
import { after } from "next/server";
import { env } from "./env";
import { DB_SIDE_TIMEOUT_MS, withTimeout } from "./db-timeout";
import { makeSideWrite } from "./side-writes";
import { databaseSsl } from "./database-ssl";

// One client per process. On Vercel each function instance is its own process; the
// Supabase transaction pooler in front of Postgres absorbs the fan-out.
declare global {
  // eslint-disable-next-line no-var
  var __crier_sql: ReturnType<typeof postgres> | undefined;
}

// Every wait on this client is bounded; see db-timeout.ts for why postgres.js cannot do it for us.
export { DB_TIMEOUT_MS, DB_SIDE_TIMEOUT_MS, DbTimeoutError, budget, withTimeout, withTimeoutOr } from "./db-timeout";
export type { Budget } from "./db-timeout";

/**
 * A write nobody waits for: bounded like everything else, and registered with the platform so the
 * instance stays alive to finish it. See lib/side-writes.ts for what happened when they were not.
 *
 * This is the only place that knows how the registration is done, which is why `after` is imported
 * here and nowhere near the rules it keeps alive. `after()` throws outside a request — in a script,
 * a test, or the cron's own flush — and there running the task directly is correct: nothing is
 * about to be suspended.
 */
export const sideWrite = makeSideWrite({
  keepalive: (task) => { try { after(task); } catch { void task(); } },
  bound: withTimeout,
  defaultMs: DB_SIDE_TIMEOUT_MS,
});

const transactionContext = new AsyncLocalStorage<postgres.Sql>();
export async function inTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (transactionContext.getStore()) return fn();
  return sql().begin(async (tx) => {
    await tx`set local statement_timeout = '10s'`;
    await tx`set local lock_timeout = '5s'`;
    return transactionContext.run(tx as unknown as postgres.Sql, fn);
  }) as Promise<T>;
}

export function sql(): postgres.Sql {
  const transaction = transactionContext.getStore();
  if (transaction) return transaction;
  if (!globalThis.__crier_sql) {
    globalThis.__crier_sql = postgres(env.DATABASE_URL, {
      prepare: false,        // required for transaction-mode pooling
      max: 4,               // one instance serves many concurrent requests; the Supabase pooler is the real pool
      // Held low deliberately. A socket kept across a Fluid suspension is how the 2026-09-10 wedge
      // started, and the safe way to hold one longer — `attachDatabasePool` from @vercel/functions,
      // which releases idle clients before an instance suspends — does not accept this client: it
      // duck-types on `pool.on` plus `options.idleTimeoutMillis` (node-postgres) or `config`
      // (mysql2) and throws "Unsupported database pool type" for anything else, and a postgres.js
      // client is a tagged-template function with neither. Checked against @vercel/functions 3.9.7.
      // The cost is 2,833 authentications a day; raising this without that release hook is not the
      // way to cut them.
      idle_timeout: 20,
      connect_timeout: 10,   // TCP and auth only: past that, a silent pooler looks like a live connection
      max_lifetime: 300,     // retire pooled connections sooner so a bad one has less time to do harm
      ssl: databaseSsl(env.DATABASE_URL),
      transform: { undefined: null },
    });
  }
  return globalThis.__crier_sql;
}

export type Sql = ReturnType<typeof sql>;

export function toVectorLiteral(v: number[]): string {
  return "[" + v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : "0")).join(",") + "]";
}
