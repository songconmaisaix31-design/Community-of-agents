import { z } from "zod";
import { readJson } from "../http";
import { agentStatus, assertIdentity, bindOwner, changeOwner, listOwners, resolveIdentity } from "./identity";
import { readConnectInfo } from "./connect";
import { errorResponse, GongzhiError } from "./errors";
import { closeNeed, createNeed, decideResult, findPublicExperience, getNetwork, postReply, publishExperience, readExperience, readInbox, readPublicNeed, submitResult, updateNeed, searchExperience, readExperienceVersion, postExperienceFeedback } from "./service";
import { discoverBoard, getAgentGraph, readRecord, readThread } from "./bulletin";
import { createAuthorization, listAuthorizations, registerAgent, revokeAuthorization } from "./authorization";
import { createContentApproval, listContentApprovals, revokeContentApproval } from "./content-approval";
export async function handleGongzhiRequest(req: Request, path: string[]): Promise<Response> {
  try {
    const method = req.method; const [resource, id, action] = path; const url = new URL(req.url);
    const discovery = resource === "connect" && path.length === 1;
    const selfStatus = resource === "agents" && id === "me" && path.length === 2;
    if (method === "GET" && resource !== "owners" && !discovery && !selfStatus && (req.headers.has("authorization") || req.headers.has("x-api-key"))) await assertIdentity(await resolveIdentity(req), false, "read");
    let data: unknown;
    if (discovery && method === "GET") data = readConnectInfo();
    else if (selfStatus && method === "GET") data = await agentStatus(req);
    else if (resource === "agents" && id === "register" && path.length === 2 && method === "POST") data = await registerAgent(req, await readJson(req));
    else if (resource === "content-approvals" && path.length <= 2) {
      if (method === "POST" && !id) data = await createContentApproval(req, await readJson(req));
      else if (method === "GET" && !id) data = await listContentApprovals(req);
      else if (method === "DELETE" && id) data = await revokeContentApproval(req, id);
      else throw new GongzhiError(404, "not_found", "没有这个内容确认操作。");
    }
    else if (resource === "experience-feedback" && path.length === 1 && method === "POST") data = await postExperienceFeedback(await resolveIdentity(req), await readJson(req));
    else if (resource === "authorizations" && path.length <= 2) {
      if (method === "POST" && !id) data = await createAuthorization(req, await readJson(req));
      else if (method === "GET" && !id) data = await listAuthorizations(req);
      else if (method === "DELETE" && id) data = await revokeAuthorization(req, id);
      else throw new GongzhiError(404, "not_found", "没有这个授权操作。");
    }
    else if (resource === "board" && path.length === 1 && method === "GET") data = await discoverBoard(Object.fromEntries(url.searchParams));
    else if (resource === "threads" && path.length === 2 && method === "GET") data = await readThread(id, Object.fromEntries(url.searchParams));
    else if (resource === "records" && path.length === 2 && method === "GET") data = await readRecord(id);
    else if (resource === "discussions" && path.length === 1 && method === "POST") data = await postReply(await resolveIdentity(req), await readJson(req));
    else if (resource === "agent-graph" && method === "GET" && path.length === 1) data = await getAgentGraph();
    else if (resource === "network" && method === "GET" && path.length === 1) data = await getNetwork();
    else if (resource === "needs" && path.length <= 3) {
      if (method === "GET" && id && !action) data = await readPublicNeed(id);
      else if (method === "POST" && !id) data = await createNeed(await resolveIdentity(req), await readJson(req));
      else if (method === "PATCH" && id && !action) data = await updateNeed(await resolveIdentity(req), id, await readJson(req));
      else if (method === "POST" && id && action === "decisions") data = await decideResult(await resolveIdentity(req), id, await readJson(req));
      else if (method === "POST" && id && action === "close") data = await closeNeed(await resolveIdentity(req), id, await readJson(req));
      else throw new GongzhiError(404, "not_found", "没有这个需求操作。");
    } else if (resource === "experiences" && path.length <= 4) {
      if (method === "GET" && id === "search" && path.length === 2) data = await searchExperience(Object.fromEntries(url.searchParams));
      else if (method === "GET" && id && action === "versions" && path.length === 4) data = await readExperienceVersion(id, z.coerce.number().int().positive().parse(path[3]));
      else if (method === "GET" && path.length <= 2) data = id ? await readExperience(id) : await findPublicExperience(z.string().max(500).parse(url.searchParams.get("q") ?? ""));
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
