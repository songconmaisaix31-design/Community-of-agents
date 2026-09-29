import { readFileSync } from "node:fs";

/** Remote databases always require TLS; the Docker host opt-in is local-only. */
export function databaseSsl(connection: string, localDocker = process.env.GONGZHI_LOCAL_DOCKER_DATABASE, caFile = process.env.GONGZHI_DATABASE_CA_FILE, deployment = process.env.GONGZHI_PRODUCTION_DEPLOYMENT): "require" | undefined | { ca: string; rejectUnauthorized: true } {
  const url = new URL(connection);
  if (deployment && (deployment !== "zhihu.davidwang.space" || !caFile || url.hostname !== "db" || url.port !== "5432" || url.pathname !== "/gongzhi" || url.username !== "crier_app" || url.search || url.hash || !["postgres:", "postgresql:"].includes(url.protocol) || localDocker === "true")) throw new Error("Production database target and CA must be explicitly configured");
  // A missing/unreadable CA fails before connecting; never fall back to encryption-only.
  if (caFile) return { ca: readFileSync(caFile, "utf8"), rejectUnauthorized: true };
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const dockerHost = localDocker === "true" && url.hostname === "host.docker.internal";
  return loopback || dockerHost || connection.includes("host=/") ? undefined : "require";
}
