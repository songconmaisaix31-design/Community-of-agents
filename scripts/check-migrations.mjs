/**
 * Applies every file in migrations/ to a scratch database twice, and fails if the second pass errors.
 *
 * Every migration in this repository is written to be re-runnable — `create table if not exists`,
 * `create or replace function`, `drop trigger if exists`, `create unique index if not exists` —
 * because that is what makes one safe to apply by hand, to re-apply after a deploy failed halfway,
 * and to trust in a build that may run twice for the same commit. Nothing enforced it: the files are
 * idempotent because the person writing them was careful each time. This is that care, in CI, for
 * the file written by somebody in a hurry.
 *
 * The check has to execute the SQL rather than read it. A statement that is not idempotent —
 * `create index` without `if not exists`, `alter table ... add column` without it, an `insert` with
 * no conflict clause — is perfectly ordinary SQL that parses and runs. It only fails the second time
 * it meets a database that has already seen it, which in production is the second deploy, at the
 * worst possible moment.
 *
 *   SCRATCH_DATABASE_URL=postgres://... node scripts/check-migrations.mjs
 *
 * The variable is deliberately not DATABASE_URL. This script writes to whatever it is given, and a
 * developer's shell usually has DATABASE_URL pointing at something that matters; naming it
 * SCRATCH_DATABASE_URL means pointing it somewhere destructive takes a decision rather than an
 * oversight. .github/workflows/ci.yml gives it a Postgres 16 service container that is thrown away
 * when the job ends.
 */
import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const url = process.env.SCRATCH_DATABASE_URL;
if (!url) {
  console.error("check-migrations: SCRATCH_DATABASE_URL is required — a throwaway database this may create in, alter and write to at will");
  process.exit(1);
}

// The second pass is a wall of "already exists, skipping" notices. They are the expected outcome
// rather than news, and printing several hundred of them would bury the one line that matters.
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

const dir = path.join(process.cwd(), "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
if (files.length === 0) {
  console.error(`check-migrations: no .sql files in ${dir}`);
  process.exit(1);
}

const failures = [];
try {
  // 0001 declares the extensions it needs rather than creating them, because on Supabase they are
  // enabled once, out of band, long before any migration runs. A scratch database starts without
  // them, so this is where they come from here — the same four the README names.
  await sql.unsafe("create extension if not exists vector; create extension if not exists pg_trgm; create extension if not exists unaccent; create extension if not exists pgcrypto");

  for (const pass of [1, 2]) {
    console.log(pass === 1 ? `pass 1: applying ${files.length} migrations to an empty database` : `pass 2: applying the same ${files.length} again — this is the idempotency check`);
    for (const f of files) {
      const body = await readFile(path.join(dir, f), "utf8");
      const started = Date.now();
      try {
        // One transaction per file, the way scripts/migrate.mjs applies them, so a file that fails
        // here fails in exactly the shape it would fail a deploy.
        await sql.begin(async (tx) => { await tx.unsafe(body); });
        console.log(`  ok    ${f}  ${Date.now() - started} ms`);
      } catch (e) {
        failures.push({ file: f, pass, message: e.message });
        console.error(`  FAIL  ${f}  pass ${pass}: ${e.message}`);
        // A file that fails on the first pass leaves the schema half-built, so every file after it
        // fails too and none of those failures mean anything on their own. On the second pass the
        // opposite holds: each file is independent evidence, and listing all of them at once is the
        // point of running the check at all.
        if (pass === 1) break;
      }
    }
    if (pass === 1 && failures.length) break;
  }
} finally {
  await sql.end();
}

if (failures.length) {
  const second = failures.filter((f) => f.pass === 2);
  if (second.length) {
    console.error("");
    console.error(`check-migrations: ${second.length} migration(s) are not idempotent. Applying one to a database that already has it must be a no-op, not an error: reach for "if not exists", "create or replace", and "on conflict do nothing".`);
    for (const f of second) console.error(`  migrations/${f.file}: ${f.message}`);
  }
  process.exit(1);
}

console.log(`check-migrations: all ${files.length} migrations applied twice, no errors on the second pass`);
