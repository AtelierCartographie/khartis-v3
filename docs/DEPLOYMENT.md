# Local PPRD and PROD Deployment

This repository is open source. Keep all institution-specific values, usernames,
passwords, hostnames, remote paths, and host fingerprints out of committed files.

The `staging` branch is the PPRD environment: its semantic prereleases are tagged
`vX.Y.Z-pprd.N` (older `vX.Y.Z-staging.N` tags are still accepted). Stable releases
tagged `vX.Y.Z` are the PROD environment. The helper supports both PPRD and PROD.

## What The Script Does

`pnpm deploy:pprd`:

1. Loads local environment values from `.env` and `.env.deploy.local`.
2. Fetches Git tags and reads the release-tag list directly from `origin`.
3. Selects the latest semantic pprd prerelease matching `vX.Y.Z-pprd.N` (or the
   legacy `vX.Y.Z-staging.N`), ordered by `X.Y.Z` and then `N`.
4. Verifies that the local tag and remote tag resolve to the same commit, then
   verifies that `release.yml` completed successfully for that exact commit on
   `staging` for PPRD or `main` for PROD.
5. Builds the verified commit SHA, not the mutable tag name, in a temporary
   detached worktree.
6. Copies the generated `build/` directory to a local temporary upload snapshot.
7. Runs a read-only HTTP infrastructure preflight before reading SFTP
   authentication material or opening a connection. When a release is already public, the
   helper checks the canonical HTML, base path, mutable assets, cache policy,
   critical JavaScript and CSS MIME and immutable public cache policies,
   slashless redirect, and every configured backend. Only an explicit
   non-cached 404 on the exact canonical URL is accepted as a first deployment.
   This preflight does not require the
   selected tag or its new WASM asset to be public yet.
8. Connects to SFTP only after the checks pass.
9. Acquires an atomic target-specific remote deployment lock. A second
   deployment stops before upload while this lock exists. After acquiring the
   lock, the helper rechecks that the remote tag still targets the built SHA and
   that this SHA still belongs to the target release branch.
10. Removes stale temporary directories left by previous interrupted deployments,
    showing progress while remote entries are deleted.
11. Uploads the snapshot to a temporary remote sibling directory, showing a live
    progress bar with the percentage, the number of files left, and an ETA.
12. Copies into that snapshot the missing `_app/immutable` assets belonging to
    the immediately previous release, using its release asset manifest.
13. Swaps the temporary directory into place with two quick renames, so the
    site is unavailable only for a fraction of a second.
14. Verifies the complete public contract independently on every configured
    load-balancer backend. A routing cookie pins each request and a public
    backend identity header must confirm which backend answered. The canonical
    HTML must use
    the build base path and `Cache-Control: no-store`; one module and stylesheet
    must have valid MIME types and `public`, positive `max-age`, `immutable`
    caching without `private`, `no-store`, or `no-cache`; `_app/version.json` must serve the
    selected tag;
    `sw.js` and `manifest.webmanifest` must have valid MIME and no-store
    headers; a missing hashed asset must return a non-immutable no-store 404;
    and a representative build-generated WASM URL must be served with Brotli or
    gzip plus `Vary: Accept-Encoding`. A non-root slashless URL must return a
    canonical 301 or 308 redirect.
15. Removes the previous remote version only after every backend passes. If the
    swap or public-route validation fails, the script restores the previous
    version and stops without printing `Deployment complete.`. If no previous
    version exists, a failed first deployment is taken back offline. SIGINT and
    SIGTERM are deferred after remote mutation starts until the new release is
    validated or the previous release is safely restored.

`pnpm deploy:pprd:dry-run` performs the same tag, CI, install, build, and local
artifact checks, but skips SFTP and live public HTTP validation entirely.

## Commands

```bash
pnpm deploy:pprd:dry-run
pnpm deploy:pprd
```

By default the latest pprd prerelease is deployed. To deploy an older release,
for example to roll back, pass its tag explicitly:

```bash
pnpm deploy:pprd:dry-run -- --tag vX.Y.Z-pprd.N
pnpm deploy:pprd -- --tag vX.Y.Z-pprd.N
```

If the currently deployed release predates
`.khartis-release-assets.json`, run exactly one compatibility deployment:

```bash
pnpm deploy:pprd -- --migrate-legacy-assets
```

The option explicitly scans only the previous release's `_app/immutable`
directory, capped at 2,000 files and 512 MB. The uploaded release then carries
its own manifest, so subsequent deployments must run without this option.

If a previous process stopped without releasing its target lock, first confirm
that no deployment is active, then recover it explicitly:

```bash
pnpm deploy:pprd -- --recover-stale-lock
```

The helper never removes an existing deployment lock automatically.

## PROD

`pnpm deploy:prod` deploys the latest stable `vX.Y.Z` release to PROD. It runs the
same tag, CI, install, and build checks, requires a green `release.yml` run, and
asks you to retype the tag before uploading. Use `pnpm deploy:prod:dry-run` to
validate without SFTP. PROD uploads to the `html/prod` remote directory. The GTM
analytics container is per target (`KHARTIS_GTM_CONTAINER_ID_PROD`); pprd leaves
`KHARTIS_GTM_CONTAINER_ID_PPRD` empty and ships without analytics.

Each target has one required public URL. The helper derives SvelteKit `BASE_PATH`
from that URL, so PPRD and PROD can use different routes without maintaining a
second path setting. Provide the canonical URL with or without its trailing
slash; the helper normalizes it to the trailing-slash form.

## Required Local Environment

Use `.env` or `.env.deploy.local`. Both files are ignored by Git. Keep real
values local to the deployer's workstation.

```dotenv
KHARTIS_PUBLIC_URL_PPRD=
KHARTIS_PUBLIC_URL_PROD=
KHARTIS_SFTP_HOST=
KHARTIS_SFTP_HOST_FINGERPRINT_SHA256=
KHARTIS_SFTP_USER=
KHARTIS_SFTP_REMOTE_DIR_PPRD=
KHARTIS_SFTP_REMOTE_DIR_PROD=
KHARTIS_GTM_CONTAINER_ID_PPRD=
KHARTIS_GTM_CONTAINER_ID_PROD=
KHARTIS_HTTP_ROUTING_COOKIE_NAME=
KHARTIS_HTTP_BACKEND_HEADER_NAME=
KHARTIS_HTTP_ROUTING_BACKENDS_PPRD=
KHARTIS_HTTP_ROUTING_BACKENDS_PROD=
```

Public URLs must be absolute HTTPS URLs without credentials, query strings, or
fragments. A static SvelteKit artifact has one base path. If several public
aliases are required, configure the infrastructure to redirect them to the one
canonical URL rather than serving the same artifact under several visible
paths.

`KHARTIS_HTTP_ROUTING_BACKENDS_PPRD` and
`KHARTIS_HTTP_ROUTING_BACKENDS_PROD` are comma-separated routing-cookie values.
For each value, the helper sends
`<KHARTIS_HTTP_ROUTING_COOKIE_NAME>=<backend>` and requires the same backend
identifier in `KHARTIS_HTTP_BACKEND_HEADER_NAME`. Keep real backend identifiers
in ignored local files.

Authentication is supplied at runtime. Prefer the masked password prompt:

```dotenv
KHARTIS_SFTP_PASSWORD=
```

If key authentication is available locally, use:

```dotenv
KHARTIS_SFTP_PRIVATE_KEY_PATH=
KHARTIS_SFTP_PASSPHRASE=
```

Do not commit any populated authentication value.

## Host Fingerprint

`KHARTIS_SFTP_HOST_FINGERPRINT_SHA256` is mandatory for real uploads. It prevents
the script from accepting an unexpected SFTP server key.

The safest source is the official infrastructure team. If you inspect the key
from your workstation, use it only to compare against a trusted value:

```bash
ssh-keyscan -p 22 "$KHARTIS_SFTP_HOST" 2>/dev/null | ssh-keygen -lf - -E sha256
```

Store only the `SHA256:...` fingerprint value locally. If the server exposes
multiple host keys, store the accepted fingerprints as a comma-separated list.

## Safety Rules

- Real uploads require a release tag present on `origin`, the same local and
  remote commit SHA, and a successful `release.yml` push run on the target
  release branch. Tag and branch provenance are revalidated after the remote
  lock is acquired and immediately before remote mutation starts.
- Before reading SFTP credentials, real deployments run a read-only public
  infrastructure preflight on every configured backend. Only an exact
  `Cache-Control: no-store` canonical 404 is treated as a first deployment;
  other HTTP failures stop the run before SFTP.
- Real uploads require a valid SFTP host fingerprint.
- The PPRD remote directory must end with `html/pprd`; the PROD remote directory
  must end with `html/prod`.
- The script refuses broad or unsafe remote paths such as `/`, `.`, `..`, or
  paths containing backslashes or control characters.
- The script uses `ssh2-sftp-client` with host-key verification enabled.
- The dry-run command never opens an SFTP connection.
- Every build is rejected if `index.html` or `manifest.webmanifest` does not
  match the base path derived from the target public URL.
- Critical hashed JavaScript and CSS assets must use `Cache-Control: public`
  with a positive `max-age` and `immutable`, without contradictory `private` or
  `no-store` directives.
- A real deployment is rolled back if its HTML, selected version, service
  worker, manifest, cache headers, representative WASM compression, or hashed
  404 policy violate the public contract on any configured backend.
- Every real deployment acquires an atomic target-specific remote lock. An
  existing lock blocks the run unless the operator explicitly uses
  `--recover-stale-lock` after confirming no other deployment is active.
- A non-root slashless public URL must return a 301 or 308 redirect to the exact
  canonical HTTPS URL. Serving HTML directly, temporary redirects, HTTP
  locations, and redirects to another route are rejected.
- Real uploads use a temporary remote directory first, then swap it into place
  with fast renames. The previous version is removed only after the swap; if
  the swap fails, the previous version is restored.
- The upload snapshot keeps the immutable assets listed by the previous
  release's `.khartis-release-assets.json`. The manifest contains only the
  assets built by that release, which limits retention to one previous
  generation.
- A missing or corrupt previous manifest stops the deployment by default. The
  one-time `--migrate-legacy-assets` option enables a bounded legacy scan;
  without that explicit option the script never falls back to rescanning remote
  generations.
- A failure while retaining an old asset stops the deployment before the
  public swap.
- Once the public swap begins, an interruption is honored only after public
  validation succeeds or rollback restores a safe state.

## Recommended Flow

1. Connect to the required institutional VPN.
2. Fill local `.env` or `.env.deploy.local` with PPRD values.
3. Run:

   ```bash
   pnpm deploy:pprd:dry-run
   ```

4. If the dry-run succeeds, run:

   ```bash
   pnpm deploy:pprd
   ```

   Add `-- --migrate-legacy-assets` only if this is the documented one-time
   transition from a release without a valid asset manifest.

5. Check the tag shown by the confirmation prompt, then answer `y`. If the tag
   is not the one you want, answer `n` and re-run with `--tag`.
6. Enter the SFTP password when prompted.

## Deployment Window

The remote swap replaces the whole PPRD directory in two quick renames, so the
site is unavailable only for a fraction of a second. The new artifact also
contains the missing hashed assets from the immediately previous release.
Visitors with an already open session can therefore finish loading their old
lazy chunks during the update transition. A low-traffic window remains
recommended for the first deployment using this retention mechanism.
