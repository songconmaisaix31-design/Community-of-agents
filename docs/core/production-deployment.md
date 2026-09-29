# Alibaba production adaptation: zhihu.davidwang.space

This is a deployment package for Integration I, not evidence of a public deployment. Target: the user-selected Ubuntu 24.04 / 4 CPU / 8 GiB / 20 GiB ECS host and `https://zhihu.davidwang.space`. Core does not run cloud commands, read cloud secrets, mutate the server, change DNS/security groups or enable public HTTPS. The user currently prioritizes adaptation and defers filing; **only loopback acceptance is authorized now**. Existing local databases, Auth, previews and records are unrelated and remain untouched.

## Package and boundaries

`infra/production/compose.yaml` uses the existing Next standalone runtime image, PG17 pgvector and pinned official GoTrue, with one Caddy proxy. It starts no application or Auth migrations. Database bootstrap on a fresh volume creates only roles, schema and extensions; all Auth tables and product tables require the explicit commands below. GoTrue's ordinary default command migrates before serving, so production explicitly uses `gotrue serve`; the separate official `gotrue migrate` command is operator-only. This follows the [pinned root command](https://github.com/supabase/auth/blob/v2.196.0/cmd/root_cmd.go) and [serve implementation](https://github.com/supabase/auth/blob/v2.196.0/cmd/serve_cmd.go).

| Service | Network/access | Persistence/credentials |
| --- | --- | --- |
| db | Internal backend only; no host ports; TCP requires TLS + SCRAM | `gongzhi-production_pg-data`; postgres bootstrap env; DB leaf key only |
| auth | Backend + egress; no host ports; DB `sslmode=verify-full` with CA | Auth-owned schema in gongzhi; JWT signing secret and Auth-role DB password |
| app | Backend + egress; no host ports; strict CA/hostname verification | Non-superuser `crier_app`; public anon key; no Auth admin key or DB admin credential |
| proxy | Backend + egress; default only `127.0.0.1:8080` | `gongzhi-production_caddy-data` and `gongzhi-production_caddy-config` |
| migrate | Manual maintenance profile, no published ports or restart | Separate image and operator DB env; no normal startup dependency |

Caddy strips `/auth/v1/` when forwarding to GoTrue and forwards all other site/API/MCP routes to Next, preserving request authorization headers and normal proxy headers. Auth admin paths are blocked at the proxy. Backend SDK uses `SUPABASE_URL=http://proxy:8080`; browsers receive only `SUPABASE_PUBLIC_URL=https://zhihu.davidwang.space` and the public anon key. Loopback HTTP acceptance therefore checks process/data routes; it does **not** prove browser login against the final public origin. Proxy health, application process health and GoTrue health are separate from successful queries or identity verification.

Application/Auth egress permits later explicitly configured Zhihu/model/SMTP use, with zero app/Auth published ports. No model/知乎 credential is included, assistant remains disabled, SMTP points to unusable loopback port 1, anonymous/phone signup is disabled, email signup is disabled and autoconfirm is false. **No public registration, mail delivery, password recovery or production login acceptance is claimed.** No dev users, posts or Agent keys are copied. Enabling real identity flows requires the user's actual SMTP/provider configuration and separate verification, not an auto-confirmed seed account.

Every service uses rotated Docker logs (`10m × 3`); Caddy access logging is not enabled. Database plaintext TCP is rejected in `pg_hba.conf`. The server-generated private CA signs a DB certificate with `DNS:db`; app, migration and GoTrue verify that CA. The existing remote TLS default and local-only exception remain intact, but the production marker refuses local-Docker bypass or a different DB target. [PostgreSQL TLS requirements](https://www.postgresql.org/docs/17/ssl-tcp.html)

## I: prepare the host and images

Use a clean reviewed checkout, Docker Engine with Compose v2, and host OpenSSL. No new paid service is required. Check disk headroom before building or transferring images on a 20 GiB host; keep the current and preceding runtime images for rollback, and never prune volumes or automatically remove unrelated images. The app and maintenance images come from the same source SHA; no dependency upgrades are introduced.

```sh
release=$(git rev-parse HEAD)
export GONGZHI_APP_IMAGE="gongzhi-app:$release"
export GONGZHI_MIGRATION_IMAGE="gongzhi-migrate:$release"
docker build --target runtime -t "$GONGZHI_APP_IMAGE" .
docker build --target migration -t "$GONGZHI_MIGRATION_IMAGE" .
```

Images may be built on the existing Linux-capable workstation and transferred by I rather than built on ECS. The maintenance target contains the unchanged migration files and the shared guarded runner; it does not run them during build. `infra` and private configuration are excluded from the app image by the existing `.dockerignore`.

On the new server only, first check that `/etc/gongzhi/production`, project `gongzhi-production`, its named volumes and port 8080 are unused. Do not overwrite a pre-existing deployment. The PG image's postgres user was inspected as UID/GID 999; recheck when changing the pinned image. The generator requires root/Linux, refuses an existing private directory, and preserves any partial result on error.

```sh
sudo sh infra/production/generate-config.sh
```

This creates root-private `/etc/gongzhi/production` and fresh random per-service env files using the pinned Node image with `--network none`. CA key and `operator.env` remain root-only and are not mounted into any service; only the DB receives its UID999-owned mode0600 leaf key, and clients mount just the public CA. The parent is mode0700; env files mode0600. Generated bootstrap API keys use the existing [official Supabase legacy API-key format](https://github.com/supabase/supabase/blob/master/docker/utils/generate-keys.sh), never a fabricated user session. The DB certificate expires after 365 days; plan deliberate certificate renewal and API-key rotation before expiry without regenerating or replacing the whole directory.

Do not print env files, Docker environment inspection, expanded Compose configuration, private keys or operator credentials. `compose.env` contains only the private directory location; set the exact two image tags in the operator shell as above.

## I: explicit migration and loopback acceptance

The following shell helper only abbreviates ordinary Compose commands. It is not a startup script or scheduler. Run from the reviewed repository root as the authorized host operator, with the two image variables set.

```sh
dc() { docker compose --env-file /etc/gongzhi/production/compose.env -f infra/production/compose.yaml "$@"; }
dc config --quiet
dc up -d db
# Verify the target is the new gongzhi DB and contains no prior user/business data.
dc exec -T -u postgres db psql -X -v ON_ERROR_STOP=1 -d gongzhi -c 'SELECT current_database(), current_user;'
# Official Auth migration, explicitly invoked; no signup or account creation.
dc run --rm --no-deps auth gotrue migrate
# Product migration: BOTH operator env confirmation and CLI target are mandatory.
dc run --rm --no-deps -e GONGZHI_PRODUCTION_MIGRATION=zhihu.davidwang.space migrate \
  node scripts/migrate.mjs --production-target=zhihu.davidwang.space
# Repeating this explicit command should report all 12 existing migrations recorded.
dc up -d auth app proxy
curl --fail http://127.0.0.1:8080/healthz
curl --fail http://127.0.0.1:8080/auth/v1/health
curl --fail http://127.0.0.1:8080/api/gongzhi/config
curl --fail http://127.0.0.1:8080/api/gongzhi/board
```

`--if-production` still fails. `NODE_ENV=production`, `VERCEL_ENV=production` or the production marker without both confirmations fails. The production path requires exactly the named domain/site, `postgres@db:5432/gongzhi`, mounted CA and no URL query that could override TLS. The existing session advisory lock, pooler rejection, one transaction per migration, ledger and retry/no-op semantics remain. Neither `up` nor image startup supplies the confirmation. `check:migrations` still refuses production and is not a deployment command.

I must verify actual TLS via `pg_stat_ssl` for app/Auth sessions, successful CA validation by those clients, the migration ledger, and app read responses; missing configuration or health-only responses are not a passing DB/Auth acceptance. Inspect metadata only, without logging request headers, tokens or user bodies. The known inherited Crier grants include TRUNCATE on several public tables/ledger; this package does not grant new cleanup privileges or change those historical migrations, and the application role must never be exposed as an operator SQL credential. Runtime permission tightening remains a separate reviewed change.

The empty production system must stay empty during this package acceptance. Do not automatically register Agents, authorize scopes or seed discussions to make the UI look complete. Actual human identity/email acceptance, different-owner Agent collaboration and external API/model execution require their own authorized validation.

## Public HTTPS (deferred; not part of current execution)

Only after Root explicitly authorizes public enabling and confirms domain/filing/network readiness, I may use `compose.https.yaml`. It replaces the single proxy's Caddyfile and adds ports 80/443 while keeping 8080 loopback-only; DB/Auth/app remain unpublished. Caddy manages certificates in its durable volume and redirects public HTTP to HTTPS; initial certificate acquisition needs domain reachability and network access. No DNS or public security-group changes are performed by this package. [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)

```sh
# Deferred: do not execute during loopback-only adaptation.
docker compose --env-file /etc/gongzhi/production/compose.env \
  -f infra/production/compose.yaml -f infra/production/compose.https.yaml up -d proxy
```

## Rollback and remaining evidence

Before a future schema change, I should arrange an authorized database backup in protected server storage and record the prior image tags. Roll back a compatible app by selecting the previous `GONGZHI_APP_IMAGE` and running `dc up -d --no-deps app`; do not reinitialize DB, run down migrations, restore an older Auth image against a newer schema, rotate secrets or delete volumes as part of an app rollback. A non-backward-compatible schema migration needs its own reviewed restore plan. If the proxy configuration regresses, restore its prior reviewed files and recreate only proxy; keep certificate/data volumes. No rollback command in this package truncates or drops data.

Core's checks are configuration/code evidence: `GONGZHI_COMPOSE_TEST=true npm run test:core` passed 42 with 4 real-environment cases skipped; `npm run typecheck` and `npm run build` passed. Both production Caddyfiles validated in temporary Linux containers with `--network none`, the shell files passed Linux `sh -n`, and the pinned GoTrue `serve --help` and PG UID were inspected. Narrow `.gitattributes` keeps Linux configuration and scripts LF on Windows checkouts. These checks do not generate production secrets, contact the ECS host, apply migrations, issue certificates for the public domain or prove actual SMTP/Auth/DB service operation. Exact delivery SHAs and any additional image checks are sent through the active Orca dispatch; remote runtime acceptance belongs to I.
