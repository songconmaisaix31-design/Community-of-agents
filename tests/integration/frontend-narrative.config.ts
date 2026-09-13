import { defineConfig } from "@playwright/test";
import integration from "./playwright.config";

// Reuse the loopback guard, isolated artifacts and both viewport projects.
export default defineConfig({
  ...integration,
  testMatch: "frontend-narrative.spec.ts",
  projects: [
    ...integration.projects!,
    {
      name: "owner-narrative",
      testDir: "../frontend",
      testMatch: "narrative.spec.ts",
      use: { viewport: { width: 1440, height: 1000 } },
    },
  ],
});
