#!/bin/bash
# Download DuckDB WASM extensions for local bundling
# This script automatically detects the DuckDB version from node_modules
# and downloads matching extensions for offline PWA support.
#
# Usage:
#   yarn download:extensions        # Manual download
#   yarn install                    # Auto-runs via postinstall hook

set -e

EXTENSIONS=("spatial" "httpfs" "parquet")
PLATFORM="wasm_eh"
BASE_URL="https://extensions.duckdb.org"
OUTPUT_DIR="static/duckdb-extensions"

# Detect DuckDB version from node_modules
detect_duckdb_version() {
  local pkg_json="node_modules/@duckdb/duckdb-wasm/package.json"

  if [ ! -f "$pkg_json" ]; then
    echo "Error: @duckdb/duckdb-wasm not found. Run 'yarn install' first."
    exit 1
  fi

  # Extract version from package.json (e.g., "1.31.0" -> "v1.4.0")
  local wasm_version=$(node -p "require('./$pkg_json').version")

  # Map WASM package version to DuckDB core version
  # The WASM package version doesn't match the core version directly
  # We need to check the duckdb dependency or use a mapping
  local duckdb_version=$(node -p "
    const pkg = require('./$pkg_json');
    // Try to get from duckdb dependency or fall back to known mapping
    const wasmVersion = pkg.version;
    // Known mappings: 1.31.0 -> v1.4.0
    const versionMap = {
      '1.31.0': 'v1.4.0',
      '1.30.0': 'v1.3.0',
      '1.29.0': 'v1.2.0',
      '1.28.0': 'v1.1.0'
    };
    versionMap[wasmVersion] || 'v' + wasmVersion.split('.').slice(0, 2).join('.') + '.0';
  ")

  echo "$duckdb_version"
}

# Check if extensions already exist for this version
check_existing() {
  local version=$1
  local dir="$OUTPUT_DIR/$version/$PLATFORM"

  if [ -d "$dir" ]; then
    local count=$(ls -1 "$dir"/*.wasm 2>/dev/null | wc -l | tr -d ' ')
    if [ "$count" -eq "${#EXTENSIONS[@]}" ]; then
      return 0  # All extensions exist
    fi
  fi
  return 1  # Need to download
}

# Clean up old extension versions
cleanup_old_versions() {
  local current_version=$1

  if [ -d "$OUTPUT_DIR" ]; then
    for dir in "$OUTPUT_DIR"/v*; do
      if [ -d "$dir" ] && [ "$(basename "$dir")" != "$current_version" ]; then
        echo "Removing old extensions: $(basename "$dir")"
        rm -rf "$dir"
      fi
    done
  fi
}

# Main
DUCKDB_VERSION=$(detect_duckdb_version)
echo "Detected DuckDB version: $DUCKDB_VERSION (from @duckdb/duckdb-wasm)"

# Check if already downloaded
if check_existing "$DUCKDB_VERSION"; then
  echo "Extensions already up-to-date for $DUCKDB_VERSION"
  echo "Location: $OUTPUT_DIR/$DUCKDB_VERSION/$PLATFORM/"
  exit 0
fi

echo "Downloading DuckDB extensions for version $DUCKDB_VERSION..."

# Clean up old versions
cleanup_old_versions "$DUCKDB_VERSION"

# Create output directory
mkdir -p "$OUTPUT_DIR/$DUCKDB_VERSION/$PLATFORM"

# Download each extension
for ext in "${EXTENSIONS[@]}"; do
  OUTPUT_FILE="$OUTPUT_DIR/$DUCKDB_VERSION/$PLATFORM/$ext.duckdb_extension.wasm"
  URL="$BASE_URL/$DUCKDB_VERSION/$PLATFORM/$ext.duckdb_extension.wasm"

  echo "Downloading $ext extension..."
  if curl -f -s -o "$OUTPUT_FILE" "$URL"; then
    SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
    echo "  ✓ $ext downloaded ($SIZE)"
  else
    echo "  ✗ Failed to download $ext from $URL"
    echo "  Check if version $DUCKDB_VERSION is correct for your @duckdb/duckdb-wasm version"
    exit 1
  fi
done

# Print summary
echo ""
echo "Extensions downloaded to $OUTPUT_DIR/$DUCKDB_VERSION/$PLATFORM/"
echo ""
du -h "$OUTPUT_DIR/$DUCKDB_VERSION/$PLATFORM/"*
echo ""
echo "Total size:"
du -sh "$OUTPUT_DIR/$DUCKDB_VERSION/$PLATFORM/"
