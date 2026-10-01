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
- The release gate looks up the successful run of the `release.yml` workflow for the tag commit (`RELEASE_WORKFLOW` in the script). Renaming, splitting or restructuring that workflow breaks the gate, so both change together.
- `KHARTIS_PUBLIC_URL_<TARGET>` is the source of truth for the SvelteKit base path of a target. A static build has one canonical public route; infrastructure aliases redirect to it.
- A maintainer runs the real deployment. The `:dry-run` variants validate the release, the CI gate and the build without opening an SFTP session.

## Secrets

SFTP hosts, users, remote paths, fingerprints, passwords, private keys, VPN details and GitLab credentials live in ignored env files or in the maintainer's shell, under `KHARTIS_*` names. `.env.example` and `docs/DEPLOYMENT.md` stay public-safe: placeholders, commands and guardrails only, never an institution-specific value.

## Analytics consent

Cookiebot owns analytics consent. Khartis reads `Cookiebot.consent.statistics` and can open `Cookiebot.renew()`; it does not store a second consent state, emit Consent Mode commands, or manage analytics cookies. GTM loads independently, and only Khartis custom events are gated on consent. Events stay anonymous: no data values, no column, place or file names, no counts derived from user content. See `docs/ANALYTICS.md`.
