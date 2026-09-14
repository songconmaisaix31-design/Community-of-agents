import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { productionEnvironments } from "../../infra/production/generate-env.mjs";
const fixture = { postgresPassword: "synthetic-postgres", authPassword: "synthetic-auth", appPassword: "synthetic-app", jwtSecret: "synthetic-jwt", anonKey: "synthetic-anon", serviceKey: "synthetic-admin", hashSecret: "synthetic-hash" };

test("production separates admin secrets, requires Auth TLS and disables unverified signup/model execution", () => {
  const files = productionEnvironments(fixture);
  const auth = new URL(files["auth.env"].GOTRUE_DB_DATABASE_URL);
  assert.equal(auth.searchParams.get("sslmode"), "verify-full");
  assert.equal(auth.searchParams.get("sslrootcert"), "/run/secrets/db-ca.crt");
  assert.equal(files["auth.env"].GOTRUE_DISABLE_SIGNUP, "true");
  assert.equal(files["auth.env"].GOTRUE_MAILER_AUTOCONFIRM, "false");
  assert.equal(files["app.env"].GONGZHI_ASSISTANT_ENABLED, "false");
  assert.equal(files["app.env"].SUPABASE_PUBLIC_URL, "https://zhihu.davidwang.space");
  assert.equal(files["app.env"].SUPABASE_URL, "http://proxy:8080");
  assert.ok(!JSON.stringify(files["app.env"]).includes(fixture.serviceKey));
  assert.ok(!JSON.stringify(files["app.env"]).includes(fixture.postgresPassword));
  assert.ok(!JSON.stringify(files["app.env"]).includes(fixture.jwtSecret));
  assert.ok(!Object.hasOwn(files["migration.env"], "GONGZHI_PRODUCTION_MIGRATION"));
  assert.equal(readFileSync("infra/production/pg_hba.conf", "utf8").includes("hostnossl all all all reject"), true);
});

test("Compose renders loopback-only defaults and an explicit HTTPS overlay without starting services", { skip: process.env.GONGZHI_COMPOSE_TEST !== "true" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "gongzhi-production-config-test-"));
  const files = productionEnvironments(fixture);
  files["compose.env"].GONGZHI_PRODUCTION_SECRETS = dir.replaceAll("\\", "/");
  for (const [name, values] of Object.entries(files)) writeFileSync(join(dir, name), Object.entries(values).map(([k,v]) => `${k}=${v}`).join("\n"));
  try {
    for (const https of [false, true]) {
      const args = ["compose", "--env-file", join(dir, "compose.env"), "-f", "infra/production/compose.yaml", ...(https ? ["-f", "infra/production/compose.https.yaml"] : []), "--profile", "maintenance", "config", "--format", "json"];
      const result = spawnSync("docker", args, { encoding: "utf8", env: { ...process.env, GONGZHI_PRODUCTION_SECRETS: dir.replaceAll("\\", "/"), GONGZHI_APP_IMAGE: "gongzhi-app:synthetic", GONGZHI_MIGRATION_IMAGE: "gongzhi-migrate:synthetic" } });
      assert.equal(result.status, 0, "synthetic Compose rendering failed");
      const config = JSON.parse(result.stdout);
      assert.equal(config.name, "gongzhi-production");
      for (const service of ["db", "auth", "app", "migrate"]) assert.ok(!config.services[service].ports);
      const ports = config.services.proxy.ports;
      assert.equal(ports.length, https ? 3 : 1);
      assert.ok(ports.some((p: {host_ip: string; published: string}) => p.host_ip === "127.0.0.1" && Number(p.published) === 8080));
      assert.ok(config.services.proxy.volumes.some((v: {target: string; source: string}) => v.target === "/etc/caddy/Caddyfile" && v.source.replaceAll("\\", "/").endsWith(https ? "Caddyfile.https" : "Caddyfile.loopback")));
      assert.deepEqual(config.services.migrate.profiles, ["maintenance"]);
      assert.deepEqual(config.services.migrate.command, ["node", "scripts/migrate.mjs"]);
      assert.equal(config.networks.backend.internal, true);
      assert.deepEqual(config.services.auth.command, ["gotrue", "serve"]);
      assert.ok(Object.hasOwn(config.services.app.networks, "edge"));
      assert.ok(Object.hasOwn(config.services.auth.networks, "edge"));
      assert.ok(!Object.hasOwn(config.services.db.networks, "edge"));
      assert.ok(!config.services.app.environment.SUPABASE_SERVICE_ROLE_KEY);
      for (const service of Object.values(config.services) as any[]) {
        assert.equal(service.logging.options["max-size"], "10m");
        assert.equal(service.logging.options["max-file"], "3");
      }
    }
  } finally {
    for (const name of Object.keys(files)) unlinkSync(resolve(dir, name));
    rmdirSync(dir);
  }
});
