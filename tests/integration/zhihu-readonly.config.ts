import { defineConfig } from "@playwright/test";
import integration from "./playwright.config";

export default defineConfig({
  ...integration,
  testMatch: "zhihu-readonly.spec.ts",
  use: { ...integration.use, trace: "off", screenshot: "off", serviceWorkers: "block" },
});
