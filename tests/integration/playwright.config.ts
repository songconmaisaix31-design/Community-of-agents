import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const baseURL = process.env.GONGZHI_TEST_BASE_URL ?? "http://127.0.0.1:3019";
const origin = new URL(baseURL);
if (origin.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)) {
  throw new Error("Browser acceptance only targets an explicitly local HTTP server");
}
const artifacts = resolve(process.env.GONGZHI_BROWSER_ARTIFACTS ?? join(tmpdir(), `gongzhi-browser-${Date.now()}`));
console.log(`Browser acceptance artifacts: ${artifacts}`);

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: join(artifacts, "results"),
  reporter: [["list"], ["json", { outputFile: join(artifacts, "report.json") }]],
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    channel: "chrome",
    headless: true,
    serviceWorkers: "allow",
    launchOptions: { args: ["--disable-background-networking"] },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 960 } } },
    { name: "narrow", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
