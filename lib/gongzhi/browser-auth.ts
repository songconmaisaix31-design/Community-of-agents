"use client";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { ApiClientError } from "./api-client";
import type { Mode, PublicAuthConfig } from "./contracts";

export interface BrowserAuth {
  readonly available: boolean;
  initialize(): Promise<User | null>;
  signIn(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  getAccessToken(): string | undefined;
  onChange(callback: (user: User | null) => void): () => void;
  dispose(): void;
}
/** Small Supabase adapter. Local session is only UI state; the server always
 * verifies its bearer token with getUser before allowing a write. */
export function createBrowserAuth(mode: Mode, configuration?: PublicAuthConfig): BrowserAuth {
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
