import test from "node:test";
import assert from "node:assert/strict";
import { migrationPolicy } from "../../scripts/migration-policy.mjs";
import { databaseSsl } from "../../lib/database-ssl.ts";
const target = "zhihu.davidwang.space";
const args = [`--production-target=${target}`];
const env = { NODE_ENV: "production", GONGZHI_DATABASE_ENABLED: "true", MIGRATION_DATABASE_URL: "postgres://postgres:synthetic@db:5432/gongzhi", GONGZHI_PRODUCTION_DEPLOYMENT: target, GONGZHI_PRODUCTION_MIGRATION: target, SITE_URL: `https://${target}`, GONGZHI_DATABASE_CA_FILE: "/run/secrets/db-ca.crt" };

test("production migrations require both operator confirmation and the exact reviewed TLS target", () => {
  assert.deepEqual(migrationPolicy(args, env), { production: true, caFile: "/run/secrets/db-ca.crt" });
  for (const input of [[], ["--if-production"], ["--production-target=elsewhere"], [...args, ...args]]) assert.throws(() => migrationPolicy(input, env));
  for (const change of [{ GONGZHI_PRODUCTION_MIGRATION: "" }, { GONGZHI_PRODUCTION_DEPLOYMENT: "" }, { SITE_URL: "http://localhost" }, { GONGZHI_DATABASE_CA_FILE: "" }, { GONGZHI_LOCAL_DOCKER_DATABASE: "true" }, { MIGRATION_DATABASE_URL: "postgres://postgres:synthetic@127.0.0.1:56520/gongzhi" }, { MIGRATION_DATABASE_URL: "postgres://postgres:synthetic@db:6543/gongzhi" }, { MIGRATION_DATABASE_URL: "postgres://crier_app:synthetic@db:5432/gongzhi" }, { MIGRATION_DATABASE_URL: "postgres://postgres:synthetic@db:5432/other" }, { MIGRATION_DATABASE_URL: env.MIGRATION_DATABASE_URL + "?sslmode=disable" }]) assert.throws(() => migrationPolicy(args, { ...env, ...change }));
  assert.throws(() => migrationPolicy([], { ...env, NODE_ENV: "development", VERCEL_ENV: "production", GONGZHI_PRODUCTION_DEPLOYMENT: "" }));
  assert.deepEqual(migrationPolicy([], { GONGZHI_DATABASE_ENABLED: "true", MIGRATION_DATABASE_URL: "postgres://app@127.0.0.1/local" }), { production: false });
});

test("production runtime never takes the loopback exception or silently loses its CA", () => {
  for (const connection of ["postgres://crier_app:x@127.0.0.1:56520/gongzhi", "postgres://crier_app:x@db:5432/other", "postgres://crier_app:x@db:5432/gongzhi?sslmode=disable"]) assert.throws(() => databaseSsl(connection, "false", "/missing/ca", target), /Production database target/);
  assert.throws(() => databaseSsl("postgres://crier_app:x@db:5432/gongzhi", "true", "/missing/ca", target), /Production database target/);
  assert.throws(() => databaseSsl("postgres://crier_app:x@db:5432/gongzhi", "false", "", target), /Production database target/);
  assert.throws(() => databaseSsl("postgres://crier_app:x@db:5432/gongzhi", "false", "/missing/ca", target), /ENOENT/);
  assert.equal(databaseSsl("postgres://app@remote.example:5432/gongzhi", "false", "", ""), "require");
});
