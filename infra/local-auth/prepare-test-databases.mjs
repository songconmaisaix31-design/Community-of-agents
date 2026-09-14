import postgres from "postgres";
import { writeFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
const adminUrl = new URL(process.env.MIGRATION_DATABASE_URL ?? "");
if (adminUrl.hostname !== "127.0.0.1" || adminUrl.port !== "56520" || adminUrl.pathname !== "/gongzhi") throw new Error("Only the dedicated new local PG is allowed");
const directory = await realpath(process.argv[2]);
const db = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
try {
  for (const name of ["gongzhi_core_test", "gongzhi_migration_check"]) {
    const [exists] = await db`select 1 from pg_database where datname=${name}`;
    if (!exists) await db.unsafe(`create database ${name}`);
    const url = new URL(adminUrl); url.pathname = `/${name}`;
    const target = postgres(url.toString(), { max: 1, onnotice: () => {} });
    try { for (const extension of ["vector", "pg_trgm", "unaccent", "pgcrypto"]) await target.unsafe(`create extension if not exists ${extension}`); }
    finally { await target.end(); }
  }
  const coreAdmin = new URL(adminUrl); coreAdmin.pathname = "/gongzhi_core_test";
  const coreApp = new URL(process.env.DATABASE_URL); coreApp.pathname = "/gongzhi_core_test";
  const scratch = new URL(adminUrl); scratch.pathname = "/gongzhi_migration_check";
  const values = Object.fromEntries(["SUPABASE_URL", "SUPABASE_PUBLIC_URL", "SUPABASE_ANON_KEY", "CRIER_HASH_SECRET", "SITE_URL", "GONGZHI_TEST_EMAIL", "GONGZHI_TEST_PASSWORD", "GONGZHI_TEST_OTHER_EMAIL", "GONGZHI_TEST_OTHER_PASSWORD", "GONGZHI_TEST_UNBOUND_EMAIL", "GONGZHI_TEST_UNBOUND_PASSWORD"].map(key => [key, process.env[key]]));
  if (Object.values(values).some(value => !value)) throw new Error("Load admin.env and accounts.env; values suppressed");
  for (const [name, data] of Object.entries({ "core-test.env": { ...values, GONGZHI_DATABASE_ENABLED: "true", GONGZHI_AUTH_ENABLED: "true", GONGZHI_REAL_AUTH_TEST: "true", DATABASE_URL: coreApp.toString(), MIGRATION_DATABASE_URL: coreAdmin.toString() }, "scratch.env": { SCRATCH_DATABASE_URL: scratch.toString() } })) {
    try { await writeFile(resolve(directory, name), Object.entries(data).map(([k,v])=>`${k}=${v}`).join("\n")+"\n", { flag: "wx", mode: 0o600 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
  }
  console.log("Dedicated Core and migration-check databases/configurations prepared; existing data preserved");
} finally { await db.end(); }
