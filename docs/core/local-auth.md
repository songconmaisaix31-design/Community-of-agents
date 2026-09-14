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
