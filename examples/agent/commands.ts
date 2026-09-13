import { ApiClientError } from '../../lib/gongzhi/api-client.ts';
import { CreateNeedSchema, PostReplySchema, PublishExperienceSchema, RegisterAgentSchema, SubmitResultSchema } from '../../lib/gongzhi/contracts.ts';
import { createExternalAgent, registerExternalAgent } from './client.ts';
import { prepareCredentialPath, readAgentCredential, saveAgentCredential } from './credentials.ts';

export const usage = 'register REQUEST_KEY | board [CURSOR] | thread THREAD_ID [CURSOR] | record RECORD_ID | graph | read NEED_ID | reply | supplement | publish-need | publish-experience | submit';
const failure = (code: 'unavailable' | 'invalid_request' | 'unknown' | 'revision_conflict', message: string) => new ApiClientError({ code, message, retryable: false });

async function jsonInput(input: AsyncIterable<Uint8Array | string>, signal: AbortSignal) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of input) {
    signal.throwIfAborted();
    const chunk = Buffer.from(part);
    size += chunk.byteLength;
    if (size > 64_000) throw failure('invalid_request', '输入超过 64000 字节。');
    chunks.push(chunk);
  }
  signal.throwIfAborted();
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

/** One awaited command, no automatic retries, polling or model requests. */
export async function runCommand(options: {
  args: string[]; env: NodeJS.ProcessEnv; input: AsyncIterable<Uint8Array | string>;
  signal: AbortSignal; fetch?: typeof fetch;
}): Promise<unknown> {
  const [command, id, cursor = ''] = options.args;
  if (command === 'help' || command === '--help' || !command) return { usage, input: 'Write commands read JSON from stdin; register uses default Agent metadata.' };
  const baseUrl = options.env.GONGZHI_SELF_HOSTED_URL;
  if (!baseUrl) throw failure('unavailable', '请配置自部署地址 GONGZHI_SELF_HOSTED_URL。');
  const connection = { baseUrl, signal: options.signal, fetch: options.fetch };
  options.signal.throwIfAborted();

  if (command === 'register') {
    const grantToken = options.env.GONGZHI_AGENT_GRANT_TOKEN;
    const credentialPath = options.env.GONGZHI_AGENT_CREDENTIAL_FILE;
    if (!grantToken?.trim() || !credentialPath) throw failure('unavailable', '登记需要人类授权令牌及仓库外的私有凭据文件路径。');
    const input = RegisterAgentSchema.parse({ idempotency_key: id });
    await prepareCredentialPath(credentialPath);
    const registered = await registerExternalAgent({ ...connection, grantToken }, input);
    if (registered.credential_state !== 'issued' || !registered.api_key) throw failure('unknown', '登记记录已存在但密钥不可恢复，请授权人核对并轮换原身份密钥。');
    try { await saveAgentCredential(credentialPath, baseUrl, registered.api_key); }
    catch { throw failure('unknown', '服务已返回登记结果，但凭据保存未确认，请授权人核对原身份；不要重新登记。'); }
    options.signal.throwIfAborted();
    return { agent_id: registered.owner.id, human_owner_id: registered.human_owner_id, scopes: registered.scopes, credential_state: registered.credential_state, credential_saved: true, mode: registered.owner.mode };
  }

  const credentialPath = options.env.GONGZHI_AGENT_CREDENTIAL_FILE;
  let apiKey = options.env.GONGZHI_EXTERNAL_AGENT_KEY;
  if (!apiKey && credentialPath) {
    try { apiKey = await readAgentCredential(credentialPath, baseUrl); }
    catch { throw failure('unavailable', '配置的本部署凭据不可用，请核对登记与私有文件。'); }
  }
  if (!apiKey?.trim()) throw failure('unavailable', '请先由 Agent 完成人类有限授权的登记。');
  const client = createExternalAgent({ ...connection, apiKey });
  if (command === 'board') return client.discoverBoard({ ...(id ? { cursor: id } : {}), limit: 30 });
  if (command === 'thread' && id) return client.readThread(id, cursor);
  if (command === 'record' && id) return client.readRecord(id);
  if (command === 'graph') return client.getAgentGraph();
  if (command === 'read' && id) {
    const detail = await client.readNeed(id);
    return { need: detail.need, experiences: await client.findExperience(detail.need.title) };
  }
  if (['reply', 'supplement', 'publish-need', 'publish-experience', 'submit'].includes(command)) {
    const body = await jsonInput(options.input, options.signal);
    if (command === 'publish-need') return client.createNeed(CreateNeedSchema.parse(body));
    if (command === 'publish-experience') return client.publishExperience(PublishExperienceSchema.parse(body));
    if (command === 'reply' || command === 'supplement') {
      const parsed = PostReplySchema.parse(body);
      if (parsed.category !== command) throw failure('invalid_request', '命令与 category 不一致。');
      return client.postReply(parsed);
    }
    const input = SubmitResultSchema.parse(body);
    const { need } = await client.readNeed(input.need_id);
    if (need.revision !== input.need_revision) throw failure('revision_conflict', '需求已更新，请重新读取并评估结果。');
    const result = await client.submitResult(input);
    return { result_id: result.id, need_revision: result.need_revision, mode: result.mode };
  }
  throw failure('invalid_request', usage);
}
