/**
 * Crier 0001-0008 retain their original raw-SQL re-entry check. Gongzhi additive
 * migrations use the real runner's schema_migrations ledger: apply all files,
 * verify structure/permissions, then run again and verify nothing was reapplied.
 * Requires an explicitly supplied EMPTY project scratch database; never the app DB.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.SCRATCH_DATABASE_URL;
if (!url) {
  console.error("check-migrations: SCRATCH_DATABASE_URL is required; use a new empty database in this project's dedicated local PostgreSQL container.");
  process.exit(1);
}
if (process.env.VERCEL_ENV === "production") throw new Error("check-migrations: production execution is disabled");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
const files = (await readdir(path.join(root,"migrations"))).filter(f => f.endsWith(".sql")).sort();
async function runMigrations() {
  await new Promise((resolve,reject) => {
    const child = spawn(process.execPath,[path.join(root,"scripts/migrate.mjs")], { cwd:root, stdio:"inherit", windowsHide:true, env:{...process.env,GONGZHI_DATABASE_ENABLED:"true",MIGRATION_DATABASE_URL:url} });
    child.once("error",reject);
    child.once("exit",code => code === 0 ? resolve() : reject(new Error(`migration runner exited ${code}`)));
  });
}
async function check0011() {
  const [structure] = await db`select c.relrowsecurity rls,
    exists(select 1 from pg_attribute where attrelid='gongzhi_owners'::regclass and attname='scopes' and attnotnull and atttypid='text[]'::regtype) scopes,
    exists(select 1 from pg_constraint where conrelid='gongzhi_owners'::regclass and conname='gongzhi_scope_values' and convalidated) scope_constraint,
    exists(select 1 from pg_trigger where tgrelid='posts'::regclass and tgname='gongzhi_discussion_history' and tgenabled='O') history_trigger
    from pg_class c where c.oid='gongzhi_authorizations'::regclass`;
  assert.deepEqual(structure,{rls:true,scopes:true,scope_constraint:true,history_trigger:true});
  for (const role of ["anon","authenticated"]) {
    for (const privilege of ["SELECT","INSERT","UPDATE","DELETE"]) {
      const [r] = await db`select has_table_privilege(${role},'gongzhi_authorizations',${privilege}) allowed`;
      assert.equal(r.allowed,false,`${role} must not ${privilege} grants`);
    }
  }
  for (const privilege of ["SELECT","INSERT","UPDATE"]) {
    const [r] = await db`select has_table_privilege('crier_app','gongzhi_authorizations',${privilege}) allowed`; assert.equal(r.allowed,true,`crier_app needs ${privilege}`);
  }
  const [app] = await db`select exists(select 1 from pg_policy where polrelid='gongzhi_authorizations'::regclass and (select oid from pg_roles where rolname='crier_app')=any(polroles)) policy`;
  assert.equal(app.policy,true);
  const rollback = new Error("rollback successful migration probe");
  try {
    await db.begin(async tx => {
      const id = randomUUID();
      await tx`insert into publishers(id,name,verify_token,api_key_hash,api_key_prefix) values(${id},'migration probe',${id},${id},'probe')`;
      await tx`insert into gongzhi_owners(id,user_id,publisher_id,kind) values(${id},${randomUUID()},${id},'human')`;
      await assert.rejects(tx.savepoint(q => q`update gongzhi_owners set scopes=array['unauthorized_scope'] where id=${id}`),{code:"23514"});
      await tx`insert into gongzhi_authorizations(id,owner_id,scopes,token_hash,idempotency_key,fingerprint,expires_at) values(${id},${id},array['read'],${id},'probe','probe',now()+interval '1 hour')`;
      await assert.rejects(tx.savepoint(q => q`update gongzhi_authorizations set scopes=array[]::text[] where id=${id}`),{code:"23514"});
      await assert.rejects(tx.savepoint(q => q`insert into gongzhi_authorizations(id,owner_id,scopes,token_hash,idempotency_key,fingerprint,expires_at) values(${randomUUID()},${id},array['read'],${randomUUID()},'probe','different',now()+interval '1 hour')`),{code:"23505"});
      await tx`set local role crier_app`;
      for (const subtype of ["reply","supplement","experience","result","help","decision","need_revision"]) {
        const postId = randomUUID();
        await tx`insert into posts(id,publisher_id,title,body,metadata,expires_at) values(${postId},${id},'probe','original',${tx.json({gongzhi:{subtype,mode:"live"}})},now()+interval '1 day')`;
        await assert.rejects(tx.savepoint(q => q`update posts set body='tampered' where id=${postId}`),/immutable gongzhi history/);
        await assert.rejects(tx.savepoint(q => q`update posts set metadata='{}'::jsonb where id=${postId}`),/immutable gongzhi history/);
        await tx`update posts set views=views+1,reply_count=reply_count+1,last_reply_at=now() where id=${postId}`;
        const [stored] = await tx`select views,reply_count,body,tsv is not null searchable from posts where id=${postId}`;
        assert.equal(Number(stored.views),1); assert.equal(stored.reply_count,1); assert.equal(stored.body,"original"); assert.equal(stored.searchable,true);
      }
      throw rollback;
    });
  } catch(error) { if(error !== rollback) throw error; }
  console.log("0011 checks: scoped grants, unique enrollment, RLS/browser denial and immutable discussion text/provenance passed; probes rolled back");
}
try {
  assert.ok(files.length > 0,"no migrations found");
  const [existing] = await db`select to_regclass('public.schema_migrations') ledger,to_regclass('public.posts') posts,to_regclass('public.publishers') publishers`;
  assert.ok(!existing.ledger && !existing.posts && !existing.publishers,"SCRATCH_DATABASE_URL must name a new empty database; existing app schemas are refused without changes");
  for (const role of ["crier_app","anon","authenticated"]) {
    const [r] = await db`select exists(select 1 from pg_roles where rolname=${role}) present`; assert.ok(r.present,`scratch cluster must already provide ${role}; this check never creates cluster-wide roles`);
  }
  await db.unsafe("create extension if not exists vector; create extension if not exists pg_trgm; create extension if not exists unaccent; create extension if not exists pgcrypto");
  const upstream = files.filter(f => /^000[1-8]_/.test(f));
  assert.equal(upstream.length,8,"the eight pinned Crier migrations must be present");
  for (const pass of [1,2]) {
    for (const file of upstream) { const body = await readFile(path.join(root,"migrations",file),"utf8"); await db.begin(async tx => { await tx.unsafe(body); }); }
    console.log(`Crier raw-SQL pass ${pass}: all eight upstream migrations passed`);
  }
  await runMigrations();
  const before = await db`select name,applied_at::text applied_at from schema_migrations order by name`;
  assert.deepEqual(before.map(r=>r.name),files,"the real runner must apply every migration, including all Gongzhi additions");
  await check0011();
  await runMigrations();
  const after = await db`select name,applied_at::text applied_at from schema_migrations order by name`;
  assert.deepEqual(after.map(r=>({...r})),before.map(r=>({...r})),"second runner execution must not rewrite or duplicate migration ledger entries");
  await check0011();
  console.log(`check-migrations: ${files.length} migrations applied by the real runner; second run was a no-op; upstream re-entry and 0011 invariants passed`);
} finally { await db.end(); }
