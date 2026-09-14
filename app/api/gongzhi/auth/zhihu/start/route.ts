import { handleWebAuth } from "../../../../../../lib/gongzhi/web-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (req: Request) => handleWebAuth(req, "start");
