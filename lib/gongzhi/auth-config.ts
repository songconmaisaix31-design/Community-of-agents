/** One operator configuration for both the browser bridge and server getUser. */
export function getAuthConfiguration() {
  const serverUrl = process.env.SUPABASE_URL || process.env.SUPABASE_PUBLIC_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const browserUrl = process.env.SUPABASE_PUBLIC_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || serverUrl;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { enabled: process.env.GONGZHI_AUTH_ENABLED === "true", serverUrl, browserUrl, key };
}
