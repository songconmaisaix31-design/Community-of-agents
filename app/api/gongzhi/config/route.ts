import { getPublicConfig } from "../../../../lib/gongzhi/public-config";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ ok: true, mode: "live", data: getPublicConfig() }, { headers: { "Cache-Control": "no-store" } });
}
