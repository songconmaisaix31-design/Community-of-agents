import { object } from './http.ts';

// Server-side upstream protocol only. Core owns browser state, sessions and identity mapping.
const origin = 'https://openapi.zhihu.com';
const maxBodyBytes = 65_536;
export type ZhihuOAuthFailure = 'unavailable' | 'invalid_request' | 'unauthorized' | 'rate_limited' | 'upstream_failed' | 'invalid_response' | 'cancelled' | 'timed_out';
export class ZhihuOAuthError extends Error {
  readonly retryable = false;
  constructor(readonly code: ZhihuOAuthFailure) {
    super(`Zhihu OAuth: ${code}`);
    this.name = 'ZhihuOAuthError';
  }
}
export interface ZhihuOAuthOptions {
  appId?: string;
  appKey?: string;
  redirectUri?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}
/** Secret: exchangeCode's result must stay in the server request, never a browser response. */
export interface ZhihuOAuthToken { accessToken: string; expiresIn: number }
export interface ZhihuOAuthUser {
  subject: string;
  uid: string | null;
  hashId: string | null;
  name: string | null;
  avatarUrl: string | null;
}
const fail = (code: ZhihuOAuthFailure): never => { throw new ZhihuOAuthError(code); };
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);

function configuration(options: ZhihuOAuthOptions) {
  if (!text(options.appId, 200) || !text(options.appKey, 4096) || !text(options.redirectUri, 2048)) return fail('unavailable');
  try {
    const url = new URL(options.redirectUri);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.hash || options.redirectUri.includes('\\') || ['state', 'code', 'authorization_code'].some(key => url.searchParams.has(key))) return fail('unavailable');
    // Preserve the configured spelling, query and trailing slash in BOTH protocol requests.
    return { appId: options.appId, appKey: options.appKey, redirectUri: options.redirectUri };
  } catch { return fail('unavailable'); }
}

/** Keep cancellation bounded even if an injected transport/body ignores its signal. */
function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new ZhihuOAuthError('cancelled'));
    signal.addEventListener('abort', abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) { signal.removeEventListener('abort', abort); abort(); }
  });
}

async function jsonBody(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (length && /^\d+$/.test(length) && BigInt(length) > BigInt(maxBodyBytes)) return fail('invalid_response');
  if (!response.body) return fail('invalid_response');
  const reader = response.body.getReader();
  const bytes = new Uint8Array(maxBodyBytes);
  let size = 0;
  let ended = false;
  try {
    while (true) {
      const chunk = await abortable(reader.read(), signal);
      if (chunk.done) { ended = true; break; }
      if (size + chunk.value.byteLength > maxBodyBytes) return fail('invalid_response');
      bytes.set(chunk.value, size);
      size += chunk.value.byteLength;
    }
    let raw: string;
    try { raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)); }
    catch { return fail('invalid_response'); }
    return JSON.parse(raw, (key: string, value: unknown, context?: { source?: string }) => {
      // Node 24 source context is the original JSON number token, NOT String(rounded Number).
      if ((key === 'uid' || key === 'expires_in') && typeof value === 'number') {
        if (!context?.source || !/^[1-9]\d*$/.test(context.source)) return fail('invalid_response');
        return context.source;
      }
      return value;
    });
  } finally {
    if (!ended) { try { await abortable(reader.cancel(), signal); } catch { /* Outer request maps cancellation/timeout. */ } }
    reader.releaseLock();
  }
}

function payload(value: unknown): Record<string, unknown> {
  if (!object(value)) return fail('invalid_response');
  // 20000 is documented success; unknown business codes never establish an identity.
  if (value.code !== undefined && value.code !== 20000) return fail(value.code === 404 || value.code === 401 || value.code === 403 ? 'unauthorized' : 'upstream_failed');
  if (value.error !== undefined) return fail('upstream_failed');
  const data = value.data === undefined ? value : value.data;
  if (!object(data)) return fail('invalid_response');
  if (data !== value && (data.error !== undefined || data.code !== undefined && data.code !== 20000)) return fail('upstream_failed');
  return data;
}

function user(value: unknown): ZhihuOAuthUser {
  const data = payload(value);
  let uid: string | null = null;
  if (data.uid !== undefined && data.uid !== null) {
    if (typeof data.uid !== 'string' || !/^[1-9]\d{0,18}$/.test(data.uid) || BigInt(data.uid) > 9223372036854775807n) return fail('invalid_response');
    uid = data.uid;
  }
  const hashId = typeof data.hash_id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(data.hash_id) ? data.hash_id : null;
  if (!hashId && !uid) return fail('invalid_response');
  let avatarUrl: string | null = null;
  if (text(data.avatar_path, 2048)) {
    try {
      const url = new URL(data.avatar_path);
      if (url.protocol === 'https:' && !url.username && !url.password) avatarUrl = data.avatar_path;
    } catch { /* Optional display field; never fetch an avatar here. */ }
  }
  // Deliberately omit email, phone, gender, biography and extra provider properties.
  return { subject: hashId ? `hash:${hashId}` : `uid:${uid}`, uid, hashId, name: text(data.fullname, 200) ? data.fullname : null, avatarUrl };
}

export function createZhihuOAuth(options: ZhihuOAuthOptions) {
  if (typeof window !== 'undefined') return fail('unavailable');
  // Snapshot server configuration so authorize and exchange cannot drift after construction.
  const settings = { appId: options.appId, appKey: options.appKey, redirectUri: options.redirectUri };
  const request = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) return fail('unavailable');
  async function call(endpoint: 'access_token' | 'user', init: RequestInit, signal: AbortSignal) {
    if (signal.aborted) return fail('cancelled');
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.min(timeoutMs, 15_000));
    try {
      const url = `${origin}/${endpoint}`;
      const response = await abortable(request(url, { ...init, redirect: 'error', cache: 'no-store', signal: controller.signal }), controller.signal);
      if (response.redirected || (response.url && response.url !== url)) return fail('upstream_failed');
      if (response.status === 401 || response.status === 403) return fail('unauthorized');
      if (response.status === 429) return fail('rate_limited');
      if (!response.ok) return fail('upstream_failed');
      const result = await jsonBody(response, controller.signal);
      controller.signal.throwIfAborted();
      return result;
    } catch (error) {
      if (signal.aborted) return fail('cancelled');
      if (timedOut) return fail('timed_out');
      if (error instanceof ZhihuOAuthError) throw error;
      return fail(error instanceof SyntaxError ? 'invalid_response' : 'upstream_failed');
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      controller.abort();
    }
  }
  return {
    authorizationUrl(state: string): string {
      const config = configuration(settings);
      if (!text(state, 1024)) return fail('invalid_request');
      const url = new URL(`${origin}/authorize`);
      url.search = new URLSearchParams({ redirect_uri: config.redirectUri, app_id: config.appId, response_type: 'code', state }).toString();
      return url.href;
    },
    async exchangeCode(authorizationCode: string, signal: AbortSignal): Promise<ZhihuOAuthToken> {
      const config = configuration(settings);
      if (!text(authorizationCode, 8192)) return fail('invalid_request');
      const body = new URLSearchParams({ app_id: config.appId, app_key: config.appKey, grant_type: 'authorization_code', redirect_uri: config.redirectUri, code: authorizationCode });
      const data = payload(await call('access_token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: body.toString() }, signal));
      if (!text(data.access_token, 8192) || /\s/.test(data.access_token) || typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer' || typeof data.expires_in !== 'string' || !/^[1-9]\d*$/.test(data.expires_in) || !Number.isSafeInteger(Number(data.expires_in))) return fail('invalid_response');
      return { accessToken: data.access_token, expiresIn: Number(data.expires_in) };
    },
    async readUser(accessToken: string, signal: AbortSignal): Promise<ZhihuOAuthUser> {
      configuration(settings);
      if (!text(accessToken, 8192) || /\s/.test(accessToken)) return fail('invalid_request');
      return user(await call('user', { method: 'GET', headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }, signal));
    },
  };
}
