import { defineConfig } from "@playwright/test";
import integration from "./playwright.config";

export default defineConfig({
  ...integration,
  testMatch: "live-client.spec.ts",
  use: {
    ...integration.use,
    baseURL: process.env.GONGZHI_TEST_BASE_URL ?? "http://127.0.0.1:3039",
    trace: "off",
    screenshot: "off",
  },
  projects: [{ name: "live-client-chrome", use: { viewport: { width: 1440, height: 960 } } }],
});
