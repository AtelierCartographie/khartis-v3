# Deployment Guide

> **Deployment workflow for Khartis to Sciences Po servers**

## Overview

Khartis is deployed to Sciences Po servers via SFTP. The deployment server is behind a VPN, which requires **local deployment** rather than automated CI/CD.

### Environments

| Environment      | BASE_PATH                     | URL                                                    |
| ---------------- | ----------------------------- | ------------------------------------------------------ |
| **Local**        | (empty)                       | `http://localhost:5176/`                               |
| **Pre-prod**     | `/cartographie/khartisnewpprd` | `https://www.sciencespo.fr/cartographie/khartisnewpprd/` |
| **Production**   | `/cartographie/khartisnewprd`  | `https://www.sciencespo.fr/cartographie/khartisnewprd/`  |

## Prerequisites

### 1. VPN Connection

The SFTP server (`cdnscp.reims.sciences-po.fr`) is only accessible via Sciences Po VPN.

### 2. lftp Installation

The deploy script uses `lftp` for SFTP transfers:

```bash
# macOS
brew install lftp

# Ubuntu/Debian
sudo apt-get install lftp
```

### 3. SFTP Credentials

Contact Sciences Po IT for SFTP credentials. The user is `khartis_upload`.

## Deployment Process

### Using the Deploy Script

```bash
# Deploy to pre-production
./scripts/deploy.sh pprd

# Deploy to production
./scripts/deploy.sh prd
```

### What the Script Does

1. **VPN Check** - Verifies connectivity to SFTP server
2. **Svelte Check** - Runs type checking (`yarn check`)
3. **Build** - Builds with correct `BASE_PATH`
4. **Upload** - Mirrors `build/` folder to remote server

### Manual Deployment

If you need to deploy manually:

```bash
# 1. Build for pre-production
BASE_PATH=/cartographie/khartisnewpprd yarn build

# 2. Build for production
BASE_PATH=/cartographie/khartisnewprd yarn build

# 3. Upload build/ folder via FileZilla or lftp
# Server: cdnscp.reims.sciences-po.fr
# User: khartis_upload
# Remote path (pprd): /khartis_upload/html/pprd/
# Remote path (prd): /khartis_upload/html/prd/
```

## CI/CD Pipeline

GitHub Actions runs CI checks on push to `develop` (pre-release) and `main` (release):

| Job                  | Description                    |
| -------------------- | ------------------------------ |
| `dependency-setup`   | Install and cache dependencies |
| `unit-tests`         | Run Vitest unit tests          |
| `svelte-check`       | Run Svelte type checking       |
| `e2e-tests`          | Run Playwright E2E tests       |
| `semantic-versioning`| Generate version tags          |

**Note**: CI does not deploy automatically because the server requires VPN access.

## Workflow

### Pre-production Deployment

1. Push changes to `develop` branch
2. CI runs all checks automatically
3. Connect to VPN
4. Run `./scripts/deploy.sh pprd`
5. Verify at `https://www.sciencespo.fr/cartographie/khartisnewpprd/`

### Production Deployment

1. Merge `develop` into `main`
2. CI runs all checks + semantic versioning
3. Connect to VPN
4. Run `./scripts/deploy.sh prd`
5. Verify at `https://www.sciencespo.fr/cartographie/khartisnewprd/`

## Environment Variables

### Local Development

The `.env` file configures local development:

```bash
BASE_PATH=              # Empty for localhost
VITE_DEBUG=true
VITE_LOG_CATEGORIES=all
VITE_LOG_LEVEL=DEBUG
```

### Build-time Configuration

`BASE_PATH` is set at build time:

```bash
# Via environment variable
BASE_PATH=/cartographie/khartisnewpprd yarn build

# Or the deploy script sets it automatically
./scripts/deploy.sh pprd
```

## Troubleshooting

### Cannot Reach SFTP Server

```
Error: Cannot reach cdnscp.reims.sciences-po.fr
```

**Solution**: Connect to Sciences Po VPN first.

### lftp Not Found

```
Error: lftp is not installed
```

**Solution**: Install lftp (`brew install lftp` on macOS).

### Svelte Check Fails

```
Error: Svelte check failed
```

**Solution**: Fix TypeScript errors before deploying. Run `yarn check` locally to see issues.

### Wrong BASE_PATH

If assets return 404 errors after deployment:

1. Verify `BASE_PATH` matches the deployment environment
2. Rebuild with correct `BASE_PATH`
3. Re-upload to server

## Server Details

| Setting     | Value                           |
| ----------- | ------------------------------- |
| Protocol    | SFTP                            |
| Server      | `cdnscp.reims.sciences-po.fr`   |
| User        | `khartis_upload`                |
| PPRD Path   | `/khartis_upload/html/pprd/`    |
| PRD Path    | `/khartis_upload/html/prd/`     |

---

**Last Updated**: 2025-11-28
