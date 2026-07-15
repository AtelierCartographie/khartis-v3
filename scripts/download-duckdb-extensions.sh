#!/bin/bash
# Download DuckDB WASM extensions for local bundling
# This script automatically detects the DuckDB core version from the WASM binary
# and downloads matching extensions for offline PWA support.
#
# How it works:
# - The WASM binary embeds the DuckDB core version (e.g., "v1.4.3")
# - DuckDB constructs extension URLs using this version
# - This script extracts it and downloads matching extensions from the CDN
#
# Usage:
#   pnpm download:extensions        # Manual download
#   pnpm install                    # Auto-runs via postinstall hook

set -e

EXTENSIONS=("spatial" "httpfs" "parquet" "json")
PLATFORMS=("wasm_eh" "wasm_mvp")
BASE_URL="https://extensions.duckdb.org"
OUTPUT_DIR="static/duckdb-extensions"

# Detect DuckDB core version from the WASM binary
detect_duckdb_version() {
  local wasm_pkg_dir
  wasm_pkg_dir=$(node -p "const m = require.resolve('@duckdb/duckdb-wasm'); const i = m.lastIndexOf('node_modules/@duckdb/duckdb-wasm'); m.substring(0, i) + 'node_modules/@duckdb/duckdb-wasm'")

  if [ -z "$wasm_pkg_dir" ]; then
    echo "Error: @duckdb/duckdb-wasm not found. Run 'pnpm install' first."
    exit 1
  fi

  # Try EH binary first, then COI, then MVP
  local wasm_binary=""
  for candidate in "dist/duckdb-eh.wasm" "dist/duckdb-coi.wasm" "dist/duckdb-mvp.wasm"; do
    if [ -f "$wasm_pkg_dir/$candidate" ]; then
      wasm_binary="$wasm_pkg_dir/$candidate"
      break
    fi
  done

  if [ -z "$wasm_binary" ]; then
    echo "Error: No WASM binary found in $wasm_pkg_dir/dist/"
    exit 1
  fi

  # Extract the DuckDB core version from the binary
  # The WASM binary contains all historical DuckDB versions (extension compatibility matrix).
  # The core version is the highest one.
  local core_version
  core_version=$(strings "$wasm_binary" | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | sort -V | uniq | tail -1)

  if [ -z "$core_version" ]; then
    echo "Error: Could not extract DuckDB core version from $wasm_binary"
    exit 1
  fi

  echo "$core_version"
}

# Check if extensions already exist for this version
check_existing() {
  local version=$1

  for platform in "${PLATFORMS[@]}"; do
    local dir="$OUTPUT_DIR/$version/$platform"

    if [ ! -d "$dir" ]; then
      return 1
    fi

    local count
    count=$(find "$dir" -maxdepth 1 -name '*.wasm' | wc -l | tr -d ' ')
    if [ "$count" -ne "${#EXTENSIONS[@]}" ]; then
      return 1
    fi
  done

  return 0
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
  local test_url="$BASE_URL/$version/${PLATFORMS[0]}/${EXTENSIONS[0]}.duckdb_extension.wasm"
  curl -s -f -I "$test_url" > /dev/null 2>&1
}

# Main
DETECTED_VERSION=$(detect_duckdb_version)
echo "Detected DuckDB core version: $DETECTED_VERSION (extracted from WASM binary)"

# Check CDN availability
echo "Checking extension availability on CDN..."
if ! check_version_available "$DETECTED_VERSION"; then
  echo ""
  echo "ERROR: Extensions for $DETECTED_VERSION are not available on the CDN."
  echo "URL checked: $BASE_URL/$DETECTED_VERSION/${PLATFORMS[0]}/${EXTENSIONS[0]}.duckdb_extension.wasm"
  echo ""
  echo "This usually means DuckDB hasn't published extensions for this version yet."
  echo "Check: https://extensions.duckdb.org"
  exit 1
fi
echo "  $DETECTED_VERSION available"

# Check if already downloaded
if check_existing "$DETECTED_VERSION"; then
  echo "Extensions already up-to-date for $DETECTED_VERSION"
  for platform in "${PLATFORMS[@]}"; do
    echo "Location: $OUTPUT_DIR/$DETECTED_VERSION/$platform/"
  done
  exit 0
fi

echo "Downloading DuckDB extensions for version $DETECTED_VERSION..."

# Clean up old versions
cleanup_old_versions "$DETECTED_VERSION"

for platform in "${PLATFORMS[@]}"; do
  mkdir -p "$OUTPUT_DIR/$DETECTED_VERSION/$platform"

  for ext in "${EXTENSIONS[@]}"; do
    OUTPUT_FILE="$OUTPUT_DIR/$DETECTED_VERSION/$platform/$ext.duckdb_extension.wasm"
    URL="$BASE_URL/$DETECTED_VERSION/$platform/$ext.duckdb_extension.wasm"

    echo "Downloading $ext extension for $platform..."
    if curl -f -s -o "$OUTPUT_FILE" "$URL"; then
      SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
      echo "  $ext ($platform) downloaded ($SIZE)"
    else
      echo "  Failed to download $ext from $URL"
      echo "  This is unexpected since version was verified. Check your connection."
      exit 1
    fi
  done
done

# Print summary
echo ""
echo "Extensions downloaded to:"
for platform in "${PLATFORMS[@]}"; do
  echo "  $OUTPUT_DIR/$DETECTED_VERSION/$platform/"
done
echo ""
for platform in "${PLATFORMS[@]}"; do
  du -h "$OUTPUT_DIR/$DETECTED_VERSION/$platform/"*
done
echo ""
echo "Total size:"
du -sh "$OUTPUT_DIR/$DETECTED_VERSION"
