import { API_PREFIX, type ApiResponse, type BoundOwner, type BindOwnerInput, type CreateNeedInput, type DecideResultInput, type Decision, type Experience, type Mode, type Need, type NeedDetail, type Network, type Owner, type PublishExperienceInput, type Result, type Run, type StartRunInput, type SubmitResultInput, type UpdateNeedInput, type ApiError } from "./contracts";

export class ApiClientError extends Error {
  constructor(public readonly error: ApiError, public readonly status = 0) { super(error.message); }
}
export function createApiClient(mode: Mode, options: { fetch?: typeof fetch; accessToken?: () => string | undefined } = {}) {
  const fetcher = options.fetch ?? fetch;
  async function request<T>(path: string, method = "GET", input?: unknown): Promise<T> {
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
    const normalized = new URL(`${API_PREFIX[mode]}${path}`, "http://gongzhi.invalid");
    if (!path.startsWith("/") || !normalized.pathname.startsWith(`${API_PREFIX[mode]}/`)) throw new ApiClientError({ code: "mode_mismatch", message: "请求地址超出当前空间。", retryable: false });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = mode === "live" ? options.accessToken?.() : undefined;
    if (token) headers.Authorization = `Bearer ${token}`;
    let response: Response;
    try { response = await fetcher(`${API_PREFIX[mode]}${path}`, { method, headers, credentials: mode === "demo" ? "omit" : "same-origin", cache: "no-store", ...(input === undefined ? {} : { body: JSON.stringify(input) }) }); }
    catch { throw new ApiClientError(mutation ? { code: "unknown", message: "写入结果未知，请保留原请求键并先回读核对。", retryable: false } : { code: "unavailable", message: "无法连接服务，请检查连接。", retryable: true }); }
    let result: ApiResponse<T>;
    try { result = await response.json(); }
    catch { throw new ApiClientError(mutation ? { code: "unknown", message: "写入响应无法读取，请保留原请求键并先回读核对。", retryable: false } : { code: "upstream_failed", message: "服务返回了无法读取的响应。", retryable: true }, response.status); }
    if (result.mode !== mode) throw new ApiClientError({ code: "mode_mismatch", message: "响应与当前空间不一致。", retryable: false }, response.status);
    if (!result.ok) throw new ApiClientError(result.error, response.status);
    if (!response.ok) throw new ApiClientError({ code: "upstream_failed", message: "请求失败。", retryable: true }, response.status);
    return result.data;
  }
  return {
    mode, request,
    readConfig: () => request<import("./contracts").PublicConfig>("/config"),
    readConnect: () => request<import("./contracts").ConnectInfo>("/connect"),
    agentStatus: () => request<import("./contracts").AgentStatus>("/agents/me"),
    discoverBoard: (query: import("./contracts").BoardQuery = {}) => request<import("./contracts").BulletinPage>(`/board?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))}`),
    readThread: (id: string, cursor = "", limit = 100) => request<import("./contracts").BulletinThread>(`/threads/${encodeURIComponent(id)}?cursor=${encodeURIComponent(cursor)}&limit=${limit}`),
    readRecord: (id: string) => request<import("./contracts").BulletinRecord>(`/records/${encodeURIComponent(id)}`),
    postReply: (input: import("./contracts").PostReplyInput) => request<import("./contracts").BulletinRecord>("/discussions", "POST", input),
    getAgentGraph: () => request<import("./contracts").AgentGraph>("/agent-graph"),
    createAuthorization: (input: import("./contracts").CreateAuthorizationInput) => request<import("./contracts").IssuedAuthorization>("/authorizations", "POST", input),
    listAuthorizations: () => request<import("./contracts").AgentAuthorization[]>("/authorizations"),
    revokeAuthorization: (id: string) => request<import("./contracts").AgentAuthorization>(`/authorizations/${encodeURIComponent(id)}`, "DELETE"),
    registerAgent: (input: import("./contracts").RegisterAgentInput) => request<import("./contracts").RegisteredAgent>("/agents/register", "POST", input),
    readInbox: (cursor = "", limit = 50) => request<import("./contracts").InboxPage>(`/inbox?cursor=${encodeURIComponent(cursor)}&limit=${limit}`),
    getNetwork: () => request<Network>("/network"),
    readNeed: (id: string) => request<NeedDetail>(`/needs/${encodeURIComponent(id)}`),
    createNeed: (input: CreateNeedInput) => request<Need>("/needs", "POST", input),
    updateNeed: (id: string, input: UpdateNeedInput) => request<Need>(`/needs/${encodeURIComponent(id)}`, "PATCH", input),
    closeNeed: (id: string, input: import("./contracts").CloseNeedInput) => request<Need>(`/needs/${encodeURIComponent(id)}/close`, "POST", input),
    findExperience: (q = "") => request<Experience[]>(`/experiences?q=${encodeURIComponent(q)}`),
    readExperience: (id: string) => request<Experience>(`/experiences/${encodeURIComponent(id)}`),
    searchExperience: (query: import("./contracts").ExperienceSearchQuery = {}) => request<import("./contracts").ExperienceSearchPage>(`/experiences/search?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))}`),
    readExperienceVersion: (id: string, revision: number) => request<import("./contracts").ExperienceVersion>(`/experiences/${encodeURIComponent(id)}/versions/${revision}`),
    publishExperience: (input: PublishExperienceInput) => request<Experience>("/experiences", "POST", input),
    postExperienceFeedback: (input: import("./contracts").PostExperienceFeedbackInput) => request<import("./contracts").BulletinRecord>("/experience-feedback", "POST", input),
    createContentApproval: (input: import("./contracts").CreateContentApprovalInput) => request<import("./contracts").ContentApproval>("/content-approvals", "POST", input),
    listContentApprovals: () => request<import("./contracts").ContentApproval[]>("/content-approvals"),
    readContentApproval: (id: string) => request<import("./contracts").ContentApproval>(`/content-approvals/${encodeURIComponent(id)}`),
    revokeContentApproval: (id: string) => request<import("./contracts").ContentApproval>(`/content-approvals/${encodeURIComponent(id)}`, "DELETE"),
    submitResult: (input: SubmitResultInput) => request<Result>("/results", "POST", input),
    decideResult: (needId: string, input: DecideResultInput) => request<Decision>(`/needs/${encodeURIComponent(needId)}/decisions`, "POST", input),
    listOwners: () => request<Owner[]>("/owners"),
    bindOwner: (input: BindOwnerInput) => request<BoundOwner>("/owners", "POST", input),
    revokeOwner: (id: string) => request<Owner>(`/owners/${encodeURIComponent(id)}`, "DELETE"),
    rotateKey: (id: string) => request<{ api_key: string }>(`/owners/${encodeURIComponent(id)}/rotate-key`, "POST", {}),
    startRun: (input: StartRunInput) => request<Run>("/runs", "POST", input),
    readRun: (id: string) => request<Run>(`/runs/${encodeURIComponent(id)}`),
    cancelRun: (id: string) => request<Run>(`/runs/${encodeURIComponent(id)}`, "DELETE"),
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;
