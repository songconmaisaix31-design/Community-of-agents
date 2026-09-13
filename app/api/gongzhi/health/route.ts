export function GET() {
  return Response.json({ ok: true, mode: "live", data: { service: "gongzhi", database_configured: Boolean(process.env.GONGZHI_DATABASE_ENABLED === "true" && process.env.DATABASE_URL), auth_configured: Boolean(process.env.GONGZHI_AUTH_ENABLED === "true" && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY), live_verified: false } });
}
