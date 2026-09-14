import test from "node:test";
import assert from "node:assert/strict";
import { getPublicConfig } from "../../lib/gongzhi/public-config.ts";
import { getAuthConfiguration } from "../../lib/gongzhi/auth-config.ts";
import { GET } from "../../app/api/gongzhi/config/route.ts";
import { GET as health } from "../../app/api/gongzhi/health/route.ts";
import { createBrowserAuth } from "../../lib/gongzhi/browser-auth.ts";
import { ApiClientError, createApiClient } from "../../lib/gongzhi/api-client.ts";

const names = ["GONGZHI_AUTH_ENABLED", "GONGZHI_DATABASE_ENABLED", "DATABASE_URL", "SUPABASE_PUBLIC_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"];
const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.classification-only`;
test("runtime config is an explicit public allowlist and never returns secret-role keys", async () => {
  const saved = names.map(name => [name, process.env[name]] as const);
  try {
    for (const name of names) delete process.env[name];
    process.env.GONGZHI_AUTH_ENABLED = "true";
    process.env.SUPABASE_URL = "http://127.0.0.1:56501";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.SUPABASE_ANON_KEY = jwt("anon");
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-secret-must-not-appear";
    process.env.OPENAI_API_KEY = "model-secret-must-not-appear";
    process.env.DATABASE_URL = "postgres://private-db-credential";
    process.env.GONGZHI_DATABASE_ENABLED = "true";
    const response = await GET();
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.deepEqual(body, { ok: true, mode: "live", data: { contract_version: "gongzhi.v1", api_base: "/api/gongzhi", database_configured: true, auth: { available: true, url: process.env.SUPABASE_URL, public_key: process.env.SUPABASE_ANON_KEY } } });
    for (const value of [jwt("service_role"), "sb_secret_private", "random-model-key", "malformed"]) {
      process.env.SUPABASE_ANON_KEY = value;
      assert.deepEqual(getPublicConfig().auth, { available: false, url: null, public_key: null });
    }
    process.env.SUPABASE_ANON_KEY = "sb_publishable_public";
    assert.equal(getPublicConfig().auth.available, true);
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    process.env.SUPABASE_PUBLIC_URL = "http://127.0.0.1:56501";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_runtime";
    assert.equal(getAuthConfiguration().serverUrl, getPublicConfig().auth.url);
    assert.equal(getAuthConfiguration().key, getPublicConfig().auth.public_key);
    assert.equal(getPublicConfig().auth.available, true);
    assert.equal((await health().json()).data.auth_configured, true);
    process.env.SUPABASE_URL = "invalid-server-url";
    assert.equal(getPublicConfig().auth.available, false);
    delete process.env.SUPABASE_URL;
    process.env.SUPABASE_PUBLIC_URL = "http://user:secret@localhost:9999";
    assert.equal(getPublicConfig().auth.available, false);
    delete process.env.SUPABASE_PUBLIC_URL;
    process.env.GONGZHI_AUTH_ENABLED = "false";
    assert.deepEqual(getPublicConfig().auth, { available: false, url: null, public_key: null });
  } finally { for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } }
});
test("runtime auth configuration preserves demo isolation and unconfigured behavior", async () => {
  for (const auth of [createBrowserAuth("demo", { available: true, url: "http://127.0.0.1:56501", public_key: "sb_publishable_public" }), createBrowserAuth("live", { available: false, url: null, public_key: null })]) {
    assert.equal(auth.available, false);
    assert.equal(await auth.initialize(), null);
    await assert.rejects(auth.signIn("test@example.invalid", "unused"), (error: unknown) => error instanceof ApiClientError && error.error.code === "unavailable");
    auth.dispose();
  }
});
test("public config uses the existing live client response and error boundary", async () => {
  const api = createApiClient("live", { fetch: (async (url) => {
    assert.equal(url, "/api/gongzhi/config");
    return GET();
  }) as typeof fetch });
  assert.equal((await api.readConfig()).api_base, "/api/gongzhi");
});
