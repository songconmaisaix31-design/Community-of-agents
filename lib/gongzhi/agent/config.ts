import { createOpenAI } from '@ai-sdk/openai';
import { createZhihuSearch } from '../zhihu/search.ts';

export class AssistantUnavailableError extends Error {
  constructor() { super('平台体验助手尚未配置可用服务。'); this.name = 'AssistantUnavailableError'; }
}

let configured: { key: string; search: ReturnType<typeof createZhihuSearch> } | undefined;

/** This function only configures clients. It does not call any provider. */
export function getAssistantConfig(env: Record<string, string | undefined> = process.env) {
  const apiKey = env.GONGZHI_MODEL_API_KEY;
  const modelId = env.GONGZHI_MODEL_ID;
  const secret = env.ZHIHU_ACCESS_SECRET?.trim() || '';
  if (env.GONGZHI_ASSISTANT_ENABLED !== 'true' || !apiKey?.trim() || !modelId?.trim()) throw new AssistantUnavailableError();
  if (env.GONGZHI_MODEL_BASE_URL) {
    try {
      const base = new URL(env.GONGZHI_MODEL_BASE_URL);
      if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new AssistantUnavailableError();
    } catch { throw new AssistantUnavailableError(); }
  }
  const provider = createOpenAI({ apiKey, ...(env.GONGZHI_MODEL_BASE_URL ? { baseURL: env.GONGZHI_MODEL_BASE_URL } : {}) });
  // Retrieval is optional: board experience can be used without a Zhihu account.
  // Replacing the client when a credential is removed also drops its cached results.
  if (configured?.key !== secret) configured = { key: secret, search: createZhihuSearch({ accessSecret: secret, enabled: Boolean(secret) }) };
  return { model: provider.chat(modelId), search: configured.search, zhihuAvailable: Boolean(secret) };
}
