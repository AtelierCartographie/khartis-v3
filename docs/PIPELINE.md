# Data Pipeline

## Supported Formats

CSV / TSV / pasted text; GeoJSON; Shapefile (.shp+.shx+.dbf[+.prj][+.cpg]); GeoPackage.
Planned: KML/KMZ (not implemented yet).

## Dual Processing Architecture

Data flows through two complementary systems:

### 1. Traditional JavaScript Processing (DatasetsStore)

- Immediate parsing and type inference
- Basic statistics computation
- In-memory data storage
- Direct visualization binding

### 2. DuckDB Analytical Engine (DuckDBOrchestrator)

- SQL-based analysis capabilities
- Advanced statistics and aggregations
- Efficient joins and transformations
- Classification break calculations

## Workflow

1. Group files (shapefile component detection)
2. Basic validation (size, extension heuristics, sync + optional async checks)
3. **Deep validation** (NEW):
   - Geographic column detection
   - Data quality analysis
   - Performance assessment
   - Catalogue matching preparation
4. Parse (Papa CSV parse; shapefile → GeoJSON; GeoPackage experimental)
5. **Dual processing**:
   - DatasetsStore: Type inference → stats → store
   - DuckDBOrchestrator: Create table → analyze columns → prepare for SQL
6. Column type inference (boolean → date → numeric → string) (geometry typing deferred)
7. Stats (min,max,mean + counts; median/stdDev via deep analysis)
8. Store source file + derived stats + validation results
9. Geographic catalogue matching (if geo columns detected)
10. (Planned) Geometry metrics (bounds, centroid)
11. (Planned) Visualization suggestion hooks

## Core Types (Simplified)

```ts
interface DataColumn {
  name: string;
  type: ColumnType;
  stats?: ColumnStats;
}
interface ProcessedDataset {
  id: string;
  name: string;
  columns: DataColumn[];
  rowCount: number;
  geometry?: GeometryInfo;
}
```

## Type Inference Heuristics

Stop early on definitive detection; re-scan only ambiguous columns. Sample first N rows; fallback full pass if borderline.

## Stats Notes

- Ingest phase computes: min, max, mean, counts, uniqueness
- Median and standard deviation: on-demand calculation only (not persisted)
- Text category frequency list: planned (not yet materialized)
- Date min/max: planned

## Transformations

Not implemented yet. Roadmap concepts include: refine (normalize text), calculator (expression → new column), filter, sort, hide/delete, reset.

## Joins / Geolocation

Planned: code/name matching with scoring for enrichment; lat/lon → geometry assembly; conflict states (matched, to_review, non_unique, unknown).

### Merge / Join Semantics

Not implemented. Target approach: join key controlled overwrite/append with future conflict resolution UI. Large merges to be worker-offloaded.

## DuckDB Integration

### Table Creation

```sql
-- CSV import creates typed table
CREATE TABLE dataset_name AS
SELECT * FROM read_csv_auto('file.csv');

-- GeoJSON creates spatial table
CREATE TABLE geo_dataset AS
SELECT * FROM ST_Read('file.geojson');
```

### Analysis Operations

- Column profiling via `Duck.analyse(tableName)`
- Break calculation via `Duck.breaks(column, method, k)`
- Custom SQL queries for aggregations
- Spatial operations on geometry columns

## Performance Tactics

| Step     | Current                         | Planned                                 |
| -------- | ------------------------------- | --------------------------------------- |
| Parsing  | Papa parse in main thread       | Worker offload for large files          |
| DuckDB   | WASM in main thread             | Dedicated worker with SharedArrayBuffer |
| Typing   | Single pass + simple heuristics | Sampling + selective deep scan          |
| Stats    | Single pass accumulation        | Streaming quantile sketches via DuckDB  |
| Geometry | Direct GeoJSON ingestion        | DuckDB spatial functions                |

## Logging & Diagnostics

CSV parsing path currently uses console logging for debug (parseCsvWithPapa). Introduce a gated logger (already partially present) and strip raw console usage before production build.

## Export

| Kind    | Formats              |
| ------- | -------------------- |
| Map     | PNG, JPEG, SVG, PDF  |
| Data    | CSV, GeoJSON         |
| Project | .kh (JSON aggregate) |

Filename sanitization always applied; CSV cells escaped if dangerous leading char.

## Error Classes

DataValidationError, FileGroupError, SizeLimitError, ExpressionError.

## Extension Points

| Area               | Contract                         |
| ------------------ | -------------------------------- |
| New parser         | (file) => RawDataset + validator |
| New transformation | (dataset) => dataset             |
| Added stats        | Hook after base stats pass       |
| Export format      | project => Blob                  |

## Known Limitations

| Area            | Limitation / Status             | Planned Action                     |
| --------------- | ------------------------------- | ---------------------------------- |
| Merge           | Not implemented                 | Conflict resolution + diff preview |
| Workers         | Heavy steps on main thread      | Offload parsing & classification   |
| Validation copy | Messages partly French          | Localize via Paraglide             |
| Large stats     | No streaming quantile sketch    | Integrate t-digest / reservoir     |
| Geometry stats  | Bounds/centroids not computed   | Lazy computation + caching         |
| Suggestions     | Visualization hints not emitted | Add suggestion orchestrator        |

## Quick Reference

- Keep imports incremental
- Fail early; surface first actionable issue
- Recompute dependent stats only on structural change
- Avoid unnecessary re-parses
- Gate or remove dev logging
