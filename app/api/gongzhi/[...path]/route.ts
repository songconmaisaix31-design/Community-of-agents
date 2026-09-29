import { handleGongzhiRequest } from "@/lib/gongzhi/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function route(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return handleGongzhiRequest(req, (await ctx.params).path);
}
export { route as GET, route as POST, route as PATCH, route as DELETE, route as PUT };
