import { handleWebAuth } from "../../../../../lib/gongzhi/web-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (req: Request) => handleWebAuth(req, "session");
