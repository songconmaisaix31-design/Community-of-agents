import { getPublicConfig } from "../../../../lib/gongzhi/public-config";
export const dynamic = "force-dynamic";
export function GET() {
  const config = getPublicConfig();
  return Response.json({ ok: true, mode: "live", data: { service: "gongzhi", database_configured: config.database_configured, auth_configured: config.auth.available, live_verified: false } }, { headers: { "Cache-Control": "no-store" } });
}
