---
paths:
  - 'scripts/deploy-local.*'
  - 'tests/pipeline/deploy-local.test.ts'
  - 'docs/DEPLOYMENT.md'
  - 'docs/ANALYTICS.md'
  - '.env.example'
  - '.github/workflows/**'
  - 'src/lib/features/commons/services/analytics.service.ts'
  - 'src/lib/features/commons/services/cookiebot-consent.service.ts'
  - 'src/lib/features/commons/components/cookiebot-consent.svelte'
---

# Deployment, analytics consent and secrets

## Deployment helper

`scripts/deploy-local.mjs` (through `deploy-local.sh`) deploys the latest release tag to PPRD or PROD over SFTP. `pnpm deploy:pprd` takes the latest `pprd` prerelease, `pnpm deploy:prod` the latest stable `v*.*.*` tag. Its behavior is covered by `tests/pipeline/deploy-local.test.ts`.

- The safeguards are the point of the script, so a change keeps all of them: the tag retyped by hand for PROD (even with `--yes`), the green release-workflow gate, SSH host-key verification, the atomic remote swap, the public-route validation after the swap, and the rollback.
- The release gate looks up the successful run of the `release.yml` workflow for the tag commit (`RELEASE_WORKFLOW` in the script). That run succeeds only when the tree was validated, in this run or an earlier one, and the release was published. Renaming the workflow file or moving the release out of it breaks the gate, so both change together.
- `KHARTIS_PUBLIC_URL_<TARGET>` is the source of truth for the SvelteKit base path of a target. A static build has one canonical public route; infrastructure aliases redirect to it.
- A maintainer runs the real deployment. The `:dry-run` variants validate the release, the CI gate and the build without opening an SFTP session.

## CI workflows

- `validate.yml` is the single definition of the checks: lint, types, unit tests, engine tests and build, as five parallel legs of one matrix. `pr-validation.yml` and `release.yml` call it.
- A git tree is validated once. Each successful check uploads a `validated-tree-<tree sha>-<check id>` artifact, and later runs on the same tree (the merge push, the promotion pull request, the push to `main`) that find all five skip the checks. The list of ids in the lookup step and the matrix stay in sync. The lookup trusts only artifacts produced by this repository and falls back to a full validation on any failure: keep both properties.
- The job named `Quality Checks` in `pr-validation.yml` is the status check the branch rulesets require.
- The checks use a sparse checkout without the basemap geometries (`static/basemaps/**/*.parquet`), and without the shapefile and GeoPackage fixtures except for the engine tests. A check that needs one of those files gets it by adjusting the `SPARSE_*` patterns.
- The CI build sets `KHARTIS_SKIP_PRECOMPRESS=true` because its output is never deployed. A deployed build keeps the Brotli and gzip sidecars, which `deploy-local.mjs` requires.

## Secrets

SFTP hosts, users, remote paths, fingerprints, passwords, private keys, VPN details and GitLab credentials live in ignored env files or in the maintainer's shell, under `KHARTIS_*` names. `.env.example` and `docs/DEPLOYMENT.md` stay public-safe: placeholders, commands and guardrails only, never an institution-specific value.

## Analytics consent

Cookiebot owns analytics consent. Khartis reads `Cookiebot.consent.statistics` and can open `Cookiebot.renew()`; it does not store a second consent state, emit Consent Mode commands, or manage analytics cookies. GTM loads independently, and only Khartis custom events are gated on consent. Events stay anonymous: no data values, no column, place or file names, no counts derived from user content. See `docs/ANALYTICS.md`.
