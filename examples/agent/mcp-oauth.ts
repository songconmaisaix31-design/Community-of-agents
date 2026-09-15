import { randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { UnauthorizedError, type OAuthClientProvider, type OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';

function checkedUrl(value: string | URL): URL {
  const url = new URL(value);
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if (url.username || url.password || url.hash || url.search || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new Error('OAuth URL must use HTTPS or explicit loopback HTTP, without credentials, query or fragment');
  }
  return url;
}

/** One task, one server, one browser session. No credential files or token output. */
export class TaskOAuthProvider implements OAuthClientProvider {
  readonly redirectUrl: string;
  readonly clientMetadata: OAuthClientMetadata;
  readonly serverUrl: URL;
  #client?: OAuthClientInformationMixed;
  #tokens?: OAuthTokens;
  #verifier?: string;
  #discovery?: OAuthDiscoveryState;
  #state?: string;
  #pending = false;
  #open: (url: URL) => void | Promise<void>;

  constructor(options: { serverUrl: string | URL; redirectUrl: string | URL; openAuthorization: (url: URL) => void | Promise<void> }) {
    this.serverUrl = checkedUrl(options.serverUrl);
    this.redirectUrl = checkedUrl(options.redirectUrl).href;
    this.#open = options.openAuthorization;
    this.clientMetadata = {
      client_name: 'Gongzhi task MCP client', redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'none',
    };
  }

  clientInformation() { return this.#client; }
  saveClientInformation(value: OAuthClientInformationMixed) { this.#client = value; }
  tokens() { return this.#tokens; }
  saveTokens(value: OAuthTokens) { this.#tokens = value; }
  saveCodeVerifier(value: string) { this.#verifier = value; }
  codeVerifier() {
    if (!this.#verifier) throw new Error('No pending PKCE verifier');
    return this.#verifier;
  }
  state() {
    this.#state = randomBytes(32).toString('base64url');
    return this.#state;
  }
  async redirectToAuthorization(url: URL) {
    this.#pending = true;
    await this.#open(url);
  }
  discoveryState() { return this.#discovery; }
  saveDiscoveryState(value: OAuthDiscoveryState) {
    const prm = value.resourceMetadata;
    const metadata = value.authorizationServerMetadata;
    if (!prm || prm.resource !== this.serverUrl.href || !prm.authorization_servers?.includes(value.authorizationServerUrl)
      || !metadata || metadata.issuer !== value.authorizationServerUrl
      || !metadata.authorization_endpoint || !metadata.token_endpoint || !metadata.registration_endpoint
      || !metadata.code_challenge_methods_supported?.includes('S256')
      || !metadata.response_types_supported?.includes('code')
      || !metadata.token_endpoint_auth_methods_supported?.includes('none')) {
      throw new Error('Complete MCP resource/authorization metadata and public-client S256 support required');
    }
    for (const endpoint of [metadata.issuer, metadata.authorization_endpoint, metadata.token_endpoint, metadata.registration_endpoint]) checkedUrl(endpoint);
    this.#discovery = value;
  }
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    if (scope === 'all' || scope === 'client') this.#client = undefined;
    if (scope === 'all' || scope === 'tokens') this.#tokens = undefined;
    if (scope === 'all' || scope === 'discovery') this.#discovery = undefined;
    if (scope === 'all' || scope === 'verifier') {
      this.#verifier = undefined; this.#state = undefined; this.#pending = false;
    }
  }

  /** The host supplies its received callback URL, never a manually copied token. */
  consumeCallback(value: string | URL): string {
    const url = new URL(value);
    const expected = new URL(this.redirectUrl);
    if (!this.#pending || url.origin !== expected.origin || url.pathname !== expected.pathname || url.hash
      || url.username || url.password || url.searchParams.getAll('state').length !== 1
      || !this.#state || url.searchParams.get('state') !== this.#state) throw new Error('Invalid OAuth callback or state');
    const errors = url.searchParams.getAll('error');
    const codes = url.searchParams.getAll('code');
    this.#pending = false;
    this.#state = undefined;
    if (errors.length || codes.length !== 1 || !codes[0]) {
      this.#verifier = undefined;
      throw new Error('Authorization denied or malformed callback');
    }
    return codes[0];
  }
}

/** Host owns browser UI and callback listener; SDK owns discovery, DCR and token exchange. */
export async function connectTaskMcp(options: {
  serverUrl: string | URL;
  redirectUrl: string | URL;
  openAuthorization: (url: URL) => void | Promise<void>;
  receiveCallback: () => Promise<string | URL>;
}) {
  const provider = new TaskOAuthProvider(options);
  let client = new Client({ name: 'gongzhi-task', version: '1.0.0' });
  let transport = new StreamableHTTPClientTransport(provider.serverUrl, { authProvider: provider });
  try {
    try { await client.connect(transport); }
    catch (error) {
      if (!(error instanceof UnauthorizedError)) throw error;
      const code = provider.consumeCallback(await options.receiveCallback());
      await transport.finishAuth(code);
      provider.invalidateCredentials('verifier');
      await client.close();
      client = new Client({ name: 'gongzhi-task', version: '1.0.0' });
      transport = new StreamableHTTPClientTransport(provider.serverUrl, { authProvider: provider });
      await client.connect(transport);
    }
    return { client, close: async () => { try { await client.close(); } finally { provider.invalidateCredentials('all'); } } };
  } catch (error) {
    try { await client.close(); } finally { provider.invalidateCredentials('all'); }
    throw error;
  }
}
