// Bootstrap-only legacy API keys follow the official Supabase generate-keys.sh
// role/iss/iat/exp format. User sessions are issued by GoTrue, never by this script.
// https://github.com/supabase/supabase/blob/master/docker/utils/generate-keys.sh
import { randomBytes, createHmac } from "node:crypto";
import { writeFile, realpath } from "node:fs/promises";
import { resolve, relative } from "node:path";
const dir = await realpath(process.argv[2]);
const relation = relative(resolve(import.meta.dirname, "../.."), dir);
if (!relation.startsWith("..") && !relation.includes(":")) throw new Error("Use a private directory outside the repository");
const random = () => randomBytes(32).toString("hex");
const password = random(), authPassword = random(), appPassword = random(), secret = random();
const apiKey = role => {
  const iat = Math.floor(Date.now()/1000);
  const value = [ { alg: "HS256", typ: "JWT" }, { role, iss: "supabase", iat, exp: iat + 365 * 86400 } ].map(v => Buffer.from(JSON.stringify(v)).toString("base64url")).join(".");
  return `${value}.${createHmac("sha256", secret).update(value).digest("base64url")}`;
};
const anonKey = apiKey("anon"), serviceKey = apiKey("service_role");
const runtime = { GONGZHI_DATABASE_ENABLED: "true", GONGZHI_AUTH_ENABLED: "true", DATABASE_URL: `postgres://crier_app:${appPassword}@127.0.0.1:56520/gongzhi`, SUPABASE_URL: "http://127.0.0.1:56521", SUPABASE_PUBLIC_URL: "http://127.0.0.1:56521", SUPABASE_ANON_KEY: anonKey, CRIER_HASH_SECRET: random(), SITE_URL: "http://127.0.0.1:3039", NEXT_TELEMETRY_DISABLED: "1" };
const files = {
  "compose.env": { POSTGRES_PASSWORD: password, AUTH_DB_PASSWORD: authPassword, APP_DB_PASSWORD: appPassword, JWT_SECRET: secret, PG_PORT: "56520", AUTH_PORT: "56521" },
  "runtime.env": runtime,
  "admin.env": { ...runtime, MIGRATION_DATABASE_URL: `postgres://postgres:${password}@127.0.0.1:56520/gongzhi`, SUPABASE_SERVICE_ROLE_KEY: serviceKey },
  "accounts.env": { GONGZHI_TEST_EMAIL: "core-owner@example.invalid", GONGZHI_TEST_PASSWORD: random(), GONGZHI_TEST_OTHER_EMAIL: "core-other@example.invalid", GONGZHI_TEST_OTHER_PASSWORD: random(), GONGZHI_TEST_UNBOUND_EMAIL: "core-unbound@example.invalid", GONGZHI_TEST_UNBOUND_PASSWORD: random() },
};
for (const [name, values] of Object.entries(files)) await writeFile(resolve(dir, name), Object.entries(values).map(([k,v])=>`${k}=${v}`).join("\n")+"\n", { flag: "wx", mode: 0o600 });
console.log(`Private configuration created in ${dir}; values suppressed`);
