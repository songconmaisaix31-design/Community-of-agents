import { test, expect } from "@playwright/test";

test("served public configuration and ESM expose the shared client without signing in", async ({ page, request }) => {
  const response = await request.get("/api/gongzhi/config");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const envelope = await response.json();
  expect(Object.keys(envelope).sort()).toEqual(["data", "mode", "ok"]);
  expect(envelope.ok).toBe(true);
  expect(envelope.mode).toBe("live");
  expect(Object.keys(envelope.data).sort()).toEqual(["api_base", "auth", "contract_version", "database_configured"]);
  expect(Object.keys(envelope.data.auth).sort()).toEqual(["available", "public_key", "url"]);
  // Never attach configuration values, bearer tokens or credentials to the report.
  await page.goto("/zh");
  const client = await page.evaluate(async () => {
    const path = "/community/assets/gongzhi-client.js";
    const module = await import(path);
    const { config, auth, api } = await module.createGongzhiBrowserClient();
    const user = await auth.initialize();
    const result = {
      version: config.contract_version,
      databaseConfigured: config.database_configured,
      authAvailable: auth.available,
      initializedWithoutUser: user === null,
      hasToken: Boolean(auth.getAccessToken()),
      hasSharedApi: typeof api.createAuthorization === "function" && typeof api.postReply === "function" && typeof api.decideResult === "function",
    };
    auth.dispose();
    return result;
  });
  expect(client.version).toBe("gongzhi.v1");
  expect(client.hasSharedApi).toBe(true);
  expect(client.initializedWithoutUser).toBe(true);
  expect(client.hasToken).toBe(false);
  expect(client.authAvailable).toBe(envelope.data.auth.available);
  if (process.env.GONGZHI_TEST_REQUIRE_CONFIGURED === "1") {
    expect(client.authAvailable).toBe(true);
    expect(client.databaseConfigured).toBe(true);
  }
  // This is a served-client/configuration probe, not proof of GoTrue or PG connectivity.
});
