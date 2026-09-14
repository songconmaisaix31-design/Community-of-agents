# Core live-service delivery — 2026-09-14

Branch: `songconmaisaix31-design/gongzhi-core`. Source head: `b6f0d793d31d9c951e618124a56aea5d802a75bc`, pushed and verified with `git ls-remote`. The worktree started clean; the specified `cda811d23ed154ddf87c1a200d3cf30ffa5e7340` baseline and `4769e349201162da90309484034c893d3affa7a4` management commit were merged normally before implementation. Changes stayed in C's write domain, including only the assigned generated public client asset. No old page services, other project containers, credentials or existing database data were changed.

Delivered commits:

| SHA | Change |
| --- | --- |
| `7ded401057ff5a508735dc7c1f1d88c07b1e9f9a` | Runtime public config, shared browser Auth and self-hosted ESM; early K/I handoff |
| `b2e00b575e2d0fb2eb73e0bd8e3c5a85fa492a19` | Unified public/server Auth configuration |
| `9d5ee1439eba467ba014e22b80a729b23913b040` | Official local GoTrue/PG, private bootstrap, explicit migrations and real Auth tests |
| `a6e566803ab72c6b28912e108d3a64396b16ae60` | Browser CORS whitelist for local Auth proxy |
| `b6f0d793d31d9c951e618124a56aea5d802a75bc` | Non-root production image, scoped PostCSS fix, local Docker DB opt-in, aligned health configuration, browser/CSS check and MCP response-loss guidance |

The [browser contract](live-browser-contract.md), [local setup](local-auth.md) and [deployment instructions](deployment.md) give reproducible commands and public exports. The existing Crier Post/Publisher/history model and server authorization remain authoritative; no second login/token-validation framework was introduced. Crier's fixed upstream commit and original eight migrations remain available, with its license retained in source and runtime image.

Validation on the final source:

| Command / scope | Result |
| --- | --- |
| `npm run typecheck` | Exit 0 |
| `npm run test:core` without private configuration | 35 passed, 4 explicit live/DB/browser skips |
| `node --env-file="$config/core-test.env" --import tsx --test 'tests/core/**/*.test.ts'` with `GONGZHI_TEST_DATABASE_ENV=$config/core-test.env` | 70 passed, 0 failed, 1 browser test skipped (run separately) |
| Real GoTrue subset `tests/core/live-auth.test.ts` | 9 passed: login/getUser, forged/unbound rejection, limited enrollment, owner/speaker, REST/MCP idempotency and scope, stale adoption, real reply evidence, current human adoption, revocation/history |
| Existing two PG suites | 26 passed; **these retain explicit Auth stubs** and do not substitute for the GoTrue subset |
| `node --env-file="$config/scratch.env" scripts/check-migrations.mjs` | 12 actual migrations, upstream eight SQL files twice, second runner pass no-op, immutable/RLS/scopes checks passed |
| `npm audit --json` after scoped Next→PostCSS 8.5.28 override | 0 findings; Next remains 15.5.25; other version changes limited to equal-version PostCSS/nanoid deduplication |
| `docker build -t gongzhi-core:live-20260914 .` | Exit 0, clean `npm ci`, audit 0 and actual `npm run build` inside image; no secrets or migration execution |
| `GONGZHI_BROWSER_TEST_URL=http://127.0.0.1:3041` plus `node --env-file="$config/core-test.env" --import tsx --test tests/core/browser-client-live.test.ts` | 1 passed using installed Chrome: actual ESM, GoTrue login, authenticated container HTTP, reload/session restore, local logout, demo refusal and compiled light/dark CSS |
| Container inspection | UID 1001; healthy process check; image `sha256:b74bcb07aa2add57d6d834666ed8361bebf42cca96a4552fbc1223c04a504183` |

`$config` is the Git-external, current-user-only directory `$env:LOCALAPPDATA/gongzhi/local-auth-20260914-core`. `runtime.env` is the application-only configuration; `accounts.env` holds reserved-domain account credentials; `compose.env` is container bootstrap; `admin.env` is migration/Auth administration; `core-test.env`, `scratch.env` and `container-core.env` target the separated test databases. Paths and variable names were handed to I; values were not sent or logged. No repository `.env` was created. The PostCSS lock update used `--package-lock-only --ignore-scripts`; current host `node_modules` stayed on its original PostCSS so old previews were not mutated, while the clean image installed the patched dependency.

Retained local resources: project `gongzhi-live-20260914`, PG on loopback 56520, official GoTrue v2.196.0 behind SDK base `http://127.0.0.1:56521`, persistent named volume `gongzhi-live-20260914_pg-data`; C image check on 3041 uses `gongzhi_core_test`. The experience database `gongzhi` and integrated 3039 application were explicitly handed to I. The old database on 56406 and services on 8123/3019/3029 were preserved. Auth has no outbound network, signup is disabled, and test accounts were created through official Auth admin APIs without email.

Failures reproduced and repaired: Docker Desktop initially did not publish ports for internal-network-only PG, so host access was added only to PG/proxy; browser preflight initially omitted CORS headers despite successful Node login, so exact loopback origins were allowlisted and verified in Chrome; container PG initially attempted TLS against local non-TLS PG, so an explicit Docker-host-only option was added with a regression check that all other remote hostnames still require TLS. Missing Playwright-managed Chromium was resolved by using the installed Chrome channel. These earlier failures were not reported as live passes.

Actual participation, separately from automated tests: at the coordinator's explicit handoff, this same C worker registered through D's existing CLI as Agent B `06ee873a-62e2-4961-b7e2-afdd092f4096` using its independently issued `read/discuss/submit_result` grant. It personally read real board/need/thread `3egLqSKA` v1 and Agent A's `dqcieJoY`, then independently authored reply `MQ3zwSss` targeting that record and result `UQi87nTD`. Both were reread through the CLI and checked for the B speaker, original human owner, thread and live mode. Drafts and private receipts remain under the assigned `integration-20260914-c` directory; no human/admin token or paid provider was used for those Agent actions. Receipt IDs were handed to M/I/D; human adoption belongs to I and is not claimed by C here.

Remaining acceptance: I must merge the final source and verify its own `/agent-skill.md` route and D's document inside the final image (C's isolated branch has neither file), product-page workflows, actual Agent record display/adoption and integrated persistence. C's application container was recreated while existing accounts/bindings remained usable; **PG/Auth restart and backup/restore acceptance were not performed by C** because I held the shared environment. No production platform/domain/TLS, cloud Auth, real mail or external model/Zhihu runtime configuration was supplied or deployed. Builds/startup remain migration-free and the production migration guard remains enabled; a real deployment and its migration/recovery procedure need the actual authorized environment.
