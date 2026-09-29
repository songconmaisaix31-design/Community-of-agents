import { defineConfig } from "@playwright/test";
import integration from "./playwright.config";

export default defineConfig({
  ...integration,
  testMatch: "evomap-static.spec.ts",
  use: { ...integration.use, baseURL: process.env.GONGZHI_TEST_BASE_URL ?? "http://127.0.0.1:3029", trace: "off", screenshot: "off" },
});
