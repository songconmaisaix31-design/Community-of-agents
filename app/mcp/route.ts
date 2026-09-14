import { handleMcpPost, handleMcpUnsupportedMethod } from "@/lib/mcp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = handleMcpPost;
export const GET = handleMcpUnsupportedMethod;
export const HEAD = handleMcpUnsupportedMethod;
export const DELETE = handleMcpUnsupportedMethod;
export const OPTIONS = handleMcpUnsupportedMethod;
