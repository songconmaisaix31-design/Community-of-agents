/** Shared transport for the two fixed, server-side Zhihu summary endpoints. */
export type ZhihuFailure = 'unavailable' | 'invalid_query' | 'unauthorized' | 'rate_limited' | 'upstream_failed' | 'invalid_response' | 'cancelled' | 'timed_out';

export class ZhihuError extends Error {
  constructor(readonly code: ZhihuFailure, readonly retryAfter?: string) {
    super(`Zhihu retrieval: ${code}`);
    this.name = 'ZhihuError';
  }
}

export interface ZhihuOptions {
  accessSecret?: string;
  enabled?: boolean;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
}

export interface RetrievedSummary<T> {
  data: T;
  retrievedAt: string;
  cached: boolean;
  isSummary: true;
}

export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function officialData(body: unknown): unknown {
  if (!object(body) || typeof body.Code !== 'number') throw new ZhihuError('invalid_response');
  if (body.Code !== 0) {
    // 30001 covers rate, concurrency AND daily quota exhaustion in skill 0.7.2.
    throw new ZhihuError(body.Code === 10001 ? 'invalid_query' : body.Code === 20001 ? 'unauthorized' : body.Code === 30001 ? 'rate_limited' : 'upstream_failed');
  }
  return body.Data;
}

export function sourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port && (url.hostname === 'zhihu.com' || url.hostname.endsWith('.zhihu.com'))) return value;
  } catch { /* Never derive missing or unusable links from content IDs. */ }
}

/** Each endpoint has its own bounded, credential-scoped cache; failures are never cached. */
export function createSummaryGet<T>(options: ZhihuOptions, endpoint: 'zhihu_search' | 'question_answers', parse: (body: unknown, params: Record<string, string>) => T) {
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { expires: number; value: RetrievedSummary<T> }>();
  const pending = new WeakMap<AbortSignal, Map<string, Promise<RetrievedSummary<T>>>>();
  const ttl = Math.max(0, Math.min(options.cacheTtlMs ?? 300_000, 300_000));
  const capacity = Math.max(1, Math.min(options.maxCacheEntries ?? 100, 100));
  return async (params: Record<string, string>, signal: AbortSignal): Promise<RetrievedSummary<T>> => {
    if (!options.enabled || !options.accessSecret?.trim()) throw new ZhihuError('unavailable');
    if (signal.aborted) throw new ZhihuError('cancelled');
    const key = JSON.stringify(params);
    const saved = cache.get(key);
    if (saved && saved.expires > now()) return structuredClone({ ...saved.value, cached: true });
    if (saved) cache.delete(key);
    let requests = pending.get(signal);
    if (!requests) { requests = new Map(); pending.set(signal, requests); }
    const underway = requests.get(key);
    if (underway) return structuredClone(await underway);
    const work = (async (): Promise<RetrievedSummary<T>> => {
      const deadline = AbortSignal.timeout(Math.max(1, Math.min(options.timeoutMs ?? 15_000, 60_000)));
      const combined = AbortSignal.any([signal, deadline]);
      const url = new URL(`https://developer.zhihu.com/api/v1/content/${endpoint}`);
      for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
      try {
        const response = await request(url, {
          method: 'GET', redirect: 'error', cache: 'no-store', signal: combined,
          headers: { Authorization: `Bearer ${options.accessSecret}`, 'X-Request-Timestamp': String(Math.floor(now() / 1000)), 'Content-Type': 'application/json' },
        });
        if (response.status === 401 || response.status === 403) throw new ZhihuError('unauthorized');
        if (response.status === 429) throw new ZhihuError('rate_limited', response.headers.get('retry-after') ?? undefined);
        if (!response.ok) throw new ZhihuError('upstream_failed');
        // Node 24 JSON.parse source context preserves int64 tokens before Number rounding.
        // Restrict conversion to the official paging fields; ContentToken must remain a string.
        const body: unknown = JSON.parse(await response.text(), (key: string, value: unknown, context?: { source?: string }) => {
          if ((key === 'NextOffset' || key === 'Totals') && typeof value === 'number') {
            if (!context?.source || !/^(0|[1-9]\d*)$/.test(context.source)) throw new ZhihuError('invalid_response');
            return context.source;
          }
          return value;
        });
        const data = parse(body, params);
        combined.throwIfAborted();
        const value: RetrievedSummary<T> = { data, retrievedAt: new Date(now()).toISOString(), cached: false, isSummary: true };
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
  };
}
