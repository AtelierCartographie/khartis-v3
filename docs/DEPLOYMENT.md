# Local PPRD and PROD Deployment

This repository is open source. Keep all institution-specific values, usernames,
passwords, hostnames, remote paths, and host fingerprints out of committed files.

The `staging` branch is the PPRD environment: its semantic prereleases are tagged
`vX.Y.Z-pprd.N` (older `vX.Y.Z-staging.N` tags are still accepted). Stable releases
tagged `vX.Y.Z` are the PROD environment. The helper supports both PPRD and PROD.

## What The Script Does

`pnpm deploy:pprd`:

1. Loads local environment values from `.env` and `.env.deploy.local`.
2. Fetches Git tags from `origin`.
3. Selects the latest semantic pprd prerelease matching `vX.Y.Z-pprd.N` (or the
   legacy `vX.Y.Z-staging.N`), ordered by `X.Y.Z` and then `N`.
4. Verifies that `release.yml` completed successfully for that tag commit.
5. Builds the tagged version in a temporary detached worktree.
6. Copies the generated `build/` directory to a local temporary upload snapshot.
7. Connects to SFTP only after the checks pass.
8. Removes stale temporary directories left by previous interrupted deployments,
   showing progress while remote entries are deleted.
9. Uploads the snapshot to a temporary remote sibling directory, showing a live
   progress bar with the percentage, the number of files left, and an ETA.
10. Swaps the temporary directory into place with two quick renames, so the
    site is unavailable only for a fraction of a second.
11. Removes the previous remote version after the swap, showing progress while
    remote entries are deleted. If the swap fails, the script restores the
    previous version instead.
12. Optionally checks the public PPRD URL with a timeout, then prints
    `Deployment complete.`.

`pnpm deploy:pprd:dry-run` performs the same tag, CI, install, and build checks,
but skips SFTP entirely.

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

## PROD

`pnpm deploy:prod` deploys the latest stable `vX.Y.Z` release to PROD. It runs the
same tag, CI, install, and build checks, requires a green `release.yml` run, and
asks you to retype the tag before uploading. Use `pnpm deploy:prod:dry-run` to
validate without SFTP. PROD uploads to the `html/prod` remote directory.

## Required Local Environment

Use `.env` or `.env.deploy.local`. Both files are ignored by Git. Keep real
values local to the deployer's workstation.

```dotenv
KHARTIS_BASE_PATH_PPRD=
KHARTIS_PUBLIC_URL_PPRD=
KHARTIS_SFTP_HOST=
KHARTIS_SFTP_HOST_FINGERPRINT_SHA256=
KHARTIS_SFTP_USER=
KHARTIS_SFTP_REMOTE_DIR_PPRD=
```

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

- Real uploads require a successful `release.yml` run for the selected tag.
- Real uploads require a valid SFTP host fingerprint.
- The remote directory must end with `html/pprd`.
- The script refuses broad or unsafe remote paths such as `/`, `.`, `..`, or
  paths containing backslashes or control characters.
- The script refuses PRD targets.
- The script uses `ssh2-sftp-client` with host-key verification enabled.
- The dry-run command never opens an SFTP connection.
- Real uploads use a temporary remote directory first, then swap it into place
  with fast renames. The previous version is removed only after the swap; if
  the swap fails, the previous version is restored.

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

5. Check the tag shown by the confirmation prompt, then answer `y`. If the tag
   is not the one you want, answer `n` and re-run with `--tag`.
6. Enter the SFTP password when prompted.

## Deployment Window

The remote swap replaces the whole PPRD directory in two quick renames, so the
site is unavailable only for a fraction of a second. However, the hashed assets
of the previous release disappear at that moment: visitors with an open session
may need to reload the page before lazy-loaded chunks resolve again. Prefer
low-traffic windows, for example at night, for extra safety.
