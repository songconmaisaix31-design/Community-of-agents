import { defineConfig } from "@playwright/test";
import configured from "./live-client.config";

export default defineConfig({ ...configured, testMatch: "live-decision.spec.ts" });
