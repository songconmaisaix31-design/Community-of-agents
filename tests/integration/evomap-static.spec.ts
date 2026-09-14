import { test, expect } from "@playwright/test";

test("root opens the selected zh static page with isolated local assets", async ({ page, context, baseURL }, info) => {
  const origin = new URL(baseURL!).origin;
  const external: string[] = [], assets: string[] = [], broken: string[] = [], errors: string[] = [];
  const assetTypes = new Set(["stylesheet", "script", "image", "font"]);
  await context.route("**/*", route => {
    if (new URL(route.request().url()).origin !== origin) {
      external.push(route.request().url()); return route.abort();
    }
    return route.continue();
  });
  page.on("request", request => { if (assetTypes.has(request.resourceType())) assets.push(new URL(request.url()).pathname); });
  page.on("response", response => { if (response.status() >= 400 && assetTypes.has(response.request().resourceType())) broken.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/zh\/?$/);
  await expect(page).toHaveTitle(/共治/);
  await expect(page.locator("h1:visible").first()).toBeVisible();
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath("selected-zh-page.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(assets.length).toBeGreaterThan(0);
  expect(assets.filter(path => !path.startsWith("/community/"))).toEqual([]);
  expect(external).toEqual([]);
  expect(broken).toEqual([]);
  expect(errors).toEqual([]);
});
