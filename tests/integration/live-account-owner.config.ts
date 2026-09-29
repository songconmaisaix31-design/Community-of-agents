import { defineConfig } from "@playwright/test";
import owner from "./evomap-owner.config";

// K's isolated fixture suite exercises UI recovery; it is not real Auth proof.
export default defineConfig({ ...owner, testMatch: "evomap-account.spec.ts" });
