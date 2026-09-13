import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(resolve(root, "frontend/hugo"))) {
  console.error("Hugo source is missing: integrate Builder's frontend/hugo first. Backend-only verification: npm run build:backend.");
  process.exit(1);
}
const watch = process.argv.includes("--watch");
// Fixed local input/output only. No package downloads, deployment or migrations.
const child = spawn("hugo", ["--source", "frontend/hugo", "--destination", "../../public/hugo", "--baseURL", "/hugo/", ...(watch ? ["--watch"] : [])], { cwd: root, stdio: "inherit", windowsHide: true });
child.on("error", error => {
  console.error(error.code === "ENOENT" ? "Hugo Extended is required on PATH (verified with v0.164.0); install it before building the product frontend." : `Hugo could not start: ${error.code ?? "unknown error"}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
