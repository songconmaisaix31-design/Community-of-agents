/** Remote databases always require TLS; the Docker host opt-in is local-only. */
export function databaseSsl(connection: string, localDocker = process.env.GONGZHI_LOCAL_DOCKER_DATABASE): "require" | undefined {
  const url = new URL(connection);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const dockerHost = localDocker === "true" && url.hostname === "host.docker.internal";
  return loopback || dockerHost || connection.includes("host=/") ? undefined : "require";
}
