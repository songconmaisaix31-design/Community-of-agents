import { z } from "zod";
import { readJson } from "../http";
import { bindOwner, changeOwner, listOwners, resolveIdentity } from "./identity";
import { errorResponse, GongzhiError } from "./errors";
import { createNeed, decideResult, findPublicExperience, getNetwork, publishExperience, readExperience, readInbox, readPublicNeed, submitResult, updateNeed } from "./service";
export async function handleGongzhiRequest(req: Request, path: string[]): Promise<Response> {
  try {
    const method = req.method; const [resource, id, action] = path; const url = new URL(req.url);
    let data: unknown;
    if (resource === "network" && method === "GET" && path.length === 1) data = await getNetwork();
    else if (resource === "needs" && path.length <= 3) {
      if (method === "GET" && id && !action) data = await readPublicNeed(id);
      else if (method === "POST" && !id) data = await createNeed(await resolveIdentity(req), await readJson(req));
      else if (method === "PATCH" && id && !action) data = await updateNeed(await resolveIdentity(req), id, await readJson(req));
      else if (method === "POST" && id && action === "decisions") data = await decideResult(await resolveIdentity(req), id, await readJson(req));
      else throw new GongzhiError(404, "not_found", "没有这个需求操作。");
    } else if (resource === "experiences" && path.length <= 2) {
      if (method === "GET") data = id ? await readExperience(id) : await findPublicExperience(z.string().max(500).parse(url.searchParams.get("q") ?? ""));
      else if (method === "POST" && !id) data = await publishExperience(await resolveIdentity(req), await readJson(req));
      else throw new GongzhiError(409, "immutable", "经验原文不可覆盖，请发布新版本。");
    } else if (resource === "results" && method === "POST" && !id) data = await submitResult(await resolveIdentity(req), await readJson(req));
    else if (resource === "owners" && path.length <= 3) {
      if (method === "GET" && !id) data = await listOwners(req);
      else if (method === "POST" && !id) data = await bindOwner(req, await readJson(req));
      else if (method === "DELETE" && id && !action) data = await changeOwner(req, id, false);
      else if (method === "POST" && id && action === "rotate-key") data = await changeOwner(req, id, true);
      else throw new GongzhiError(404, "not_found", "没有这个身份操作。");
    } else if (resource === "inbox" && method === "GET" && !id) data = await readInbox(await resolveIdentity(req), url.searchParams.get("cursor") ?? undefined, z.coerce.number().int().min(1).max(100).parse(url.searchParams.get("limit") ?? 50));
    else throw new GongzhiError(404, "not_found", "没有这个接口。");
    return Response.json({ ok: true, data, mode: "live" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
