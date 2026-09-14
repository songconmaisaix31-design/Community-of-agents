import { createSummaryGet, object, officialData, sourceUrl, ZhihuError, type ZhihuOptions, type RetrievedSummary } from './http.ts';

// Exact provider fields; no invented question title, author, or full text.
interface AnswerSummary { ContentType: string; ContentToken: string; Url: string; Summary: string }
interface AnswerPage {
  Items: AnswerSummary[];
  // Int64 values travel internally and to the model as lossless decimal strings.
  Paging: { IsEnd: boolean; NextOffset?: string; Totals?: string };
}
export type ZhihuAnswerResult = RetrievedSummary<AnswerPage>;

export function questionUrl(input: string): string {
  const value = input.trim();
  // Validate the raw form too: URL normalization must not hide credentials, slashes or dot paths.
  if (value.length > 1000 || !/^https:\/\/(?:www\.)?zhihu\.com\/question\/[1-9]\d*\/?(?:[?#][^\s]*)?$/i.test(value)) throw new ZhihuError('invalid_query');
  const url = new URL(value);
  if (url.username || url.password || url.port || !/^\/question\/[1-9]\d*\/?$/.test(url.pathname)) throw new ZhihuError('invalid_query');
  url.hash = '';
  return url.href;
}

export function offsetValue(value: unknown, code: 'invalid_query' | 'invalid_response' = 'invalid_response'): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value) || value.length > 19 || BigInt(value) > 9223372036854775807n) throw new ZhihuError(code);
  return value;
}

function parse(body: unknown, offset: string): AnswerPage {
  const data = officialData(body);
  if (!object(data) || !Array.isArray(data.Items) || !object(data.Paging) || typeof data.Paging.IsEnd !== 'boolean') throw new ZhihuError('invalid_response');
  const paging = data.Paging;
  const isEnd = data.Paging.IsEnd;
  const next = paging.NextOffset === undefined ? undefined : offsetValue(paging.NextOffset);
  const totals = paging.Totals === undefined ? undefined : offsetValue(paging.Totals);
  // A missing cursor does not invalidate actual summaries on this page; callers must
  // report incomplete pagination and stop. A supplied illegal/backward cursor is an error.
  if (!paging.IsEnd && next !== undefined && BigInt(next) <= BigInt(offset)) throw new ZhihuError('invalid_response');
  const items = data.Items.map((item: unknown): AnswerSummary => {
    if (!object(item) || !['ContentType', 'ContentToken', 'Url', 'Summary'].every(key => typeof item[key] === 'string' && Boolean((item[key] as string).trim()))) throw new ZhihuError('invalid_response');
    const url = sourceUrl(item.Url);
    if (!url) throw new ZhihuError('invalid_response');
    return { ContentType: item.ContentType as string, ContentToken: item.ContentToken as string, Url: url, Summary: item.Summary as string };
  });
  return { Items: items, Paging: { IsEnd: isEnd, ...(next === undefined ? {} : { NextOffset: next }), ...(totals === undefined ? {} : { Totals: totals }) } };
}

export function createQuestionAnswers(options: ZhihuOptions) {
  const get = createSummaryGet(options, 'question_answers', (body, params) => parse(body, params.Offset));
  return async (input: string, signal: AbortSignal, offset = '0', limit = 5): Promise<ZhihuAnswerResult> => {
    if (!options.enabled || !options.accessSecret?.trim()) throw new ZhihuError('unavailable');
    if (signal.aborted) throw new ZhihuError('cancelled');
    const url = questionUrl(input);
    offsetValue(offset, 'invalid_query');
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new ZhihuError('invalid_query');
    return get({ QuestionUrl: url, Offset: offset, Limit: String(limit) }, signal);
  };
}
