# Production artifact and operator configuration

`Dockerfile` builds the existing locked Next/Crier app and self-hosted browser ESM. It uses a pinned official Node 24 Alpine image, a clean `npm ci`, and `npm run build`; the non-root runtime contains Next standalone output, static files, the existing product assets and Crier license. It has no database migration, Auth bootstrap, test seed, model call or deployment side effect. `.dockerignore` excludes secrets and private documents; only the public `docs/connect/agent-skill.md` protocol document is allowed, and Next tracing includes it for I's `/agent-skill.md` route.

```sh
docker build -t gongzhi:review .
docker run --name gongzhi-review --env-file /private/gongzhi/runtime.env -p 127.0.0.1:3039:3000 gongzhi:review
```

Run only on an agreed unused port and do not replace existing project services. Use an application-only environment file, not `admin.env` or `compose.env`. Required production settings are `GONGZHI_DATABASE_ENABLED=true`, least-privilege `DATABASE_URL`, `GONGZHI_AUTH_ENABLED=true`, `SUPABASE_URL` reachable from the container, a public `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`, browser-accessible `SUPABASE_PUBLIC_URL`, canonical `SITE_URL`, and a private `CRIER_HASH_SECRET`. The public config endpoint never needs an Auth service-role key. `NEXT_PUBLIC_*` values are optional legacy configuration; the static pages read runtime config. Do not pass secrets with build arguments. Model/provider settings remain in the existing D-owned configuration and are separately authorized.

For Docker Desktop accessing the dedicated local services, the *server* connection hostname is `host.docker.internal` (PG 56520/Auth 56521), while `SUPABASE_PUBLIC_URL` stays `http://127.0.0.1:56521` for the local browser. Set `GONGZHI_LOCAL_DOCKER_DATABASE=true` only for that local Docker host connection; it never disables required TLS for other remote hostnames. Never ship those local URLs, reserved test accounts, auto-confirm settings or development JWT secrets to production. Real production needs an operator-selected project, domain/TLS, database/session migration connection, Auth public/server URLs, signup/email policy and managed runtime secrets. None were provided or deployed in this round.

The image's health check probes `/api/gongzhi/config` for process liveness only. `auth.available` and `database_configured` mean configured; neither proves connectivity. Acceptance must additionally perform real login/server verification, authenticated owner/authorization operations and durable record rereads, checking the expected environment explicitly. Test `/agent-skill.md` in I's final integrated image: C's isolated branch does not contain I's route or D's document, so a successful C image alone does not validate that integrated URL.

The original dependency audit on 2026-09-14 reported two affected packages through Next's PostCSS dependency. A scoped `overrides.next.postcss = "8.5.28"` keeps Next at 15.5.25 and uses the [maintainer's PostCSS release](https://github.com/postcss/postcss/releases/tag/8.5.28), including the [source-map disclosure fixes](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp). The updated lock audit reports zero findings. The lock was updated without mutating local `node_modules`; clean image installation and real compiled CSS/browser checks validate the override. No automatic major upgrade is used.

Local image/browser acceptance uses a separate Core test database and port 3041:

```powershell
$config = Join-Path $env:LOCALAPPDATA 'gongzhi/local-auth-20260914-core'
node --env-file="$config/core-test.env" infra/local-auth/write-container-env.mjs $config
docker run -d --name gongzhi-core-image-check --env-file "$config/container-core.env" -p 127.0.0.1:3041:3000 gongzhi-core:live-20260914
$env:GONGZHI_BROWSER_TEST_URL = 'http://127.0.0.1:3041'
node --env-file="$config/core-test.env" --import tsx --test tests/core/browser-client-live.test.ts
```

This browser test imports the real generated ESM, logs into GoTrue, reaches the container's authenticated HTTP API, reloads and restores the session, signs out locally, and checks demo forwarding rejection. It does not test K's full page workflow; I owns that acceptance. The configuration generator refuses existing output instead of rotating it silently. Existing containers must be reused or explicitly coordinated, not overwritten by repeating the example command.

For I's explicitly agreed experience-database container, run `node --env-file="$config/runtime.env" infra/local-auth/write-container-env.mjs $config --experience`. This separately creates `container-integration.env`, targeting only the same dedicated `gongzhi` database via the Docker host and site 3039. It copies only application settings, explicitly disables the platform assistant and telemetry, and includes no account password, grant, model key or admin credential. The default without `--experience` still requires `gongzhi_core_test`; it cannot silently select the experience database.

Provision migrations independently with the reviewed project's direct/session connection. The current migration command still refuses `VERCEL_ENV=production` and `--if-production`; selecting a production migration mechanism remains an explicit operator step once the actual environment is supplied. Builds and image startup must stay migration-free. Configure persistent database storage/backups outside the stateless application image; Auth database and product data are separate schema responsibilities. Container liveness, a local Auth/PG run and automated messages are not public deployment or independent Agent/model acceptance.
