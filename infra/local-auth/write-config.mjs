// Bootstrap-only legacy API keys follow the official Supabase generate-keys.sh
// role/iss/iat/exp format. User sessions are issued by GoTrue, never by this script.
// https://github.com/supabase/supabase/blob/master/docker/utils/generate-keys.sh
import { randomBytes, createHmac } from "node:crypto";
import { writeFile, realpath, readFile, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { defaultProfile, parseProfile, renderNginx } from "./local-profile.mjs";
const profile = parseProfile(process.argv.slice(3));
const dir = await realpath(process.argv[2]);
const relation = relative(resolve(import.meta.dirname, "../.."), dir);
if (!relation.startsWith("..") && !relation.includes(":")) throw new Error("Use a private directory outside the repository");
if ((await readdir(dir)).length) throw new Error("Configuration directory must be empty; never overwrite or rotate existing configuration");
const local = profile.project === defaultProfile.project ? {} : { GONGZHI_LOCAL_PROJECT: profile.project, GONGZHI_LOCAL_PG_PORT: String(profile.pgPort), GONGZHI_LOCAL_AUTH_PORT: String(profile.authPort), GONGZHI_LOCAL_APP_PORT: String(profile.appPort) };
const random = () => randomBytes(32).toString("hex");
const password = random(), authPassword = random(), appPassword = random(), secret = random();
const apiKey = role => {
  const iat = Math.floor(Date.now()/1000);
  const value = [ { alg: "HS256", typ: "JWT" }, { role, iss: "supabase", iat, exp: iat + 365 * 86400 } ].map(v => Buffer.from(JSON.stringify(v)).toString("base64url")).join(".");
  return `${value}.${createHmac("sha256", secret).update(value).digest("base64url")}`;
};
const anonKey = apiKey("anon"), serviceKey = apiKey("service_role");
const runtime = { ...local, GONGZHI_DATABASE_ENABLED: "true", GONGZHI_AUTH_ENABLED: "true", DATABASE_URL: `postgres://crier_app:${appPassword}@127.0.0.1:${profile.pgPort}/gongzhi`, SUPABASE_URL: `http://127.0.0.1:${profile.authPort}`, SUPABASE_PUBLIC_URL: `http://127.0.0.1:${profile.authPort}`, SUPABASE_ANON_KEY: anonKey, CRIER_HASH_SECRET: random(), SITE_URL: `http://127.0.0.1:${profile.appPort}`, NEXT_TELEMETRY_DISABLED: "1" };
const files = {
  "compose.env": { POSTGRES_PASSWORD: password, AUTH_DB_PASSWORD: authPassword, APP_DB_PASSWORD: appPassword, JWT_SECRET: secret, COMPOSE_PROJECT_NAME: profile.project, PG_PORT: String(profile.pgPort), AUTH_PORT: String(profile.authPort), APP_PORT: String(profile.appPort), GONGZHI_NGINX_CONFIG: resolve(dir, "nginx.conf").replaceAll("\\", "/") },
  "runtime.env": runtime,
  "admin.env": { ...runtime, MIGRATION_DATABASE_URL: `postgres://postgres:${password}@127.0.0.1:${profile.pgPort}/gongzhi`, SUPABASE_SERVICE_ROLE_KEY: serviceKey },
  "accounts.env": { GONGZHI_TEST_EMAIL: "core-owner@example.invalid", GONGZHI_TEST_PASSWORD: random(), GONGZHI_TEST_OTHER_EMAIL: "core-other@example.invalid", GONGZHI_TEST_OTHER_PASSWORD: random(), GONGZHI_TEST_UNBOUND_EMAIL: "core-unbound@example.invalid", GONGZHI_TEST_UNBOUND_PASSWORD: random() },
};
await writeFile(resolve(dir, "nginx.conf"), renderNginx(await readFile(new URL("nginx.conf", import.meta.url), "utf8"), profile), { flag: "wx", mode: 0o600 });
for (const [name, values] of Object.entries(files)) await writeFile(resolve(dir, name), Object.entries(values).map(([k,v])=>`${k}=${v}`).join("\n")+"\n", { flag: "wx", mode: 0o600 });
console.log(`Private configuration created in ${dir}; values suppressed`);
