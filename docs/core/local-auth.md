# Official local Auth and PostgreSQL

This environment runs the official Supabase GoTrue server with PostgreSQL and a small nginx path proxy for the existing Supabase SDK. It is a local development/acceptance environment, not production configuration. No Studio, Realtime, Storage replacement, custom login server or user-token verifier is added. Product sessions come from GoTrue and `identity.verifiedUser` still calls SDK `auth.getUser`.

Sources checked on 2026-09-14: [Crier](https://github.com/MiniMap-ai/crier.network) remains pinned to `b2919166335cff566f19246ed7ace2d833583633` with its retained license and original eight migrations; [Auth README](https://github.com/supabase/auth), [official self-hosting config](https://supabase.com/docs/guides/self-hosting/auth/config), and [official Docker Compose](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml) document standalone Auth and its database/JWT configuration. The selected official image is `supabase/gotrue:v2.196.0` at digest `sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232`. Existing Crier/Next, Supabase SDK, model adapter and storage code are retained.

`infra/local-auth/compose.yaml` owns only project `gongzhi-live-20260914`, with persistent volume `gongzhi-live-20260914_pg-data`. PG binds `127.0.0.1:56520`; the SDK base URL is `http://127.0.0.1:56521` (nginx maps `/auth/v1/` to GoTrue). Auth has only an internal Docker network; PG and nginx additionally have a host-access network for loopback port publication on Docker Desktop. The old `gongzhi-integration-73b8bb40-8d6` database on 56406 and the 8123/3019/3029 page services are untouched.

Fresh Windows setup (existing configuration must be reused, not regenerated):

```powershell
$config = Join-Path $env:LOCALAPPDATA 'gongzhi/local-auth-20260914-core'
./infra/local-auth/new-config.ps1 -ConfigDirectory $config
docker compose --env-file "$config/compose.env" -f infra/local-auth/compose.yaml up -d
node --env-file="$config/admin.env" scripts/migrate.mjs
node --env-file="$config/admin.env" --env-file="$config/accounts.env" infra/local-auth/provision-users.mjs
```

The config directory is outside Git with inheritance disabled and access granted only to the current Windows user. Generated passwords and keys never print. Bootstrap anon/service-role API keys follow the [official legacy HS256 API-key format](https://github.com/supabase/supabase/blob/master/docker/utils/generate-keys.sh); these are operator keys, not fabricated user sessions. Do not print expanded Compose configuration, environment files, tokens or Docker environment inspection output. `runtime.env` has the least-privilege Crier database connection and public Auth key; `admin.env` additionally has the migration connection and Auth service-role key; `compose.env` holds only container bootstrap configuration; `accounts.env` holds three reserved-domain `example.invalid` test accounts. Only `runtime.env` belongs in an application process.

Self-signup and phone/anonymous providers are disabled. Test users are created through official `auth.admin.createUser({email_confirm:true})`; no real email is sent, SMTP is unusable and Auth has no outbound network. Provisioning preserves existing users. The Auth role owns only its `auth` schema; `crier_app` is non-superuser/non-BYPASSRLS, and product migrations grant its existing server policies. Do not edit Auth-managed schema. Initialization runs only on a fresh volume, and product migration is always an explicit separate command. Builds and startup do not run product migrations.

The local proxy explicitly allows browser origins `http://127.0.0.1:3039`, `http://localhost:3039` and the Core image-test equivalents on 3041. It answers Supabase SDK preflight headers and reflects only those origins; unrelated origins receive no allow-origin header. A successful Node login alone does not test this browser requirement.

Core testing uses separate databases so the `gongzhi` experience database remains available for integration:

```powershell
node --env-file="$config/admin.env" --env-file="$config/accounts.env" infra/local-auth/prepare-test-databases.mjs $config
node --env-file="$config/core-test.env" scripts/migrate.mjs
node --env-file="$config/core-test.env" --import tsx --test tests/core/live-auth.test.ts
node --env-file="$config/scratch.env" scripts/check-migrations.mjs
```

The real-Auth test requires `GONGZHI_REAL_AUTH_TEST=true`, loopback Auth 56521 and `gongzhi_core_test` on 56520; default test runs skip it. It uses real GoTrue sessions and PG with the production REST/MCP handlers, without an Auth stub. Its posts explicitly label automated verification and do not prove autonomous Agent/model execution. The older `GONGZHI_TEST_DATABASE_ENV` suites retain their explicit HTTP Auth stubs and represent a different evidence tier. Migration checking requires the initially empty `gongzhi_migration_check` database; it performs two upstream passes and checks that the actual migration runner's second pass changes no ledger entries. Re-running that checker on its already-populated scratch DB is deliberately refused; never reset an experience DB to satisfy it.

`runtime.env` can start the integrated application on the agreed loopback port 3039. I owns that process and its experience database during acceptance; C uses only the two test databases. Use session-local sign-out in tests to avoid revoking another tester's refresh sessions. Keep named volumes and configuration for restart/persistence checks; do not use `down -v` or remove existing data. Cloud Auth, SMTP, model/provider execution, real independent Agent operation and public deployment remain separate acceptance steps.

## Isolated configuration preparation (paused before startup)

On 2026-09-14 Core merged `7b4a105d67b154b08a1a5a4c9d3647a62d87c838` and `4e4c0ce3301b0956919d31c90310957e2ae7ff69` with `--no-ff`. The coordinator then narrowed this dispatch to configuration preparation so the Zhihu check could happen first. **No new private configuration, credentials, containers, networks, volumes, accounts, grants, registrations or Agent records were created.** No existing database/service was changed, stopped or reloaded. The candidate `gongzhi-isolated-20260914` project/volume/network, ports 56530/56531/3045 and `%LOCALAPPDATA%/gongzhi/isolated-20260914` were absent at the initial read-only check; this must be checked again before later execution.

The existing generator now accepts a complete explicit project/PG/Auth/app-port tuple; partial tuples, reused default project, duplicate/out-of-range ports and reserved current-service ports fail. Omitting the tuple keeps the default 56520/56521/3039 environment. New configuration still requires a new private directory with restricted Windows ACLs, uses exclusive file creation and refuses a nonempty directory. Generation failure preserves its partial directory for review; do not rerun by deleting or rotating existing configuration.

For a later authorized isolated environment, after checking conflicts again (commands below were **not executed** in this preparation dispatch):

```powershell
$isolatedConfig = Join-Path $env:LOCALAPPDATA 'gongzhi/isolated-20260914'
./infra/local-auth/new-config.ps1 -ConfigDirectory $isolatedConfig -Project gongzhi-isolated-20260914 -PgPort 56530 -AuthPort 56531 -AppPort 3045
node --env-file="$isolatedConfig/runtime.env" infra/local-auth/write-container-env.mjs $isolatedConfig --isolated
docker compose --env-file "$isolatedConfig/compose.env" -f infra/local-auth/compose.yaml up -d
# Explicitly inspect the new target and its empty public schema before migration:
node --env-file="$isolatedConfig/admin.env" scripts/migrate.mjs
node --env-file="$isolatedConfig/admin.env" --env-file="$isolatedConfig/accounts.env" infra/local-auth/provision-users.mjs --isolated
```

Only the generated `container-isolated.env` belongs in the application container. `--isolated` requires matching `GONGZHI_LOCAL_PROJECT`, `GONGZHI_LOCAL_PG_PORT`, `GONGZHI_LOCAL_AUTH_PORT`, `GONGZHI_LOCAL_APP_PORT` metadata from the generated environment; it rejects a different DB role/name/host/port, Auth endpoint or application URL instead of falling back to the experience environment. It uses the existing Docker-host TLS opt-in, keeps the assistant/telemetry disabled, and adds no user-session signer or model call. User provisioning continues through official GoTrue admin APIs using reserved-domain test accounts; subsequent login/getUser, human bindings, finite grants and each Agent's own registration remain separate pending actions. These accounts would demonstrate different test-account owners, not two real public users.

Compose now accepts the generated project name and app port and mounts the generated private `nginx.conf` path. The existing repository `nginx.conf` and `init-db.sh` are unchanged; the new CORS file is generated separately, allows only the explicitly selected app port and is never written through a live container's bind mount. Old `compose.env` files retain the original project/ports and original nginx-path fallback. No existing gateway needs reloading. Builds/startup still do not invoke product migrations.

Preparation checks: the three new `tests/core/local-auth-config.test.ts` cases passed (defaults, explicit isolation, URL/CORS targets, no overwrite); `npm run test:core` passed 38 with 4 live-environment cases skipped; `npm run typecheck` and `npm run build` passed. A separate **synthetic-values-only** `docker compose config --format json` render passed for both defaults and the explicit candidate, checking loopback ports, project/volume names, site URL and mount path without creating resources or printing environment values. Real isolated configuration generation, Windows Docker mounting, Auth/PG startup and different-owner Agent cooperation remain unverified. Existing production image `gongzhi-integration:ec12c9e` was found locally at `sha256:b933ecf7737c3fae1485a2719ca4666d83a7a3e1caae4ef74ceba4fc5bf249ef`; it was not started or replaced in this dispatch.
