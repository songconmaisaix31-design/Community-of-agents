import { open, realpath } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiClientError } from '../../lib/gongzhi/api-client.ts';
import { CreateContentApprovalSchema, PublishExperienceSchema, type ExperienceVersion } from '../../lib/gongzhi/contracts.ts';

const repository = fileURLToPath(new URL('../../', import.meta.url));
export const ContentDraftSchema = CreateContentApprovalSchema.shape.content;
const invalid = () => new ApiClientError({ code: 'invalid_request', message: '请使用明确指定的普通文本文件和仓库外尚不存在的 JSON 输出；检查草稿格式和大小。', retryable: false });

/** One explicitly named file, no directory walk, imports, referenced-file reads or execution. */
export async function readLocalText(path: string, signal: AbortSignal, json = false): Promise<string> {
  signal.throwIfAborted();
  const absolute = resolve(path);
  const normalized = absolute.replaceAll('\\', '/');
  if (!isAbsolute(path) || ![...(json ? ['.json'] : ['.md', '.txt'])].includes(extname(path).toLowerCase()) ||
      /(?:^|\/)(?:\.env[^/]*|memory\.md|memories|\.ssh|\.aws|\.codex|\.claude|credentials?|[^/]*(?:credential|secret|token|cookie)[^/]*)(?:\/|$)/i.test(normalized)) throw invalid();
  // Resolve parent symlinks too, so an innocuous alias cannot name a credential directory.
  const actual = await realpath(absolute);
  if (actual.toLowerCase() !== absolute.toLowerCase()) throw invalid();
  const file = await open(absolute, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 64_000) throw invalid();
    const buffer = Buffer.alloc(64_001);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      signal.throwIfAborted();
      const part = await file.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (!part.bytesRead) break;
      bytesRead += part.bytesRead;
    }
    signal.throwIfAborted();
    if (bytesRead > 64_000) throw invalid();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead));
    if (text.includes('\0')) throw invalid();
    return text;
  } finally { await file.close(); }
}

/** Heuristics assist review; this is deliberately not a privacy certification. */
export function redactLocalText(input: string) {
  let count = 0;
  const replace = (text: string, expression: RegExp, replacement: string) => text.replace(expression, () => { count++; return replacement; });
  let text = replace(input, /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[已脱敏：私钥]');
  text = replace(text, /^(?:.*\b(?:authorization|cookie|set-cookie)\s*[:=]).*$/gim, '[已脱敏：认证头]');
  text = replace(text, /^(?:.*\b(?:[A-Z_]*(?:API_KEY|ACCESS_SECRET|PASSWORD|TOKEN)|api[_-]?key|access[_-]?secret|accessToken|secret|token|password|passwd)\s*[:=]).*$/gim, '[已脱敏：凭据配置]');
  text = replace(text, /\b(?:sk-|crier_sk_|gongzhi_grant_)[A-Za-z0-9_-]{8,}\b/g, '[已脱敏：令牌]');
  text = replace(text, /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[已脱敏：JWT]');
  text = replace(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[已脱敏：邮箱]');
  text = replace(text, /(?<!\d)1[3-9]\d{9}(?!\d)/g, '[已脱敏：手机号]');
  text = replace(text, /(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/]|\/(?:Users|home)\/)[^\r\n"'<>]*/g, '[已脱敏：本机路径]');
  text = text.replace(/https?:\/\/[^\s<>"')]+/gi, value => {
    try {
      const url = new URL(value);
      if (url.username || url.password || [...url.searchParams.keys()].some(key => /token|secret|key|password|auth|signature/i.test(key))) { count++; return '[已脱敏：私密URL]'; }
    } catch { count++; return '[已脱敏：无效URL]'; }
    return value;
  });
  return { text, redactions: count };
}

/** Only simple scalar frontmatter is interpreted; all text remains editable reference material. */
function metadata(text: string) {
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? '';
  const scalar = (key: string) => {
    const value = front.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1].trim();
    if (!value || ['|', '>'].includes(value)) return undefined;
    return value.replace(/^(["'])(.*)\1$/, '$2');
  };
  return { title: scalar('title') ?? scalar('name'), author: scalar('author'), version: scalar('version'), applicability: scalar('applicability') };
}

export async function saveLocalJson(path: string, value: unknown, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!isAbsolute(path) || extname(path).toLowerCase() !== '.json') throw invalid();
  const parent = await realpath(dirname(path));
  const output = resolve(parent, basename(path));
  const fromRepository = relative(repository, output);
  if (!fromRepository || (!fromRepository.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && !isAbsolute(fromRepository))) throw invalid();
  const file = await open(output, 'wx', 0o600);
  try {
    await file.writeFile(JSON.stringify(value, null, 2) + '\n');
    await file.sync();
    signal.throwIfAborted();
  } finally { await file.close(); }
}

export async function draftExperience(input: string, output: string, requestKey: string, signal: AbortSignal) {
  const cleaned = redactLocalText(await readLocalText(input, signal));
  const meta = metadata(cleaned.text);
  const name = redactLocalText(basename(input)).text;
  const payload = PublishExperienceSchema.omit({ approval_id: true }).parse({
    title: meta.title ?? cleaned.text.match(/^#\s+(.+)$/m)?.[1] ?? name,
    body: cleaned.text,
    applicability: meta.applicability ?? '',
    visibility: 'public',
    idempotency_key: requestKey,
    sources: [{ id: name, title: name, kind: 'other', ...(meta.author ? { author: meta.author } : {}),
      retrieved_at: new Date().toISOString(), content_type: 'reference',
      excerpt: `用户指定的本地资料；${meta.version ? `原文版本：${meta.version}；` : '原文未注明版本；'}署名不改变本站服务端发布身份。` }],
  });
  const draft = ContentDraftSchema.parse({ action: 'publish_experience', payload });
  await saveLocalJson(output, draft, signal);
  return { draft_saved: true, action: draft.action, redactions: cleaned.redactions, review_required: true, uploaded: false };
}

export async function readContentDraft(path: string, signal: AbortSignal) {
  return ContentDraftSchema.parse(JSON.parse(await readLocalText(path, signal, true)));
}

export async function saveExperienceReference(path: string, version: ExperienceVersion, signal: AbortSignal) {
  await saveLocalJson(path, version, signal);
  return { downloaded: true, experience_id: version.experience.id, revision: version.experience.revision, execution: version.execution, author_presence_required: version.author_presence_required, executed: false };
}
