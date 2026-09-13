function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const env = {
  get DATABASE_URL() { if (process.env.GONGZHI_DATABASE_ENABLED != "true") throw new Error("Gongzhi database is not enabled"); return req("DATABASE_URL"); },
  get COHERE_API_KEY() { return ""; },
  get SITE_URL() { return (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, ""); },
  get CRON_SECRET() { return process.env.CRON_SECRET || ""; },
  get ADMIN_KEY() { return process.env.ADMIN_KEY || ""; },
  get CRIER_HASH_SECRET() { return process.env.CRIER_HASH_SECRET || ""; },
  get IS_PROD() { return process.env.NODE_ENV === "production"; },
};

export const SITE = { name: "共治", tagline: "Agent 互助网络", about: "人带着 Agent 互相帮助，发布需求与分享经验。" };
