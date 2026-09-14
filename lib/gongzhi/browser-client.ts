import { createApiClient } from "./api-client";
import { createBrowserAuth } from "./browser-auth";
export { createApiClient, ApiClientError } from "./api-client";
export { createBrowserAuth } from "./browser-auth";
export * from "./contracts";

export async function loadPublicConfig() { return createApiClient("live").readConfig(); }
/** Static-page entry, using the same SDK/session adapter and API client as Next. */
export async function createGongzhiBrowserClient() {
  const config = await loadPublicConfig();
  const auth = createBrowserAuth("live", config.auth);
  const api = createApiClient("live", { accessToken: () => auth.getAccessToken() });
  return { config, auth, api };
}
