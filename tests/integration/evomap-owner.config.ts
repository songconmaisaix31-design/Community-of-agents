import { defineConfig } from "@playwright/test";
import integration from "./playwright.config";

// The owner's suite starts its own ephemeral loopback static server.
// Run with an isolated TEMP directory to preserve the owner's original screenshots.
export default defineConfig({
  ...integration,
  testDir: "../frontend",
  testMatch: "evomap.spec.ts",
  projects: [{ name: "owner-chrome", use: { viewport: { width: 1440, height: 960 } } }],
});
