#!/bin/bash
# Download DuckDB WASM extensions for local bundling
# This script automatically detects the DuckDB version from node_modules
# and downloads matching extensions for offline PWA support.
#
# Features:
# - Auto-detects DuckDB version from @duckdb/duckdb-wasm package
# - Falls back to known working versions if detected version is unavailable
# - Cleans up old extension versions automatically
#
# Usage:
#   pnpm download:extensions        # Manual download
#   pnpm install                    # Auto-runs via postinstall hook

set -e

EXTENSIONS=("spatial" "httpfs" "parquet")
PLATFORM="wasm_eh"
BASE_URL="https://extensions.duckdb.org"
OUTPUT_DIR="static/duckdb-extensions"

# Fallback versions to try if detected version is not available
# Listed in order of preference (newest first)
FALLBACK_VERSIONS=("v1.4.0" "v1.3.0" "v1.2.0" "v1.1.3" "v1.1.0")

# Detect DuckDB version from node_modules
detect_duckdb_version() {
  local pkg_json="node_modules/@duckdb/duckdb-wasm/package.json"

  if [ ! -f "$pkg_json" ]; then
    echo "Error: @duckdb/duckdb-wasm not found. Run 'pnpm install' first."
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

# Check if a version is available on the CDN
check_version_available() {
  local version=$1
  local test_url="$BASE_URL/$version/$PLATFORM/spatial.duckdb_extension.wasm"
  curl -s -f -I "$test_url" > /dev/null 2>&1
}

# Find an available version (detected or fallback)
# Sets AVAILABLE_VERSION global variable
find_available_version() {
  local detected_version=$1
  AVAILABLE_VERSION=""

  echo "Checking extension availability..."

  # Try detected version first
  if check_version_available "$detected_version"; then
    echo "  $detected_version available"
    AVAILABLE_VERSION="$detected_version"
    return 0
  else
    echo "  $detected_version not available"
  fi

  # Try fallback versions
  for version in "${FALLBACK_VERSIONS[@]}"; do
    if check_version_available "$version"; then
      echo "  $version available"
      AVAILABLE_VERSION="$version"
      return 0
    else
      echo "  $version not available"
    fi
  done

  return 1
}

# Main
DETECTED_VERSION=$(detect_duckdb_version)
echo "Detected DuckDB version: $DETECTED_VERSION (from @duckdb/duckdb-wasm)"

# Find available version (detected or fallback)
find_available_version "$DETECTED_VERSION"

if [ -z "$AVAILABLE_VERSION" ]; then
  echo ""
  echo "ERROR: No available extension version found."
  echo "Tried: $DETECTED_VERSION ${FALLBACK_VERSIONS[*]}"
  echo ""
  echo "Possible solutions:"
  echo "  1. Check your internet connection"
  echo "  2. Add a new fallback version to FALLBACK_VERSIONS in this script"
  echo "  3. Wait for DuckDB to publish extensions for $DETECTED_VERSION"
  exit 1
fi

# Show warning if using fallback
if [ "$AVAILABLE_VERSION" != "$DETECTED_VERSION" ]; then
  echo ""
  echo "Using fallback version $AVAILABLE_VERSION (detected: $DETECTED_VERSION)"
fi

# Check if already downloaded for the available version
if check_existing "$AVAILABLE_VERSION"; then
  echo "Extensions already up-to-date for $AVAILABLE_VERSION"
  echo "Location: $OUTPUT_DIR/$AVAILABLE_VERSION/$PLATFORM/"
  exit 0
fi

echo "Downloading DuckDB extensions for version $AVAILABLE_VERSION..."

# Clean up old versions
cleanup_old_versions "$AVAILABLE_VERSION"

# Create output directory
mkdir -p "$OUTPUT_DIR/$AVAILABLE_VERSION/$PLATFORM"

# Download each extension
for ext in "${EXTENSIONS[@]}"; do
  OUTPUT_FILE="$OUTPUT_DIR/$AVAILABLE_VERSION/$PLATFORM/$ext.duckdb_extension.wasm"
  URL="$BASE_URL/$AVAILABLE_VERSION/$PLATFORM/$ext.duckdb_extension.wasm"

  echo "Downloading $ext extension..."
  if curl -f -s -o "$OUTPUT_FILE" "$URL"; then
    SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
    echo "  $ext downloaded ($SIZE)"
  else
    echo "  Failed to download $ext from $URL"
    echo "  This is unexpected since version was verified. Check your connection."
    exit 1
  fi
done

# Print summary
echo ""
echo "Extensions downloaded to $OUTPUT_DIR/$AVAILABLE_VERSION/$PLATFORM/"
echo ""
du -h "$OUTPUT_DIR/$AVAILABLE_VERSION/$PLATFORM/"*
echo ""
echo "Total size:"
du -sh "$OUTPUT_DIR/$AVAILABLE_VERSION/$PLATFORM/"
