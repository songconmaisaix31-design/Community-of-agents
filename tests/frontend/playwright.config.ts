import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";
export default defineConfig({
  // The Hugo product supersedes the historical Next-page selectors in journeys/assistant.
  testDir: ".", testMatch: "hugo*.spec.ts", fullyParallel: false, workers: 1, timeout: 60000,
  expect: { timeout: 15000 }, reporter: "list", outputDir: path.join(tmpdir(), "gongzhi-frontend-playwright"),
  use: { baseURL: "http://127.0.0.1:3219", browserName: "chromium", channel: "chrome", headless: true, viewport: { width: 1440, height: 1000 }, actionTimeout: 15000, trace: "off", screenshot: "off" },
  webServer: { command: "node node_modules/next/dist/bin/next start -p 3219 -H 127.0.0.1", cwd: process.cwd(), url: "http://127.0.0.1:3219", timeout: 120000, reuseExistingServer: false, env: { NET_TELEMETRY_DISABLED: "1", NEXT_TELEMETRY_DISABLED: "1", GONGZHI_DATABASE_ENABLED: "false", GONGZHI_AUTH_ENABLED: "false", GONGZHI_ASSISTANT_ENABLED: "false", NEXT_PUBLIC_GONGZHI_AUTH_ENABLED: "false" } },
});
