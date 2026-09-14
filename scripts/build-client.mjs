import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({ absWorkingDir: root, entryPoints: ["lib/gongzhi/browser-client.ts"], outfile: "public/community/assets/gongzhi-client.js", bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true, legalComments: "inline", define: {
  "process.env.NODE_ENV": '"production"',
  "process.env.NEXT_PUBLIC_SUPABASE_URL": "undefined",
  "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": "undefined",
  "process.env.NEXT_PUBLIC_GONGZHI_AUTH_ENABLED": "undefined",
} });
console.log("Built self-hosted /community/assets/gongzhi-client.js (runtime public config; no embedded credentials)");
