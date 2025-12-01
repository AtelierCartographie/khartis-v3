#!/bin/bash
# Download DuckDB WASM extensions for local bundling
# This script downloads extensions from the official DuckDB extension server
# and stores them locally for offline PWA support.

set -e

DUCKDB_VERSION="v1.4.0"
EXTENSIONS=("spatial" "httpfs" "parquet")
PLATFORM="wasm_eh"
BASE_URL="https://extensions.duckdb.org"
OUTPUT_DIR="static/duckdb-extensions"

echo "Downloading DuckDB extensions for version $DUCKDB_VERSION..."

# Create output directory
mkdir -p "$OUTPUT_DIR/$DUCKDB_VERSION/$PLATFORM"

# Download each extension
for ext in "${EXTENSIONS[@]}"; do
  OUTPUT_FILE="$OUTPUT_DIR/$DUCKDB_VERSION/$PLATFORM/$ext.duckdb_extension.wasm"
  URL="$BASE_URL/$DUCKDB_VERSION/$PLATFORM/$ext.duckdb_extension.wasm"

  echo "Downloading $ext extension..."
  if curl -f -o "$OUTPUT_FILE" "$URL"; then
    SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
    echo "  ✓ $ext downloaded ($SIZE)"
  else
    echo "  ✗ Failed to download $ext"
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
