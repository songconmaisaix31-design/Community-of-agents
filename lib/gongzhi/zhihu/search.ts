/** Protocol: official zhihu skill 0.7.2, references/http-api.md. */
import { createSummaryGet, object, officialData, sourceUrl, ZhihuError, type ZhihuOptions, type RetrievedSummary } from './http.ts';
import { createQuestionAnswers } from './question-answers.ts';
export { ZhihuError, type ZhihuFailure } from './http.ts';
export const ZHIHU_SEARCH_URL = 'https://developer.zhihu.com/api/v1/content/zhihu_search';

// Provider response fields, not a second copy of the shared Gongzhi contracts.
interface OfficialItem {
  Title: string;
  AuthorName: string;
  ContentID: string;
  ContentType: string;
  ContentText: string;
  Url?: string;
}
interface OfficialData {
  Items: OfficialItem[];
  SearchHashId: string;
  HasMore: boolean;
  EmptyReason?: string;
}
export type ZhihuSearchResult = RetrievedSummary<OfficialData>;

function parse(body: unknown): OfficialData {
  const data = officialData(body);
  if (!object(data) || !Array.isArray(data.Items) || typeof data.SearchHashId !== 'string' || typeof data.HasMore !== 'boolean') {
    throw new ZhihuError('invalid_response');
  }
  const items = data.Items.map((item: unknown): OfficialItem => {
    if (!object(item) || !['Title', 'AuthorName', 'ContentID', 'ContentType', 'ContentText'].every(key => typeof item[key] === 'string')) {
      throw new ZhihuError('invalid_response');
    }
    const url = sourceUrl(item.Url);
    return { Title: item.Title as string, AuthorName: item.AuthorName as string, ContentID: item.ContentID as string, ContentType: item.ContentType as string, ContentText: item.ContentText as string, ...(url ? { Url: url } : {}) };
  });
  return { Items: items, SearchHashId: data.SearchHashId, HasMore: data.HasMore, ...(typeof data.EmptyReason === 'string' ? { EmptyReason: data.EmptyReason } : {}) };
}

/** Existing search caller API retained; both methods use only this server credential. */
export function createZhihuSearch(options: ZhihuOptions) {
  const get = createSummaryGet(options, 'zhihu_search', parse);
  async function search(query: string, signal: AbortSignal, count = 5): Promise<ZhihuSearchResult> {
    if (!options.enabled || !options.accessSecret?.trim()) throw new ZhihuError('unavailable');
    if (signal.aborted) throw new ZhihuError('cancelled');
    const normalized = query.trim();
    if (!normalized || normalized.length > 500 || !Number.isInteger(count) || count < 1 || count > 10) throw new ZhihuError('invalid_query');
    return get({ Query: normalized, Count: String(count) }, signal);
  }
  return { search, questionAnswers: createQuestionAnswers(options) };
}
