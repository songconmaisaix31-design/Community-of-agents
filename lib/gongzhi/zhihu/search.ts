/** Protocol: official zhihu skill 0.2.1, references/http-api.md (2026-07-16). */
export const ZHIHU_SEARCH_URL = 'https://developer.zhihu.com/api/v1/content/zhihu_search';

export type ZhihuFailure = 'unavailable' | 'invalid_query' | 'unauthorized' | 'rate_limited' | 'upstream_failed' | 'invalid_response' | 'cancelled' | 'timed_out';

export class ZhihuError extends Error {
  readonly code: ZhihuFailure;
  readonly retryAfter?: string;
  constructor(code: ZhihuFailure, retryAfter?: string) {
    super(`Zhihu search: ${code}`);
    this.name = 'ZhihuError';
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

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
export interface ZhihuSearchResult {
  data: OfficialData;
  retrievedAt: string;
  cached: boolean;
  isSummary: true;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parse(body: unknown): OfficialData {
  if (!object(body) || typeof body.Code !== 'number') throw new ZhihuError('invalid_response');
  if (body.Code !== 0) {
    throw new ZhihuError(body.Code === 10001 ? 'invalid_query' : body.Code === 20001 ? 'unauthorized' : body.Code === 30001 ? 'rate_limited' : 'upstream_failed');
  }
  const data = body.Data;
  if (!object(data) || !Array.isArray(data.Items) || typeof data.SearchHashId !== 'string' || typeof data.HasMore !== 'boolean') {
    throw new ZhihuError('invalid_response');
  }
  const items = data.Items.map((item: unknown): OfficialItem => {
    if (!object(item) || !['Title', 'AuthorName', 'ContentID', 'ContentType', 'ContentText'].every(key => typeof item[key] === 'string')) {
      throw new ZhihuError('invalid_response');
    }
    // Preserve the returned link, including attribution parameters. Never derive a URL from ID.
    let url: string | undefined;
    if (typeof item.Url === 'string' && item.Url) {
      try {
        const parsed = new URL(item.Url);
        if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && (parsed.hostname === 'zhihu.com' || parsed.hostname.endsWith('.zhihu.com'))) url = item.Url;
      } catch { /* Missing or unusable URL is represented by the actual ID and title. */ }
    }
    return { Title: item.Title as string, AuthorName: item.AuthorName as string, ContentID: item.ContentID as string, ContentType: item.ContentType as string, ContentText: item.ContentText as string, ...(url ? { Url: url } : {}) };
  });
  return { Items: items, SearchHashId: data.SearchHashId, HasMore: data.HasMore, ...(typeof data.EmptyReason === 'string' ? { EmptyReason: data.EmptyReason } : {}) };
}

/** One server-side, credential-scoped adapter. No retries, arbitrary URLs, or CLI auth reads. */
export function createZhihuSearch(options: {
  accessSecret?: string;
  enabled?: boolean;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
}) {
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { expires: number; value: ZhihuSearchResult }>();
  const pending = new WeakMap<AbortSignal, Map<string, Promise<ZhihuSearchResult>>>();
  const ttl = Math.max(0, Math.min(options.cacheTtlMs ?? 300_000, 300_000));
  const capacity = Math.max(1, Math.min(options.maxCacheEntries ?? 100, 100));

  async function search(query: string, signal: AbortSignal, count = 5): Promise<ZhihuSearchResult> {
    if (!options.enabled || !options.accessSecret?.trim()) throw new ZhihuError('unavailable');
    if (signal.aborted) throw new ZhihuError('cancelled');
    const normalized = query.trim();
    if (!normalized || normalized.length > 500 || !Number.isInteger(count) || count < 1 || count > 10) throw new ZhihuError('invalid_query');
    const key = JSON.stringify([normalized, count]);
    const saved = cache.get(key);
    if (saved && saved.expires > now()) return structuredClone({ ...saved.value, cached: true });
    if (saved) cache.delete(key);
    let requests = pending.get(signal);
    if (!requests) { requests = new Map(); pending.set(signal, requests); }
    const underway = requests.get(key);
    if (underway) return structuredClone(await underway);

    const work = (async (): Promise<ZhihuSearchResult> => {
      const deadline = AbortSignal.timeout(Math.max(1, Math.min(options.timeoutMs ?? 15_000, 60_000)));
      const combined = AbortSignal.any([signal, deadline]);
      const url = new URL(ZHIHU_SEARCH_URL);
      url.searchParams.set('Query', normalized);
      url.searchParams.set('Count', String(count));
      try {
        const response = await request(url, {
          method: 'GET', redirect: 'error', cache: 'no-store', signal: combined,
          headers: { Authorization: `Bearer ${options.accessSecret}`, 'X-Request-Timestamp': String(Math.floor(now() / 1000)), 'Content-Type': 'application/json' },
        });
        if (response.status === 401 || response.status === 403) throw new ZhihuError('unauthorized');
        if (response.status === 429) throw new ZhihuError('rate_limited', response.headers.get('retry-after') ?? undefined);
        if (!response.ok) throw new ZhihuError('upstream_failed');
        const data = parse(await response.json());
        combined.throwIfAborted();
        const value: ZhihuSearchResult = { data, retrievedAt: new Date(now()).toISOString(), cached: false, isSummary: true };
        if (cache.size >= capacity) cache.delete(cache.keys().next().value!);
        cache.set(key, { expires: now() + ttl, value });
        return structuredClone(value);
      } catch (error) {
        if (signal.aborted) throw new ZhihuError('cancelled');
        if (deadline.aborted) throw new ZhihuError('timed_out');
        if (error instanceof ZhihuError) throw error;
        throw new ZhihuError(error instanceof SyntaxError ? 'invalid_response' : 'upstream_failed');
      }
    })();
    requests.set(key, work);
    try { return await work; } finally { requests.delete(key); }
  }
  return { search };
}
