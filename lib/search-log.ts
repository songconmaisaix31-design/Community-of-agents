/**
 * The shape of a de-identified search, and the public aggregate built from it.
 *
 * FR-40 records every search, not only the ones that found nothing, because relay is added against
 * measured demand and not a hunch (BR-6). BR-17 is the constraint that lets the record be public: a
 * row is a query shape and a day, never a caller. Nothing here takes a seeker, an address or a
 * clock, so nothing here can leak one.
 *
 * The module has no database and no framework imports — only the buffer of shapes waiting to be
 * written — which is what makes the rules here testable, and what keeps `normalizeQuery` and
 * `roundNear` in one place: `unmet_queries` and `search_log` both store what these two return, so
 * the two tables always agree about what a query looked like.
 */

export type SearchSource = "rest" | "mcp" | "feed";

/** One row of `search_log`, before the day and the counts. */
export type SearchShape = {
  q: string | null;
  kind: string | null;
  tags: string | null;
  near: string | null;
  radius_km: number | null;
  source: SearchSource;
};

export type ShapeCount = SearchShape & { n: number; zero: number };

/** The fields of a parsed SearchQuery this module reads. Structural, so `lib/search` need not be imported. */
type QueryFields = { q?: string; kind?: string; tags?: string; near?: string; radius_km?: number };

/**
 * How many distinct shapes one process will hold between flushes. Counter keys come from a fixed
 * vocabulary of routes and tools; query shapes come from callers, so this map is the one that could
 * grow without bound if a flush were slow and traffic strange. Past the cap, shapes already held
 * keep counting and new ones are dropped and counted as `search:log_dropped`. Losing a few rows
 * under duress is the same trade the counters make; losing the request is not.
 */
export const MAX_PENDING_SHAPES = 500;

/** Lower-case, collapse whitespace, replace the personal-data patterns, cap at 200. */
export function normalizeQuery(q: string | undefined): string | null {
  if (!q) return null;
  return q.toLowerCase().replace(/\s+/g, " ").trim()
    .replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/g, "[email]")
    .replace(/(?:\+?\d{1,2}[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, "[phone]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[id]")
    .slice(0, 200);
}

/** Round a "lat,lng" to a 0.5 degree cell, roughly 50 km. Coarse enough that a cell is a region. */
export function roundNear(near: string | undefined): string | null {
  if (!near) return null;
  const [a, b] = near.split(",").map(parseFloat);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return `${(Math.round(a * 2) / 2).toFixed(1)},${(Math.round(b * 2) / 2).toFixed(1)}`;
}

/**
 * The tuple a search is logged as. A query with no text, kind, tags or place is a bare listing —
 * "show me the newest" — and is a shape like any other, stored with nulls throughout.
 */
export function searchShape(q: QueryFields, source: SearchSource): SearchShape {
  return {
    q: normalizeQuery(q.q),
    kind: q.kind ?? null,
    tags: q.tags ? q.tags.toLowerCase().slice(0, 200) : null,
    near: roundNear(q.near),
    radius_km: q.radius_km == null ? null : Math.round(q.radius_km),
    source,
  };
}

/** The in-process map key. Not stored; the database enforces the same tuple in search_log_shape_idx. */
export function shapeKey(s: SearchShape): string {
  return JSON.stringify([s.q, s.kind, s.tags, s.near, s.radius_km, s.source]);
}

/**
 * Fold one search into a pending map. Returns false when the map is full and this shape is new,
 * which is the caller's cue to count the drop.
 */
export function addSearch(into: Map<string, ShapeCount>, shape: SearchShape, zero: boolean, limit = MAX_PENDING_SHAPES): boolean {
  const k = shapeKey(shape);
  const cur = into.get(k);
  if (cur) { cur.n++; if (zero) cur.zero++; return true; }
  if (into.size >= limit) return false;
  into.set(k, { ...shape, n: 1, zero: zero ? 1 : 0 });
  return true;
}

/* ---------------- the pending write ----------------
 *
 * The buffer lives here rather than in lib/metrics.ts so that what gets logged, and what never does,
 * is decided in the one module that has no database and no framework behind it. lib/metrics.ts owns
 * the transaction and the counters; this owns the rule.
 */

const pending = new Map<string, ShapeCount>();

export type RecordOutcome =
  | "recorded"
  /** An internal publisher: seeding the board is not demand for it, so it leaves no trace here. */
  | "skipped"
  /** The buffer is full and this shape is new. The caller counts it; see MAX_PENDING_SHAPES. */
  | "dropped";

/** Buffer one search for the next flush. Takes no seeker, by construction (BR-17). */
export function recordSearch(q: QueryFields, source: SearchSource, opts: { zero: boolean; internal?: boolean }): RecordOutcome {
  if (opts.internal) return "skipped";
  return addSearch(pending, searchShape(q, source), opts.zero) ? "recorded" : "dropped";
}

/** Take everything buffered. The buffer is emptied, so a flush can never write a shape twice. */
export function drainSearches(): ShapeCount[] {
  const out = [...pending.values()];
  pending.clear();
  return out;
}

/** Test seam: forget what is buffered. */
export function __resetSearchLog() {
  pending.clear();
}

/* ---------------- public aggregate ---------------- */

/** One grouped row as `metricsSnapshot` reads it: a shape on a day, already summed across sources. */
export type DemandRow = { day: string; q: string | null; kind: string | null; near: string | null; tags: string | null; n: number; zero: number };

export type DemandShape = { q: string | null; kind: string | null; near: string | null; n: number; zero: number; days: number; poller: boolean };
export type DemandFacet = { key: string; n: number; zero: number; zero_share: number };
export type DemandWindow = {
  searches: number;
  zero: number;
  shapes: DemandShape[];
  /** The shapes below the BR-17 threshold, kept only as a count so the totals still add up. */
  other: { shapes: number; n: number; zero: number };
  kinds: DemandFacet[];
  places: DemandFacet[];
  tags: DemandFacet[];
};

/**
 * A shape is published only once it is demand rather than an incident: three or more searches, or
 * asked on two or more separate days. Everything below that is real demand too, so it is counted in
 * `other` rather than dropped — the totals are complete, only the text is withheld.
 */
export function meetsThreshold(n: number, days: number): boolean {
  return n >= 3 || days >= 2;
}

/** One day of a single shape above this is a poller, not a question. Reported as a marker, not a score. */
export const POLLER_DAILY_N = 50;

const TOP = 25;

function facets(m: Map<string, { n: number; zero: number }>, limit = TOP): DemandFacet[] {
  return [...m.entries()]
    .map(([key, v]) => ({ key, n: v.n, zero: v.zero, zero_share: v.n > 0 ? Math.round((v.zero / v.n) * 1000) / 1000 : 0 }))
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function bump(m: Map<string, { n: number; zero: number }>, key: string, n: number, zero: number) {
  const cur = m.get(key);
  if (cur) { cur.n += n; cur.zero += zero; } else m.set(key, { n, zero });
}

/**
 * Aggregate the rows of one window (the caller decides which rows are in it) into the public block.
 *
 * A public shape is (q, kind, near), so several rows can land on one shape: the log splits a shape
 * further by tags, radius and source, and the same shape recurs on later days. `days` and the poller
 * peak therefore have to be counted per calendar day rather than per row — two tag sets asked on one
 * afternoon are one day of demand, not two.
 */
export function foldDemand(rows: DemandRow[], limit = TOP): DemandWindow {
  type Acc = { q: string | null; kind: string | null; near: string | null; n: number; zero: number; byDay: Map<string, number> };
  const shapes = new Map<string, Acc>();
  const kinds = new Map<string, { n: number; zero: number }>();
  const places = new Map<string, { n: number; zero: number }>();
  const tags = new Map<string, { n: number; zero: number }>();
  let searches = 0, zero = 0;

  for (const r of rows) {
    searches += r.n;
    zero += r.zero;
    const key = JSON.stringify([r.q, r.kind, r.near]);
    let cur = shapes.get(key);
    if (!cur) { cur = { q: r.q, kind: r.kind, near: r.near, n: 0, zero: 0, byDay: new Map() }; shapes.set(key, cur); }
    cur.n += r.n;
    cur.zero += r.zero;
    cur.byDay.set(r.day, (cur.byDay.get(r.day) ?? 0) + r.n);
    if (r.kind) bump(kinds, r.kind, r.n, r.zero);
    if (r.near) bump(places, r.near, r.n, r.zero);
    if (r.tags) for (const t of r.tags.split(",")) { const k = t.trim(); if (k) bump(tags, k, r.n, r.zero); }
  }

  const other = { shapes: 0, n: 0, zero: 0 };
  const kept: DemandShape[] = [];
  for (const s of shapes.values()) {
    const days = s.byDay.size;
    if (!meetsThreshold(s.n, days)) { other.shapes++; other.n += s.n; other.zero += s.zero; continue; }
    kept.push({ q: s.q, kind: s.kind, near: s.near, n: s.n, zero: s.zero, days, poller: Math.max(...s.byDay.values()) > POLLER_DAILY_N });
  }
  kept.sort((a, b) => b.n - a.n || b.days - a.days || (a.q ?? "").localeCompare(b.q ?? ""));

  return { searches, zero, shapes: kept.slice(0, limit), other, kinds: facets(kinds, limit), places: facets(places, limit), tags: facets(tags, limit) };
}
