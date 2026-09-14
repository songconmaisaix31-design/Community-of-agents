// Narrow operator-only production path; build/start never set the confirmation.
export function migrationPolicy(args, env) {
  const target = "zhihu.davidwang.space";
  const confirmation = `--production-target=${target}`;
  if (args.includes("--if-production") || args.some(arg => arg !== confirmation) || args.length > 1) throw new Error("migrate: production execution is disabled without the explicit reviewed target");
  if (env.GONGZHI_DATABASE_ENABLED !== "true" || !env.MIGRATION_DATABASE_URL) throw new Error("migrate: explicitly set GONGZHI_DATABASE_ENABLED=true and MIGRATION_DATABASE_URL");
  const production = env.NODE_ENV === "production" || env.VERCEL_ENV === "production" || !!env.GONGZHI_PRODUCTION_DEPLOYMENT || args.includes(confirmation);
  if (!production) return { production: false };
  let url;
  try { url = new URL(env.MIGRATION_DATABASE_URL); } catch { throw new Error("migrate: invalid production target"); }
  if (!args.includes(confirmation) || env.GONGZHI_PRODUCTION_DEPLOYMENT !== target || env.GONGZHI_PRODUCTION_MIGRATION !== target || env.SITE_URL !== `https://${target}` || env.GONGZHI_DATABASE_CA_FILE !== "/run/secrets/db-ca.crt" || env.GONGZHI_LOCAL_DOCKER_DATABASE === "true" || !["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "db" || url.port !== "5432" || url.pathname !== "/gongzhi" || url.username !== "postgres" || !url.password || url.search || url.hash) throw new Error("migrate: production authorization refused; exact target, role and verified TLS required");
  return { production: true, caFile: env.GONGZHI_DATABASE_CA_FILE };
}
