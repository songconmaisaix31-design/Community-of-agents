import { z } from 'zod';
import { ApiClientError } from '../../lib/gongzhi/api-client.ts';
import { PublishExperienceSchema, SourceSchema } from '../../lib/gongzhi/contracts.ts';
import { sourceUrl } from '../../lib/gongzhi/zhihu/http.ts';
import { ContentDraftSchema, readLocalText, redactLocalText, saveLocalJson } from './local-content.ts';

const invalid = (message: string) => new ApiClientError({ code: 'invalid_request', message, retryable: false });

// Local operator input derived from the shared SourceSchema, so field bounds stay
// in one place. `id` is the official ContentID/ContentToken; `url`/`author` are
// omitted, never guessed.
const ZhihuSourceSchema = SourceSchema.omit({ kind: true }).extend({
  content_type: z.enum(['summary', 'full_text']),
  excerpt: z.string().trim().min(1).max(1000),
}).strict();
export type ZhihuSourceInput = z.infer<typeof ZhihuSourceSchema>;
export const ZhihuSourceFileSchema = z.object({ sources: z.array(ZhihuSourceSchema).min(1).max(6) }).strict();
export type ZhihuSourceFile = z.infer<typeof ZhihuSourceFileSchema>;

/** Only simple scalar frontmatter is interpreted; the full text stays the editable body. */
function frontmatter(text: string) {
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? '';
  const scalar = (key: string) => {
    const value = front.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1].trim();
    if (!value || ['|', '>'].includes(value)) return undefined;
    return value.replace(/^(["'])(.*)\1$/, '$2');
  };
  return { title: scalar('title') ?? scalar('name'), applicability: scalar('applicability') };
}

/**
 * Local-only draft: one explicitly named Zhihu source JSON plus one operator-written
 * method/actual-check text become the existing `{action:"publish_experience",payload}`.
 * No model call, no memory read, no source copying, no upload and no approval.
 */
export async function draftZhihuExperience(
  sourcePath: string, methodPath: string, outputPath: string, requestKey: string,
  signal: AbortSignal, previousVersionId?: string,
) {
  signal.throwIfAborted();
  const raw = await readLocalText(sourcePath, signal, true);
  let file: ZhihuSourceFile;
  try { file = ZhihuSourceFileSchema.parse(JSON.parse(raw)); }
  catch { throw invalid('来源 JSON 必须是本机指定的严格格式：sources 1-6 条，含官方 id/title/retrieved_at/content_type/excerpt；不猜 URL、作者或正文。'); }
  if (new Set(file.sources.map(source => source.id)).size !== file.sources.length) throw invalid('来源 id 重复，请先去重。');

  let redactions = 0;
  const sources = file.sources.map(source => {
    // The official identifier is opaque and must stay verbatim: reject credential-like
    // or whitespace-bearing ids instead of redacting or normalizing them.
    if (/[\s\u0000-\u001f\u007f]/.test(source.id) || redactLocalText(source.id).redactions > 0) throw invalid('来源 id 必须保留官方原样；含空白或疑似凭据的 id 拒绝写入。');
    const title = redactLocalText(source.title);
    const excerpt = redactLocalText(source.excerpt);
    redactions += title.redactions + excerpt.redactions;
    let author: string | undefined;
    if (source.author !== undefined) {
      const clean = redactLocalText(source.author);
      redactions += clean.redactions;
      author = clean.text;
    }
    let url: string | undefined;
    if (source.url !== undefined) {
      if (redactLocalText(source.url).redactions > 0) throw invalid('来源 URL 含私密参数或凭据，拒绝写入草稿。');
      url = sourceUrl(source.url);
      if (!url) throw invalid('来源 URL 必须是官方 https 知乎链接；没有就省略，不要猜测或改写。');
    }
    return SourceSchema.parse({
      id: source.id, kind: 'zhihu', title: title.text,
      ...(author === undefined ? {} : { author }),
      ...(url === undefined ? {} : { url }),
      retrieved_at: source.retrieved_at, content_type: source.content_type, excerpt: excerpt.text,
    });
  });

  const cleaned = redactLocalText(await readLocalText(methodPath, signal));
  redactions += cleaned.redactions;
  const meta = frontmatter(cleaned.text);
  const heading = cleaned.text.match(/^#\s+(.+)$/m)?.[1];
  const title = redactLocalText(meta.title ?? heading ?? sources[0].title).text;
  const applicability = meta.applicability === undefined ? '' : redactLocalText(meta.applicability).text;

  let payload: z.infer<typeof PublishExperienceSchema>;
  try {
    payload = PublishExperienceSchema.omit({ approval_id: true }).parse({
      title, body: cleaned.text, applicability, tags: [], sources, visibility: 'public',
      idempotency_key: requestKey,
      ...(previousVersionId === undefined ? {} : { previous_version_id: previousVersionId }),
    });
  } catch { throw invalid('整理文本或来源超出发布契约（正文最多 8000 字符、来源最多 6 条）；请删减后重试，不要静默截断。'); }
  const draft = ContentDraftSchema.parse({ action: 'publish_experience', payload });

  try { await saveLocalJson(outputPath, draft, signal); }
  catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'EEXIST') throw invalid('输出文件已存在；本工具不覆盖已有草稿，请换一个尚不存在的路径。');
    throw error;
  }
  return { draft_saved: true, action: 'publish_experience' as const, sources: sources.length, redactions, review_required: true, uploaded: false };
}
