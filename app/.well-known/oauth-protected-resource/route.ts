import { handleOAuth } from "@/lib/gongzhi/mcp-oauth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (req: Request) => handleOAuth(req, "resource");
