"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ApiClientError, createApiClient } from "./api-client";
import type { Mode, PublicAuthConfig } from "./contracts";

export interface BrowserUser { id: string; email?: string; name?: string | null; avatar_url?: string | null; provider?: "zhihu"; user_metadata?: Record<string, unknown> }
export interface BrowserAuth {
  readonly available: boolean;
  initialize(): Promise<BrowserUser | null>;
  signIn(email: string, password: string): Promise<BrowserUser>;
  startSignIn(): Promise<void>;
  signOut(): Promise<void>;
  getAccessToken(): string | undefined;
  onChange(callback: (user: BrowserUser | null) => void): () => void;
  dispose(): void;
}
/** Small Supabase adapter. Local session is only UI state; the server always
 * verifies its bearer token with getUser before allowing a write. */
export function createBrowserAuth(mode: Mode, configuration?: PublicAuthConfig): BrowserAuth {
  if (configuration?.provider === "zhihu") return createCookieAuth(mode, configuration);
  const url = configuration ? configuration.url : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = configuration ? configuration.public_key : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const enabled = configuration ? configuration.available : process.env.NEXT_PUBLIC_GONGZHI_AUTH_ENABLED === "true";
  const available = mode === "live" && typeof window !== "undefined" && enabled && Boolean(url && key);
  const client: SupabaseClient | null = available ? createClient(url!, key!, {
    auth: { storageKey: "gongzhi.live.auth.v1", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  }) : null;
  let accessToken: string | undefined;
  const subscription = client?.auth.onAuthStateChange((_event, session) => { accessToken = session?.access_token; }).data.subscription;
  function requireClient(): SupabaseClient {
    if (!client) throw new ApiClientError({ code: "unavailable", message: "当前空间未启用本项目登录。", retryable: false });
    return client;
  }
  return {
    available,
    async startSignIn() { throw new ApiClientError({ code: "unavailable", message: "请加载本站最新知乎登录配置。", retryable: false }); },
    async initialize() {
      if (!client) return null;
      const { data, error } = await client.auth.getSession();
      if (error) throw new ApiClientError({ code: "unauthenticated", message: "无法恢复登录，请重新登录。", retryable: false });
      accessToken = data.session?.access_token;
      return data.session?.user ?? null;
    },
    async signIn(email, password) {
      const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
      if (error || !data.user || !data.session) throw new ApiClientError({ code: error?.status && error.status < 500 ? "unauthenticated" : "upstream_failed", message: error?.status && error.status < 500 ? "登录信息无效，请重试。" : "登录服务暂时不可用。", retryable: !error?.status || error.status >= 500 });
      accessToken = data.session.access_token; return data.user;
    },
    async signOut() {
      const { error } = await requireClient().auth.signOut({ scope: "local" });
      if (error) throw new ApiClientError({ code: "upstream_failed", message: "退出登录失败，请重试。", retryable: true });
      accessToken = undefined;
    },
    getAccessToken: () => accessToken,
    onChange(callback) {
      if (!client) return () => {};
      const { data } = client.auth.onAuthStateChange((_event, session) => callback(session?.user ?? null));
      return () => data.subscription.unsubscribe();
    },
    dispose() { subscription?.unsubscribe(); client?.auth.stopAutoRefresh(); accessToken = undefined; },
  };
}

/** The browser never receives a Zhihu or app session token. Only UI state lives here. */
function createCookieAuth(mode: Mode, configuration: PublicAuthConfig): BrowserAuth {
  const available = mode === "live" && typeof window !== "undefined" && configuration.available;
  const listeners = new Set<(user: BrowserUser | null) => void>();
  const signalKey = "gongzhi.live.auth.changed.v2";
  let current: BrowserUser | null = null, disposed = false, generation = 0;
  let intent = 0, signingOut = 0, refreshPending: Promise<BrowserUser | null> | undefined;
  const requests = new Map<AbortController, "read" | "start" | "logout">();
  async function bounded<T>(kind: "read" | "start" | "logout", run: (api: ReturnType<typeof createApiClient>) => Promise<T>): Promise<T> {
    const controller = new AbortController(); requests.set(controller, kind);
    const api = createApiClient(mode, { fetch: (url, init) => fetch(url, { ...init, signal: controller.signal }) });
    let stop!: () => void;
    const interrupted = new Promise<never>((_, reject) => { stop = () => reject(new ApiClientError(kind === "read"
      ? { code: "unavailable", message: "登录状态暂时无法确认。", retryable: true }
      : { code: "unknown", message: "登录操作响应未知，请先确认当前状态，不自动重试。", retryable: false })); });
    controller.signal.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(() => controller.abort(), 10_000);
    try { return await Promise.race([run(api), interrupted]); }
    finally { clearTimeout(timer); controller.signal.removeEventListener("abort", stop); requests.delete(controller); }
  }
  const cancel = (kind?: "read" | "start") => { for (const [controller, type] of requests) if (!kind || kind === type) controller.abort(); };
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  const emit = (user: BrowserUser | null) => { current = user; for (const listener of listeners) listener(user); };
  const signal = () => { try { window.localStorage.setItem(signalKey, `${Date.now()}:${Math.random()}`); } catch { /* Focus/expiry still refresh without storage. */ } };
  function refresh(notify = false): Promise<BrowserUser | null> {
    if (signingOut) return Promise.resolve(null);
    if (refreshPending) return refreshPending;
    refreshPending = read(notify).finally(() => { refreshPending = undefined; });
    return refreshPending;
  }
  async function read(notify: boolean) {
    if (!available || disposed) return null;
    const turn = ++generation;
    let session;
    try { session = await bounded("read", api => api.readAuthSession()); }
    catch (error) { if (!disposed && turn === generation) { if (expiryTimer) clearTimeout(expiryTimer); emit(null); } throw error; }
    if (disposed || turn !== generation) return current;
    if (expiryTimer) clearTimeout(expiryTimer);
    const expires = session.expires_at ? Date.parse(session.expires_at) : NaN;
    const user = session.user && Number.isFinite(expires) && expires > Date.now() ? session.user : null;
    emit(user);
    if (user) expiryTimer = setTimeout(() => { generation++; emit(null); signal(); }, Math.min(expires - Date.now(), 8 * 3600_000));
    if (notify) signal();
    return current;
  }
  const onFocus = () => { void refresh().catch(() => {}); };
  const onStorage = (event: StorageEvent) => { if (event.key === signalKey) onFocus(); };
  if (available) {
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    window.addEventListener("storage", onStorage);
    pollTimer = setInterval(onFocus, 60_000);
  }
  return {
    available,
    initialize: () => refresh(true),
    async startSignIn() {
      if (!available || disposed || signingOut) throw new ApiClientError({ code: "unavailable", message: "登录暂不可用，请等待当前操作结束。", retryable: false });
      const ownIntent = ++intent; cancel("start");
      const data = await bounded("start", api => api.startZhihuLogin());
      if (disposed || ownIntent !== intent) return;
      const url = new URL(data.authorization_url);
      if (url.origin !== "https://openapi.zhihu.com" || url.pathname !== "/authorize" || url.username || url.password || url.hash)
        throw new ApiClientError({ code: "upstream_failed", message: "登录服务返回无效授权地址。", retryable: false });
      window.location.assign(url.toString());
    },
    async signIn() { throw new ApiClientError({ code: "unavailable", message: "请通过知乎授权页面登录。", retryable: false }); },
    async signOut() {
      if (!available || disposed) throw new ApiClientError({ code: "unavailable", message: "登录服务不可用。", retryable: false });
      intent++; generation++; signingOut++; cancel("read"); cancel("start");
      try { await bounded("logout", api => api.logout()); }
      catch (error) { if (!disposed) { emit(null); signal(); } throw error; }
      finally { signingOut--; generation++; }
      if (disposed) return;
      if (expiryTimer) clearTimeout(expiryTimer);
      emit(null); signal();
    },
    getAccessToken: () => undefined,
    onChange(callback) { listeners.add(callback); return () => { listeners.delete(callback); }; },
    dispose() {
      disposed = true; generation++; intent++; cancel(); current = null; listeners.clear();
      if (expiryTimer) clearTimeout(expiryTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (available) { window.removeEventListener("focus", onFocus); window.removeEventListener("pageshow", onFocus); window.removeEventListener("storage", onStorage); }
    },
  };
}
