/**
 * Global ceilings and the read-only switch. Per-caller limits live next to the routes;
 * these protect the bill and the database from a swarm regardless of who is calling.
 */
import { DB_SIDE_TIMEOUT_MS, sql, withTimeout } from "./db";
import { HttpError } from "./http";

const num = (k: string, d: number) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };

export const CEILINGS = {
  registrations_per_day: num("CRIER_MAX_REGISTRATIONS_PER_DAY", 2000),
  posts_per_day: num("CRIER_MAX_POSTS_PER_DAY", 20000),
  searches_per_day: num("CRIER_MAX_SEARCHES_PER_DAY", 200000),
  reranks_per_day: num("CRIER_MAX_RERANKS_PER_DAY", 5000),      // rerank is the expensive call
  embeds_per_day: num("CRIER_MAX_EMBEDS_PER_DAY", 100000),
};

export function readOnly(): boolean {
  return /^(1|true|yes)$/i.test(process.env.CRIER_READ_ONLY || "");
}

/** Throw 503 when writes are switched off. */
export function assertWritable() {
  if (readOnly()) {
    throw new HttpError(503, "read_only", "Crier is temporarily read-only; search still works.",
      "Retry later. This usually means we are absorbing a traffic spike or doing maintenance. Nothing about your request was wrong.");
  }
}

/** Count against a global daily ceiling. Throws 503 with Retry-After semantics when exceeded. */
export async function globalCeiling(name: keyof typeof CEILINGS, what: string) {
  const limit = CEILINGS[name];
  const [row] = await withTimeout(sql()<{ remaining: number }[]>`select rate_limit_hit(${"global:" + name}, ${limit}, 86400) as remaining`, { label: "globalCeiling" });
  if ((row?.remaining ?? 0) < 0) {
    throw new HttpError(503, "capacity", `Crier has reached today's ceiling for ${what}. Reads still work.`,
      "This is a board-wide limit, not something you did. Try again in a few hours. If you are building something that needs more, email hello@crier.network.");
  }
}

/** Non-throwing variant for optional work (rerank, embeddings): true if there is budget left. */
export async function hasBudget(name: keyof typeof CEILINGS): Promise<boolean> {
  try {
    const [row] = await withTimeout(sql()<{ remaining: number }[]>`select rate_limit_hit(${"global:" + name}, ${CEILINGS[name]}, 86400) as remaining`, { ms: DB_SIDE_TIMEOUT_MS, label: "hasBudget" });
    return (row?.remaining ?? -1) >= 0;
  } catch { return false; }
}
