import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

test("self-hosted ESM restores a real GoTrue session and authorizes the container HTTP service", { skip: !process.env.GONGZHI_BROWSER_TEST_URL }, async () => {
  const url = new URL(process.env.GONGZHI_BROWSER_TEST_URL!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "3041");
  assert.equal(process.env.GONGZHI_REAL_AUTH_TEST, "true");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${url.origin}/api/gongzhi/config`);
    const signedIn = await page.evaluate(async ({ email, password }) => {
      const modulePath = "/community/assets/gongzhi-client.js";
      const { createGongzhiBrowserClient } = await import(modulePath);
      const { config, auth, api } = await createGongzhiBrowserClient();
      await auth.initialize();
      const user = await auth.signIn(email, password);
      const owners = await api.listOwners();
      const result = { available: config.auth.available, hasToken: Boolean(auth.getAccessToken()), hasUser: Boolean(user.id), boundHuman: owners.some((owner: {kind:string}) => owner.kind === "human") };
      auth.dispose(); return result;
    }, { email: process.env.GONGZHI_TEST_EMAIL!, password: process.env.GONGZHI_TEST_PASSWORD! });
    assert.deepEqual(signedIn, { available: true, hasToken: true, hasUser: true, boundHuman: true });
    await page.reload();
    const restored = await page.evaluate(async () => {
      const modulePath = "/community/assets/gongzhi-client.js";
      const { createGongzhiBrowserClient } = await import(modulePath);
      const { auth, api } = await createGongzhiBrowserClient();
      const user = await auth.initialize();
      const owners = await api.listOwners();
      await auth.signOut(); const tokenCleared = auth.getAccessToken() === undefined;
      auth.dispose(); return { hasUser: Boolean(user?.id), hasOwners: owners.length > 0, tokenCleared };
    });
    assert.deepEqual(restored, { hasUser: true, hasOwners: true, tokenCleared: true });
    const demo = await page.request.post(`${url.origin}/demo/api/needs`, { data: {} });
    assert.ok(demo.status() >= 400);
    // The Next not-found shell loads the real compiled global CSS without any
    // product workflow or mock request; this exercises the PostCSS build output.
    await page.goto(`${url.origin}/core-build-css-check-not-found`);
    const light = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--c-bg").trim());
    assert.ok(light.includes("220") && light.includes("96%"), "compiled light-theme CSS must apply in the browser");
    const dark = await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; return getComputedStyle(document.documentElement).getPropertyValue("--c-bg").trim(); });
    assert.equal(dark, "0 0% 0%");
  } finally { await browser.close(); }
});
