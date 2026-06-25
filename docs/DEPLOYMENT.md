# Local PPRD Deployment

This repository is open source. Keep all institution-specific values, usernames,
passwords, hostnames, remote paths, and host fingerprints out of committed files.

The local deployment helper is intentionally limited to PPRD. It does not support
PRD deployment.

## What The Script Does

`pnpm deploy:pprd`:

1. Loads local environment values from `.env` and `.env.deploy.local`.
2. Fetches Git tags from `origin`.
3. Selects the latest semantic staging tag matching `vX.Y.Z-staging.N`, ordered
   by `X.Y.Z` and then `N`.
4. Verifies that `release.yml` completed successfully for that tag commit.
5. Builds the tagged version in a temporary detached worktree.
6. Copies the generated `build/` directory to a local temporary upload snapshot.
7. Connects to SFTP only after the checks pass.
8. Uploads the snapshot to a temporary remote sibling directory.
9. Replaces the configured remote PPRD directory only after the upload completes.
10. Optionally checks the public PPRD URL.

`pnpm deploy:pprd:dry-run` performs the same tag, CI, install, and build checks,
but skips SFTP entirely.

## Commands

```bash
pnpm deploy:pprd:dry-run
pnpm deploy:pprd
```

For advanced use:

```bash
pnpm deploy:pprd:dry-run -- --tag vX.Y.Z-staging.N
pnpm deploy:pprd -- --tag vX.Y.Z-staging.N
```

PRD is intentionally unsupported by these commands.

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
- Real uploads use a temporary remote directory first, then replace PPRD after
  the upload completes.

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

5. Type the exact confirmation requested by the script.
6. Enter the SFTP password when prompted.

The script replaces the PPRD remote directory after the temporary upload
completes. Do not run the real deployment command unless the selected tag and
target are correct.
