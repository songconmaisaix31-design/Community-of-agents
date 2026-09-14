import test from "node:test";
import assert from "node:assert/strict";
import { getPublicConfig } from "../../lib/gongzhi/public-config.ts";
import { getAuthConfiguration } from "../../lib/gongzhi/auth-config.ts";
import { getWebAuthConfiguration } from "../../lib/gongzhi/web-auth-config.ts";
import { GET } from "../../app/api/gongzhi/config/route.ts";
import { createBrowserAuth } from "../../lib/gongzhi/browser-auth.ts";
import { ApiClientError, createApiClient } from "../../lib/gongzhi/api-client.ts";
import { WEB_AUTH_ENDPOINTS } from "../../lib/gongzhi/contracts.ts";

const names = ["SITE_URL", "GONGZHI_AUTH_ENABLED", "GONGZHI_DATABASE_ENABLED", "DATABASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY", "ZHIHU_OAUTH_APP_ID", "ZHIHU_OAUTH_APP_KEY", "ZHIHU_OAUTH_REDIRECT_URI"];
test("public web auth defaults to Zhihu without exposing any old or new server credentials", async () => {
  const saved = names.map(name => [name, process.env[name]] as const);
  try {
    for (const name of names) delete process.env[name];
    process.env.GONGZHI_AUTH_ENABLED = "true";
    process.env.SUPABASE_URL = "http://127.0.0.1:56501";
    process.env.SUPABASE_ANON_KEY = "legacy-anon-not-a-web-login";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only";
    process.env.OPENAI_API_KEY = "model-only";
    process.env.DATABASE_URL = "postgres://private-db-credential";
    process.env.GONGZHI_DATABASE_ENABLED = "true";
    const unavailable = { available: false, provider: "zhihu", url: null, public_key: null, endpoints: WEB_AUTH_ENDPOINTS };
    assert.deepEqual(getPublicConfig().auth, unavailable, "no automatic Supabase web fallback");
    assert.equal(getAuthConfiguration().enabled, true, "legacy server getUser stays enabled");
    process.env.SITE_URL = "https://gongzhi.example.invalid";
    process.env.ZHIHU_OAUTH_APP_ID = "fixture-app";
    process.env.ZHIHU_OAUTH_APP_KEY = "fixture-key-server-only";
    process.env.ZHIHU_OAUTH_REDIRECT_URI = `${process.env.SITE_URL}/auth/zhihu/callback`;
    const response = GET();
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.deepEqual(body.data.auth, { ...unavailable, available: true });
    for (const key of ["DATABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY", "ZHIHU_OAUTH_APP_KEY"]) assert.ok(!JSON.stringify(body).includes(process.env[key]!));
    for (const redirect of ["http://gongzhi.example.invalid/auth/zhihu/callback", "https://user:password@gongzhi.example.invalid/auth/zhihu/callback", "https://other.invalid/auth/zhihu/callback", `${process.env.SITE_URL}/wrong`, `${process.env.SITE_URL}/auth/zhihu/callback?state=preselected`]) {
      process.env.ZHIHU_OAUTH_REDIRECT_URI = redirect;
      assert.equal(getWebAuthConfiguration(), null);
      assert.equal(getPublicConfig().auth.available, false);
    }
    process.env.ZHIHU_OAUTH_REDIRECT_URI = `${process.env.SITE_URL}/auth/zhihu/callback`;
    delete process.env.ZHIHU_OAUTH_APP_KEY;
    assert.deepEqual(getPublicConfig().auth, unavailable);
  } finally { for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } }
});
test("runtime auth preserves demo isolation and unconfigured behavior", async () => {
  for (const auth of [createBrowserAuth("demo", { available: true, provider: "zhihu", url: null, public_key: null }), createBrowserAuth("live", { available: false, provider: "zhihu", url: null, public_key: null })]) {
    assert.equal(auth.available, false); assert.equal(await auth.initialize(), null);
    await assert.rejects(auth.signIn("test@example.invalid", "unused"), (e: unknown) => e instanceof ApiClientError && e.error.code === "unavailable");
    await assert.rejects(auth.startSignIn(), (e: unknown) => e instanceof ApiClientError && e.error.code === "unavailable");
    auth.dispose();
  }
});
test("web auth client shares the live envelope and same-origin cookie policy", async () => {
  const calls: string[] = [];
  const api = createApiClient("live", { fetch: (async (url, init) => {
    calls.push(String(url)); assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store");
    if (url === "/api/gongzhi/config") return GET();
    return Response.json({ ok: true, mode: "live", data: {} });
  }) as typeof fetch });
  assert.equal((await api.readConfig()).api_base, "/api/gongzhi");
  await api.startZhihuLogin(); await api.readAuthSession(); await api.logout();
  assert.deepEqual(calls, ["/api/gongzhi/config", WEB_AUTH_ENDPOINTS.start, WEB_AUTH_ENDPOINTS.session, WEB_AUTH_ENDPOINTS.logout]);
});
