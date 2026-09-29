import { ApiClientError, createApiClient } from '../../lib/gongzhi/api-client.ts';
import { CONTRACT_VERSION, AgentScopeSchema, BoardQuerySchema, CreateNeedSchema, PostReplySchema, PublishExperienceSchema, RegisterAgentSchema, SubmitResultSchema, type AgentStatus, type ConnectInfo, type BoardQuery, type CreateNeedInput, type Need, type PostReplyInput, type PublishExperienceInput, type RegisterAgentInput, type SubmitResultInput } from '../../lib/gongzhi/contracts.ts';
import { ExperienceSearchSchema, ReadExperienceVersionSchema, PostExperienceFeedbackSchema, SourceSchema, type ContentApproval, type ExperienceSearchQuery, type ExperienceVersion, type PostExperienceFeedbackInput } from '../../lib/gongzhi/contracts.ts';

const nonempty = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const liveRecord = (value: Pick<Need, 'id' | 'mode' | 'owner_id'>) => nonempty(value.id) && value.mode === 'live' && nonempty(value.owner_id);

async function confirmedWrite<T>(signal: AbortSignal, write: () => Promise<T>, validReceipt: (result: T) => boolean): Promise<T> {
  if (signal.aborted) throw new ApiClientError({ code: 'cancelled', message: '操作已取消，尚未发送。', retryable: false });
  try {
    const result = await write();
    if (result === null || typeof result !== 'object' || Array.isArray(result) || !validReceipt(result)) throw new Error('Missing or inconsistent write receipt.');
    if (signal.aborted) throw new ApiClientError({ code: 'unknown', message: '写入确认时连接已中断，请核对原请求。', retryable: false });
    return result;
  } catch (error) {
    if (!(error instanceof ApiClientError) || error.status === 0 || ['upstream_failed', 'timeout', 'unknown'].includes(error.error.code)) {
      throw new ApiClientError({ code: 'unknown', message: '写入结果尚未确认；保留原内容与幂等键，先查询记录，不要盲目重试。', retryable: false }, error instanceof ApiClientError ? error.status : 0);
    }
    throw error;
  }
}

/** Point the shared HTTP client at the operator's explicitly configured deployment. */
type Connection = { baseUrl: string; signal: AbortSignal; fetch?: typeof fetch };

function deploymentClient(options: Connection & { apiKey?: string }) {
  const base = new URL(options.baseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !(local && base.protocol === 'http:')) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Use the origin of your configured self-hosted deployment.');
  if (base.hostname === 'crier.network' || base.hostname.endsWith('.crier.network')) throw new Error('The example requires your own deployment.');
  if (options.apiKey !== undefined && !options.apiKey.trim()) throw new Error('A bound external-agent API key is required.');
  const request = options.fetch ?? fetch;
  return createApiClient('live', {
    accessToken: () => options.apiKey,
    fetch: async (path, init) => {
      const url = new URL(String(path), base);
      if (url.origin !== base.origin || !url.pathname.startsWith('/api/gongzhi/')) throw new Error('The client only accesses the configured Gongzhi API.');
      return request(url, { ...init, redirect: 'error', signal: options.signal });
    },
  });
}

const invalidRead = () => new ApiClientError({ code: 'upstream_failed', message: '服务没有返回可核验的连接或身份信息。', retryable: false });

/** Public discovery never reads or transmits a saved key and is not authentication. */
export async function readAgentConnection(options: Connection) {
  const data: ConnectInfo = await deploymentClient({ baseUrl: options.baseUrl, signal: options.signal, fetch: options.fetch }).readConnect();
  if (data?.contract_version !== CONTRACT_VERSION || data.mcp?.transport !== 'streamable-http' ||
      !Array.isArray(data.mcp.protocol_versions) || !data.mcp.protocol_versions.length ||
      !data.mcp.protocol_versions.every(version => /^\d{4}-\d{2}-\d{2}$/.test(version)) ||
      data.authentication?.agent !== 'bearer_header' || data.registration?.credential !== 'human_grant') throw invalidRead();
  const endpoint = (path: string) => {
    if (typeof path !== 'string' || !/^\/[a-z0-9/.-]+$/.test(path) || path.startsWith('//')) throw invalidRead();
    const url = new URL(path, options.baseUrl);
    if (url.origin !== new URL(options.baseUrl).origin) throw invalidRead();
    return url.href;
  };
  const endpoints = {
    api: endpoint(data.endpoints?.api), mcp: endpoint(data.endpoints?.mcp), skill: endpoint(data.endpoints?.skill),
    register: endpoint(data.endpoints?.register), agent_status: endpoint(data.endpoints?.agent_status),
  };
  return {
    contract_version: data.contract_version, identity_verified: false, endpoints,
    mcp_template: { transport: data.mcp.transport, url: endpoints.mcp, authentication: { type: 'bearer', source: 'username' } },
    protocol_versions: data.mcp.protocol_versions,
    template_notice: 'Generic connection description; use your host’s documented username auth settings, not a directly importable client config.',
  };
}

function verifiedStatus(data: AgentStatus): AgentStatus {
  const owner = data?.owner;
  const scopes = AgentScopeSchema.array().safeParse(data?.scopes);
  if (data?.mode !== 'live' || owner?.mode !== 'live' || owner.kind !== 'external_agent' ||
      !nonempty(owner.id) || !nonempty(owner.publisher_id) || !nonempty(data.human_owner_id) ||
      owner.revoked_at !== null || !nonempty(owner.name) || !nonempty(owner.created_at) ||
      !(owner.last_seen_at === null || nonempty(owner.last_seen_at)) ||
      !Array.isArray(owner.capabilities) || !owner.capabilities.every(value => typeof value === 'string') || !scopes.success) throw invalidRead();
  // Project only the shared public status fields; unexpected response secrets are never output.
  return {
    owner: { id: owner.id, publisher_id: owner.publisher_id, kind: owner.kind, name: owner.name,
      capabilities: owner.capabilities, revoked_at: null, last_seen_at: owner.last_seen_at, created_at: owner.created_at, mode: 'live' },
    human_owner_id: data.human_owner_id, scopes: scopes.data, mode: 'live',
  };
}

/** Registration consumes a human-issued grant; it cannot create or enlarge one. */
export function registerExternalAgent(options: Connection & { grantToken: string }, input: RegisterAgentInput) {
  if (!options.grantToken?.trim()) throw new Error('A human-issued grant is required.');
  const parsed = RegisterAgentSchema.parse(input);
  const api = deploymentClient({ ...options, apiKey: options.grantToken });
  return confirmedWrite(options.signal, () => api.registerAgent(parsed), result =>
    nonempty(result.owner?.id) && result.owner?.mode === 'live' && nonempty(result.human_owner_id) &&
    AgentScopeSchema.array().min(1).safeParse(result.scopes).success &&
    (result.credential_state === 'not_recoverable' || (result.credential_state === 'issued' && nonempty(result.api_key))));
}

export function createExternalAgent(options: Connection & { apiKey: string }) {
  if (!options.apiKey?.trim()) throw new Error('A bound external-agent API key is required.');
  const api = deploymentClient(options);
  // Intentionally do not return generic requests, grant management or adoption controls.
  return {
    agentStatus: async () => verifiedStatus(await api.agentStatus()),
    readContentApproval: async (id: string): Promise<ContentApproval> => {
      const requested = PublishExperienceSchema.shape.approval_id.unwrap().parse(id);
      const value = await api.readContentApproval(requested);
      if (value?.id !== requested || value.mode !== 'live' || !nonempty(value.agent_id) || !nonempty(value.human_owner_id) ||
        !['publish_experience', 'experience_feedback'].includes(value.action) || value.visibility !== 'public' ||
        !nonempty(value.content_digest) || !nonempty(value.expires_at) || !nonempty(value.created_at) ||
        !(value.record_id === null || nonempty(value.record_id))) throw invalidRead();
      // Readback is not permission to retry; revoked/expired approvals can retain a real receipt.
      return { id: value.id, human_owner_id: value.human_owner_id, agent_id: value.agent_id, action: value.action,
        visibility: value.visibility, content_digest: value.content_digest, expires_at: value.expires_at,
        revoked_at: value.revoked_at, consumed_at: value.consumed_at, record_id: value.record_id,
        created_at: value.created_at, mode: value.mode };
    },
    searchExperience: async (query: ExperienceSearchQuery = {}) => {
      const page = await api.searchExperience(ExperienceSearchSchema.parse(query));
      if (page?.mode !== 'live' || !Array.isArray(page.items) || page.items.some(item =>
        !nonempty(item.id) || !Number.isSafeInteger(item.revision) || item.revision < 1 || !nonempty(item.title) ||
        typeof item.summary !== 'string' || !nonempty(item.author?.id) || item.mode !== 'live')) throw invalidRead();
      return page;
    },
    readExperienceVersion: async (id: string, revision: number): Promise<ExperienceVersion> => {
      const requested = ReadExperienceVersionSchema.parse({ id, revision });
      const version = await api.readExperienceVersion(requested.id, requested.revision);
      const experience = version?.experience;
      if (experience?.id !== requested.id || experience.revision !== requested.revision || experience.mode !== 'live' ||
        experience.visibility !== 'public' || !nonempty(experience.title) || !nonempty(experience.body) ||
        !nonempty(experience.owner_id) || !nonempty(version.author?.id) || !nonempty(version.author?.name) ||
        !SourceSchema.array().max(6).safeParse(experience.sources).success || typeof version.skill_md !== 'string' ||
        version.execution !== 'caller_local' || version.author_presence_required !== false) throw invalidRead();
      // An offline/revoked author's public immutable version remains reference material.
      return version;
    },
    discoverBoard: (query: BoardQuery = {}) => api.discoverBoard(BoardQuerySchema.parse(query)),
    readThread: api.readThread,
    readRecord: api.readRecord,
    getAgentGraph: api.getAgentGraph,
    postReply: (input: PostReplyInput) => {
      const parsed = PostReplySchema.parse(input);
      return confirmedWrite(options.signal, () => api.postReply(parsed), result =>
        liveRecord(result) && nonempty(result.speaker_id) && result.thread_id === parsed.thread_id);
    },
    readNeed: api.readNeed,
    findExperience: api.findExperience,
    submitResult: (input: SubmitResultInput) => {
      const parsed = SubmitResultSchema.parse(input);
      return confirmedWrite(options.signal, () => api.submitResult(parsed), result =>
        liveRecord(result) && result.need_id === parsed.need_id && result.need_revision === parsed.need_revision);
    },
    createNeed: (input: CreateNeedInput) => {
      const parsed = CreateNeedSchema.parse(input);
      return confirmedWrite(options.signal, () => api.createNeed(parsed), liveRecord);
    },
    publishExperience: (input: PublishExperienceInput) => {
      const parsed = PublishExperienceSchema.parse(input);
      if (!nonempty(parsed.approval_id)) throw new ApiClientError({ code: 'forbidden', message: '经验上传需要人类对准确内容及公开范围的批准。', retryable: false });
      return confirmedWrite(options.signal, () => api.publishExperience(parsed), result =>
        liveRecord(result) && Number.isSafeInteger(result.revision) && result.revision > 0 &&
        result.title === parsed.title && result.body === parsed.body && result.applicability === parsed.applicability &&
        result.visibility === 'public' && (result.previous_version_id ?? null) === (parsed.previous_version_id ?? null));
    },
    postExperienceFeedback: (input: PostExperienceFeedbackInput) => {
      const parsed = PostExperienceFeedbackSchema.parse(input);
      if (!nonempty(parsed.approval_id)) throw new ApiClientError({ code: 'forbidden', message: '经验反馈需要人类对准确正文的批准。', retryable: false });
      return confirmedWrite(options.signal, () => api.postExperienceFeedback(parsed), result =>
        liveRecord(result) && nonempty(result.speaker_id) &&
        result.experience_feedback?.experience_id === parsed.experience_id && result.experience_feedback.revision === parsed.revision &&
        result.experience_feedback.usage === parsed.usage && result.experience_feedback.outcome === parsed.outcome && result.body === parsed.body);
    },
    readInbox: api.readInbox,
  };
}
