#!/bin/bash

# =============================================================================
# Khartis Deployment Script
# =============================================================================
# Usage:
#   ./scripts/deploy.sh pprd    # Deploy to pre-production
#   ./scripts/deploy.sh prd     # Deploy to production
#
# Prerequisites:
#   - VPN connection active
#   - lftp installed (brew install lftp)
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SFTP_SERVER="cdnscp.reims.sciences-po.fr"
SFTP_USER="khartis_upload"

# Check arguments
if [ -z "$1" ]; then
    echo -e "${RED}Error: Environment required${NC}"
    echo "Usage: ./scripts/deploy.sh [pprd|prd]"
    exit 1
fi

ENV=$1

case $ENV in
    pprd)
        BASE_PATH="/cartographie/khartisnewpprd"
        REMOTE_DIR="/khartis_upload/html/pprd/"
        ENV_NAME="Pre-Production (PPRD)"
        ;;
    prd)
        BASE_PATH="/cartographie/khartisnewprd"
        REMOTE_DIR="/khartis_upload/html/prd/"
        ENV_NAME="Production (PRD)"
        ;;
    *)
        echo -e "${RED}Error: Invalid environment '$ENV'${NC}"
        echo "Valid options: pprd, prd"
        exit 1
        ;;
esac

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Khartis Deployment - $ENV_NAME${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if lftp is installed
if ! command -v lftp &> /dev/null; then
    echo -e "${RED}Error: lftp is not installed${NC}"
    echo "Install with: brew install lftp"
    exit 1
fi

# Check VPN (try to ping the server)
echo -e "${YELLOW}[1/5] Checking VPN connection...${NC}"
if ! ping -c 1 -W 3 $SFTP_SERVER &> /dev/null; then
    echo -e "${RED}Error: Cannot reach $SFTP_SERVER${NC}"
    echo "Please connect to VPN first!"
    exit 1
fi
echo -e "${GREEN}✓ VPN connected${NC}"

# Run checks
echo -e "${YELLOW}[2/5] Running checks...${NC}"
yarn check
echo -e "${GREEN}✓ Svelte check passed${NC}"

# Build
echo -e "${YELLOW}[3/5] Building for $ENV_NAME...${NC}"
echo "  BASE_PATH=$BASE_PATH"
BASE_PATH=$BASE_PATH yarn build
echo -e "${GREEN}✓ Build complete${NC}"

# Ask for SFTP password
echo ""
echo -e "${YELLOW}[4/5] SFTP Deployment${NC}"
echo -n "Enter SFTP password for $SFTP_USER: "
read -s SFTP_PASSWORD
echo ""

# Deploy via SFTP
echo -e "${YELLOW}[5/5] Uploading to $REMOTE_DIR...${NC}"

lftp -u "$SFTP_USER,$SFTP_PASSWORD" sftp://$SFTP_SERVER << EOF
set ssl:verify-certificate no
set sftp:auto-confirm yes
mirror --reverse --delete --verbose build/ $REMOTE_DIR
bye
EOF

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✓ Deployment complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "URL: https://www.sciencespo.fr$BASE_PATH/"
