---
paths:
  - 'src/lib/features/duckdb/**'
  - 'src/lib/features/data-pipeline/**'
  - 'src/lib/features/data-tab/**'
  - 'src/lib/features/commons/utils/sanitize.utils.ts'
  - 'tests/pipeline/**'
  - 'tests/duckdb/**'
---

# DuckDB data layer

All data work — import, typing, summary stats, sort, search, filter, calculator, join, reprojection, classification, aggregation, export — runs through **DuckDB WASM** (+ the `spatial` extension). It is the single data engine; the rules below keep it safe and fast.

## DuckDB does the parsing — never hand-roll one

- Read files with DuckDB functions: `read_csv` (tabular), `read_parquet` (Parquet/GeoParquet), `ST_Read` (Shapefile, GeoJSON, GeoPackage, …). Do **not** add a JS/TS parser for any format DuckDB already handles.
- Go through `dataPipeline.processFile()` and `duckDBOrchestrator` for high-level ops; reach for `Duck.query()` only for genuinely low-level SQL.
- Cross-feature access is through the `duckdb` barrel (`$lib/features/duckdb`), never deep imports into its internals.

## SQL injection: escape everything user-derived

Table names, column names, and values almost always originate from user files, so never interpolate them raw (`sanitize.utils.ts`):

- **Identifiers** (table/column names): wrap in double quotes and pass through `escapeIdentifier()` — `"${escapeIdentifier(col)}"`.
- **String values**: wrap in single quotes and pass through `escapeSqlString()` — `'${escapeSqlString(value)}'`.
- ❌ Never `table.replace(/"/g, '""')` inline, and never string-concatenate unescaped input.
- Don't confuse the two: identifiers use `"…"`, values use `'…'`.

## Geometry: normalize to WGS84, keep the binary path

- Reproject every imported geometry to **EPSG:4326** on load (`ST_Transform`), so the render pipeline receives a single known CRS.
- Return geometry as **Arrow IPC (binary)**, not JSON — stream it (`queryStreaming` / `arrow-ipc` format) so large datasets don't blow the WASM memory limit. The binary buffer feeds `geoarrow-deck-stream` directly (see `render-pipeline.md`).
- Keep tabular results as Arrow tables; only materialize to JS arrays (`toArray()`) at the UI boundary that actually needs rows.

## Joins are fuzzy and graded

Table↔basemap joins normalize names (NFC, strip accents, lowercase, trim) and score similarity, bucketing rows into four categories — **joined / to-verify / non-unique / unrecognized**. Reuse the existing join macros; always surface all four buckets with counts. Don't silently drop unmatched rows.

## Mutations must invalidate caches

After any statement that changes a table (`CREATE OR REPLACE`, `DROP`, `ALTER`, `UPDATE`, `INSERT`), call `markTableMutated(ctx, table)` so cached stats / search results don't go stale.

## Errors and NULLs

- Throw `PipelineError` subclasses (e.g. `DuckDBError`); surface to users via `showError` / `showWarning`, localized through Paraglide. Never swallow a query error or leave a bare `console.error`.
- Don't assume which tokens mean "missing"; rely on the project's configured NULL set rather than testing only `''` / `null`.

## Tests

- Server tests (`tests/pipeline/**`, `tests/duckdb/**`) use real DuckDB via `@duckdb/node-api` (`duckdb-node-helper`) and run in CI.
- Client tests mock `executeQuery` and file I/O (via `vi.hoisted()`), and assert on the **SQL string built**, not on a live engine.
