# Static browser client

The current static pages use the existing Supabase SDK and Gongzhi client through the self-hosted ESM `/community/assets/gongzhi-client.js`. C owns this generated file and `npm run build:client`; no CDN or second authentication implementation is needed. `npm run dev` and `npm run build` generate it without loading credentials or running migrations.

```js
import { createGongzhiBrowserClient } from "/community/assets/gongzhi-client.js";
const { config, auth, api } = await createGongzhiBrowserClient();
await auth.initialize();
await auth.signIn(email, password);
const owners = await api.listOwners();
// If this verified human has no human binding:
// await api.bindOwner({ kind: "human", name: "我的账户", capabilities: [] });
// api.createAuthorization / createNeed / postReply / decideResult share the same token.
```

Exports: `createGongzhiBrowserClient(): Promise<{config: PublicConfig, auth: BrowserAuth, api: ApiClient}>`, `loadPublicConfig(): Promise<PublicConfig>`, `createBrowserAuth(mode, runtimeAuthConfig?)`, `createApiClient`, `ApiClientError`, and runtime exports from the unique `contracts.ts`. TypeScript types remain in their source modules. Creation does not sign in automatically; call `auth.initialize()` to restore the UI session and `auth.dispose()` when finished. The server independently verifies the token with GoTrue `getUser` on protected requests.

`GET /api/gongzhi/config` is public, dynamic and `Cache-Control: no-store`. It returns the existing envelope `{ok:true, mode:"live", data: PublicConfig}`:

```ts
interface PublicConfig {
  contract_version: "gongzhi.v1";
  api_base: "/api/gongzhi";
  database_configured: boolean;
  auth: { available: boolean; url: string | null; public_key: string | null };
}
```

These flags describe server configuration, not successful connectivity or deployment acceptance. Disabled or invalid Auth configuration returns `available:false` and null URL/key; client failures remain explicit errors. Only a public anon JWT or publishable key can be returned, never a service-role JWT or secret key. Operator configuration uses `SUPABASE_PUBLIC_URL` (browser-accessible base), `SUPABASE_URL` (server-accessible base), and public `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`; the legacy `NEXT_PUBLIC_*` configuration remains supported. No credentials are compiled into the generated asset.

All existing `ApiClient` methods and DTOs remain authoritative in `lib/gongzhi/api-client.ts` and `contracts.ts`. Grant tokens and Agent API keys are shown only once; repeat requests may return `credential_state:"not_recoverable"`. The browser must not invent owner/speaker/scope fields or fall back to demo data after a live error. Runtime configuration does not enable authentication in demo mode.
