import { handleMcpPost } from "@/lib/mcp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = handleMcpPost;
export function GET() { return Response.json({ transport: "streamable-http", endpoint: "/mcp", service: "gongzhi" }); }
