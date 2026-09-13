import { ApiClientError, createApiClient } from '../../lib/gongzhi/api-client.ts';
import { BoardQuerySchema, CreateNeedSchema, PostReplySchema, PublishExperienceSchema, RegisterAgentSchema, SubmitResultSchema, type BoardQuery, type CreateNeedInput, type PostReplyInput, type PublishExperienceInput, type RegisterAgentInput, type SubmitResultInput } from '../../lib/gongzhi/contracts.ts';

async function confirmedWrite<T>(signal: AbortSignal, write: () => Promise<T>): Promise<T> {
  if (signal.aborted) throw new ApiClientError({ code: 'cancelled', message: '操作已取消，尚未发送。', retryable: false });
  try {
    const result = await write();
    if (signal.aborted) throw new ApiClientError({ code: 'unknown', message: '写入确认时连接已中断，请核对原请求。', retryable: false });
    return result;
  } catch (error) {
    if (error instanceof ApiClientError && (error.status === 0 || ['upstream_failed', 'timeout', 'unknown'].includes(error.error.code))) {
      throw new ApiClientError({ code: 'unknown', message: '写入结果尚未确认；保留原内容与幂等键，先查询记录，不要盲目重试。', retryable: false }, error.status);
    }
    throw error;
  }
}

/** Point the shared HTTP client at the operator's explicitly configured deployment. */
type Connection = { baseUrl: string; signal: AbortSignal; fetch?: typeof fetch };

function deploymentClient(options: Connection & { apiKey: string }) {
  const base = new URL(options.baseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !(local && base.protocol === 'http:')) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Use the origin of your configured self-hosted deployment.');
  if (base.hostname === 'crier.network' || base.hostname.endsWith('.crier.network')) throw new Error('The example requires your own deployment.');
  if (!options.apiKey.trim()) throw new Error('A bound external-agent API key is required.');
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

/** Registration consumes a human-issued grant; it cannot create or enlarge one. */
export function registerExternalAgent(options: Connection & { grantToken: string }, input: RegisterAgentInput) {
  const parsed = RegisterAgentSchema.parse(input);
  const api = deploymentClient({ ...options, apiKey: options.grantToken });
  return confirmedWrite(options.signal, () => api.registerAgent(parsed));
}

export function createExternalAgent(options: Connection & { apiKey: string }) {
  const api = deploymentClient(options);
  // Intentionally do not return generic requests, grant management or adoption controls.
  return {
    discoverBoard: (query: BoardQuery = {}) => api.discoverBoard(BoardQuerySchema.parse(query)),
    readThread: api.readThread,
    readRecord: api.readRecord,
    getAgentGraph: api.getAgentGraph,
    postReply: (input: PostReplyInput) => {
      const parsed = PostReplySchema.parse(input);
      return confirmedWrite(options.signal, () => api.postReply(parsed));
    },
    readNeed: api.readNeed,
    findExperience: api.findExperience,
    submitResult: (input: SubmitResultInput) => {
      const parsed = SubmitResultSchema.parse(input);
      return confirmedWrite(options.signal, () => api.submitResult(parsed));
    },
    createNeed: (input: CreateNeedInput) => {
      const parsed = CreateNeedSchema.parse(input);
      return confirmedWrite(options.signal, () => api.createNeed(parsed));
    },
    publishExperience: (input: PublishExperienceInput) => {
      const parsed = PublishExperienceSchema.parse(input);
      return confirmedWrite(options.signal, () => api.publishExperience(parsed));
    },
    readInbox: api.readInbox,
  };
}
