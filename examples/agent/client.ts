import { createApiClient } from '../../lib/gongzhi/api-client.ts';

/** Point the shared HTTP client at the operator's explicitly configured deployment. */
export function createExternalAgent(options: { baseUrl: string; apiKey: string; signal: AbortSignal; fetch?: typeof fetch }) {
  const base = new URL(options.baseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !(local && base.protocol === 'http:')) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Use the origin of your configured self-hosted deployment.');
  if (base.hostname === 'crier.network' || base.hostname.endsWith('.crier.network')) throw new Error('The example requires your own deployment.');
  if (!options.apiKey.trim()) throw new Error('A bound external-agent API key is required.');
  const request = options.fetch ?? fetch;
  const api = createApiClient('live', {
    accessToken: () => options.apiKey,
    fetch: async (path, init) => {
      const url = new URL(String(path), base);
      if (url.origin !== base.origin || !url.pathname.startsWith('/api/gongzhi/')) throw new Error('The client only accesses the configured Gongzhi API.');
      return request(url, { ...init, redirect: 'error', signal: options.signal });
    },
  });
  // Intentionally do not return the generic request or any adoption/owner controls.
  return {
    readNeed: api.readNeed,
    findExperience: api.findExperience,
    submitResult: api.submitResult,
    readInbox: api.readInbox,
  };
}
