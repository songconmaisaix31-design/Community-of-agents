import { API_PREFIX, type ApiResponse, type BoundOwner, type BindOwnerInput, type CreateNeedInput, type DecideResultInput, type Decision, type Experience, type Mode, type Need, type NeedDetail, type Network, type Owner, type PublishExperienceInput, type Result, type Run, type StartRunInput, type SubmitResultInput, type UpdateNeedInput, type ApiError } from "./contracts";

export class ApiClientError extends Error {
  constructor(public readonly error: ApiError, public readonly status = 0) { super(error.message); }
}
export function createApiClient(mode: Mode, options: { fetch?: typeof fetch; accessToken?: () => string | undefined } = {}) {
  const fetcher = options.fetch ?? fetch;
  async function request<T>(path: string, method = "GET", input?: unknown): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = mode === "live" ? options.accessToken?.() : undefined;
    if (token) headers.Authorization = `Bearer ${token}`;
    let response: Response;
    try { response = await fetcher(`${API_PREFIX[mode]}${path}`, { method, headers, credentials: mode === "demo" ? "omit" : "same-origin", cache: "no-store", ...(input === undefined ? {} : { body: JSON.stringify(input) }) }); }
    catch { throw new ApiClientError({ code: "unavailable", message: "无法连接服务，请检查连接。", retryable: true }); }
    let result: ApiResponse<T>;
    try { result = await response.json(); }
    catch { throw new ApiClientError({ code: "upstream_failed", message: "服务返回了无法读取的响应。", retryable: true }, response.status); }
    if (result.mode !== mode) throw new ApiClientError({ code: "mode_mismatch", message: "响应与当前空间不一致。", retryable: false }, response.status);
    if (!result.ok) throw new ApiClientError(result.error, response.status);
    if (!response.ok) throw new ApiClientError({ code: "upstream_failed", message: "请求失败。", retryable: true }, response.status);
    return result.data;
  }
  return {
    mode, request,
    getNetwork: () => request<Network>("/network"),
    readNeed: (id: string) => request<NeedDetail>(`/needs/${encodeURIComponent(id)}`),
    createNeed: (input: CreateNeedInput) => request<Need>("/needs", "POST", input),
    updateNeed: (id: string, input: UpdateNeedInput) => request<Need>(`/needs/${encodeURIComponent(id)}`, "PATCH", input),
    findExperience: (q = "") => request<Experience[]>(`/experiences?q=${encodeURIComponent(q)}`),
    readExperience: (id: string) => request<Experience>(`/experiences/${encodeURIComponent(id)}`),
    publishExperience: (input: PublishExperienceInput) => request<Experience>("/experiences", "POST", input),
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
