import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";
export default defineConfig({
  testDir: ".", testMatch: "evomap*.spec.ts", workers: 1, fullyParallel: false,
  timeout: 60000, expect: { timeout: 15000 }, reporter: "list",
  outputDir: path.join(tmpdir(), "gongzhi-evomap-f-" + Date.now()),
  use: { browserName: "chromium", channel: "chrome", headless: true,
    viewport: { width: 1440, height: 1000 }, actionTimeout: 15000,
    trace: "off", screenshot: "off", video: "off" },
});
