// Runs on the new server only. Bootstrap API keys follow Supabase's official legacy
// role/iss/iat/exp format; this never signs user sessions or creates Auth users.
import { randomBytes, createHmac } from "node:crypto";
import { writeFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
export const productionDomain = "zhihu.davidwang.space";
export function productionEnvironments({ postgresPassword, authPassword, appPassword, jwtSecret, anonKey, serviceKey, hashSecret }) {
  const site = `https://${productionDomain}`;
  const tls = { GONGZHI_PRODUCTION_DEPLOYMENT: productionDomain, GONGZHI_DATABASE_CA_FILE: "/run/secrets/db-ca.crt" };
  return {
    "db.env": { POSTGRES_DB: "gongzhi", POSTGRES_USER: "postgres", POSTGRES_PASSWORD: postgresPassword, POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256 --auth-local=peer", AUTH_DB_PASSWORD: authPassword, APP_DB_PASSWORD: appPassword },
    "auth.env": { GOTRUE_API_HOST: "0.0.0.0", GOTRUE_API_PORT: "9999", API_EXTERNAL_URL: `${site}/auth/v1`, GOTRUE_SITE_URL: site, GOTRUE_URI_ALLOW_LIST: `${site}/**`, GOTRUE_DB_DRIVER: "postgres", GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${authPassword}@db:5432/gongzhi?sslmode=verify-full&sslrootcert=/run/secrets/db-ca.crt&search_path=auth`, GOTRUE_DB_NAMESPACE: "auth", GOTRUE_JWT_SECRET: jwtSecret, GOTRUE_JWT_EXP: "3600", GOTRUE_JWT_AUD: "authenticated", GOTRUE_JWT_ADMIN_ROLES: "service_role", GOTRUE_JWT_ISSUER: `${site}/auth/v1`, GOTRUE_DISABLE_SIGNUP: "true", GOTRUE_EXTERNAL_EMAIL_ENABLED: "true", GOTRUE_EXTERNAL_PHONE_ENABLED: "false", GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: "false", GOTRUE_MAILER_AUTOCONFIRM: "false", GOTRUE_SMTP_HOST: "127.0.0.1", GOTRUE_SMTP_PORT: "1", GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: "true", GOTRUE_LOG_LEVEL: "warn" },
    "app.env": { ...tls, NODE_ENV: "production", DATABASE_URL: `postgres://crier_app:${appPassword}@db:5432/gongzhi`, GONGZHI_DATABASE_ENABLED: "true", GONGZHI_AUTH_ENABLED: "true", SUPABASE_URL: "http://proxy:8080", SUPABASE_PUBLIC_URL: site, SUPABASE_ANON_KEY: anonKey, CRIER_HASH_SECRET: hashSecret, SITE_URL: site, GONGZHI_ASSISTANT_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1" },
    "migration.env": { ...tls, NODE_ENV: "production", GONGZHI_DATABASE_ENABLED: "true", MIGRATION_DATABASE_URL: `postgres://postgres:${postgresPassword}@db:5432/gongzhi`, SITE_URL: site },
    // Kept outside all service mounts/env; any later account management needs its own approval.
    "operator.env": { SUPABASE_SERVICE_ROLE_KEY: serviceKey },
    "compose.env": { GONGZHI_PRODUCTION_SECRETS: "/etc/gongzhi/production" },
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== "linux" || process.getuid() !== 0 || process.argv[2] !== "/private") throw new Error("Use the server-only generate-config.sh entry point");
  const dir = await realpath("/private");
  const random = () => randomBytes(32).toString("hex");
  const jwtSecret = random();
  const apiKey = role => {
    const iat = Math.floor(Date.now() / 1000);
    const data = [{ alg: "HS256", typ: "JWT" }, { role, iss: "supabase", iat, exp: iat + 365 * 86400 }].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
    return `${data}.${createHmac("sha256", jwtSecret).update(data).digest("base64url")}`;
  };
  const files = productionEnvironments({ postgresPassword: random(), authPassword: random(), appPassword: random(), jwtSecret, anonKey: apiKey("anon"), serviceKey: apiKey("service_role"), hashSecret: random() });
  for (const [name, values] of Object.entries(files)) await writeFile(resolve(dir, name), Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
  console.log("Production environment files created; all values suppressed");
}
