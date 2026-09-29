// Explicit local-only configuration; never infer a new target from ambient URLs.
export const defaultProfile = Object.freeze({ project: "gongzhi-live-20260914", pgPort: 56520, authPort: 56521, appPort: 3039 });
const reservedPorts = new Set([56520, 56521, 56406, 3039, 3041, 3043, 8123, 3019, 3029]);
export function isolatedProfile({ project, pgPort, authPort, appPort }) {
  const ports = [pgPort, authPort, appPort].map(value => /^\d+$/.test(String(value)) ? Number(value) : NaN);
  if (!/^gongzhi-[a-z0-9][a-z0-9-]{0,60}$/.test(project ?? "") || project === defaultProfile.project ||
      ports.some(port => !Number.isInteger(port) || port < 1024 || port > 65535 || reservedPorts.has(port)) || new Set(ports).size !== 3) {
    throw new Error("Explicit isolated project and three distinct non-reserved local ports required");
  }
  return { project, pgPort: ports[0], authPort: ports[1], appPort: ports[2] };
}
export function parseProfile(args) {
  if (!args.length) return defaultProfile;
  const names = { "--project": "project", "--pg-port": "pgPort", "--auth-port": "authPort", "--app-port": "appPort" };
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const name = names[args[i]];
    if (!name || Object.hasOwn(values, name) || !args[i + 1]) throw new Error("Invalid local profile arguments");
    values[name] = args[i + 1];
  }
  return isolatedProfile(values);
}
export function profileFromEnv(env) {
  return isolatedProfile({ project: env.GONGZHI_LOCAL_PROJECT, pgPort: env.GONGZHI_LOCAL_PG_PORT, authPort: env.GONGZHI_LOCAL_AUTH_PORT, appPort: env.GONGZHI_LOCAL_APP_PORT });
}
export function testProfileFromEnv(env) {
  if (env.GONGZHI_ISOLATED_TEST === "true") return profileFromEnv(env);
  if (env.GONGZHI_ISOLATED_TEST || Object.keys(env).some(key => key.startsWith("GONGZHI_LOCAL_") && env[key])) throw new Error("Explicit isolated test profile required");
  return defaultProfile;
}
export function assertLocalDatabase(value, port, name, role = "crier_app") {
  let url;
  try { url = new URL(value ?? ""); } catch { throw new Error("Dedicated local test database target mismatch"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "127.0.0.1" || url.port !== String(port) || url.pathname !== `/${name}` || url.username !== role || url.search || url.hash) throw new Error("Dedicated local test database target mismatch");
  return url;
}
export function assertLocalAuth(value, port) {
  const url = new URL(value ?? "");
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port !== String(port) || url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error("Local Auth target mismatch");
  return url;
}
export function renderNginx(template, profile) {
  const original = "(3039|3041)";
  if (!template.includes(original)) throw new Error("Local nginx template changed; review before generating");
  return profile.project === defaultProfile.project ? template : template.replace(original, `(${profile.appPort})`);
}
