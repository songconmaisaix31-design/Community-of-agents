import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, readdirSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { defaultProfile, parseProfile, profileFromEnv, testProfileFromEnv, assertLocalDatabase, assertLocalAuth, renderNginx } from "../../infra/local-auth/local-profile.mjs";

const args = ["--project", "gongzhi-isolated-20260914", "--pg-port", "56530", "--auth-port", "56531", "--app-port", "3045"];
const profileEnv = { GONGZHI_LOCAL_PROJECT: "gongzhi-isolated-20260914", GONGZHI_LOCAL_PG_PORT: "56530", GONGZHI_LOCAL_AUTH_PORT: "56531", GONGZHI_LOCAL_APP_PORT: "3045" };

test("local profile preserves defaults and requires complete explicit isolation", () => {
  assert.deepEqual(parseProfile([]), { project: "gongzhi-live-20260914", pgPort: 56520, authPort: 56521, appPort: 3039 });
  assert.deepEqual(parseProfile(args), profileFromEnv(profileEnv));
  for (const invalid of [args.slice(0, 6), [...args, "--project", "gongzhi-other"], ["--unknown", "yes"], args.map(v => v === "56530" ? "56520" : v), args.map(v => v === "3045" ? "56531" : v), args.map(v => v === "56530" ? "1e4" : v), args.map(v => v === "56530" ? "65536" : v), args.map(v => v === "gongzhi-isolated-20260914" ? defaultProfile.project : v)]) assert.throws(() => parseProfile(invalid));
});

test("Auth target and generated CORS cannot fall back to the old environment", () => {
  assert.equal(assertLocalAuth("http://127.0.0.1:56531", 56531).port, "56531");
  for (const url of ["http://127.0.0.1:56521", "https://127.0.0.1:56531", "http://example.com:56531", "http://127.0.0.1:56531/auth", "http://x:y@127.0.0.1:56531", "http://127.0.0.1:56531/?x=y"]) assert.throws(() => assertLocalAuth(url, 56531));
  const template = readFileSync("infra/local-auth/nginx.conf", "utf8");
  assert.equal(renderNginx(template, defaultProfile), template);
  const isolated = renderNginx(template, parseProfile(args));
  assert.ok(isolated.includes(":(3045)$"));
  assert.ok(!isolated.includes("3039") && !isolated.includes("3041"));
  assert.equal(readFileSync("infra/local-auth/nginx.conf", "utf8"), template);
});

test("live tests require explicit complete isolation and the exact dedicated database and role", () => {
  assert.deepEqual(testProfileFromEnv({}), defaultProfile);
  assert.throws(() => testProfileFromEnv(profileEnv));
  assert.throws(() => testProfileFromEnv({ GONGZHI_ISOLATED_TEST: "true" }));
  const profile = testProfileFromEnv({ ...profileEnv, GONGZHI_ISOLATED_TEST: "true" });
  assert.equal(profile.pgPort, 56530);
  assert.equal(assertLocalDatabase("postgres://crier_app:fixture@127.0.0.1:56530/gongzhi_core_test", profile.pgPort, "gongzhi_core_test").pathname, "/gongzhi_core_test");
  for (const target of ["postgres://crier_app:fixture@127.0.0.1:56520/gongzhi_core_test", "postgres://crier_app:fixture@remote.invalid:56530/gongzhi_core_test", "postgres://crier_app:fixture@127.0.0.1:56530/gongzhi", "postgres://postgres:fixture@127.0.0.1:56530/gongzhi_core_test", "postgres://crier_app:fixture@127.0.0.1:56530/gongzhi_core_test?sslmode=disable"]) assert.throws(() => assertLocalDatabase(target, profile.pgPort, "gongzhi_core_test"));
});

test("writers reject nonempty private directories and mismatched isolated targets before writing", () => {
  const dir = mkdtempSync(join(tmpdir(), "gongzhi-config-rejection-"));
  const sentinel = join(dir, "keep.txt");
  writeFileSync(sentinel, "preserve");
  try {
    const rejected = spawnSync(process.execPath, ["infra/local-auth/write-config.mjs", dir, ...args], { encoding: "utf8" });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /must be empty/);
    const env = { ...process.env, ...profileEnv, DATABASE_URL: "postgres://crier_app:fixture@127.0.0.1:56530/gongzhi", SUPABASE_URL: "http://127.0.0.1:56531", SUPABASE_PUBLIC_URL: "http://127.0.0.1:56531", SITE_URL: "http://127.0.0.1:3045" };
    for (const override of [{ DATABASE_URL: "postgres://crier_app:fixture@127.0.0.1:56520/gongzhi" }, { DATABASE_URL: "postgres://postgres:fixture@127.0.0.1:56530/gongzhi" }, { SUPABASE_URL: "http://127.0.0.1:56521" }, { SUPABASE_PUBLIC_URL: "http://127.0.0.1:56521" }, { SITE_URL: "http://127.0.0.1:3039" }]) {
      const result = spawnSync(process.execPath, ["infra/local-auth/write-container-env.mjs", dir, "--isolated"], { encoding: "utf8", env: { ...env, ...override } });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /target mismatch|explicitly selected/);
    }
    assert.deepEqual(readdirSync(dir), ["keep.txt"]);
    assert.equal(readFileSync(sentinel, "utf8"), "preserve");
  } finally {
    // Only the named synthetic test file; never remove a configuration tree.
    unlinkSync(resolve(sentinel)); rmdirSync(dir);
  }
});
