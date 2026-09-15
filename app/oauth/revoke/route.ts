import { handleOAuth } from "@/lib/gongzhi/mcp-oauth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (req: Request) => handleOAuth(req, "revoke");
