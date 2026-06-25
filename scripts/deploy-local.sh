#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

if [ ! -f "$REPO_ROOT/package.json" ]; then
  echo "Error: package.json not found from $REPO_ROOT" >&2
  exit 1
fi

if [ ! -d "$REPO_ROOT/node_modules" ]; then
  echo "Error: node_modules is missing. Run 'pnpm install' first." >&2
  exit 1
fi

exec node "$REPO_ROOT/scripts/deploy-local.mjs" "$@"
