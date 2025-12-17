# Data Pipeline

> **Modern DuckDB-based ingestion architecture**

## Overview

The feature `src/lib/features/data-pipeline` embraces **SOLID**, **KISS**, and **DRY** principles. It uses a **modular functional design** with pure functions and module-level state (no classes). DuckDB is the primary processing engine for all file operations.

### Folder map

```
src/lib/features/data-pipeline/
├── index.ts               # Public API barrel exports
├── pipeline.ts            # Main Pipeline facade singleton
├── types.ts               # Type definitions (DatasetResult, ColumnType, etc.)
├── constants.ts           # Extensions, MIME types, limits (PIPELINE_CONST)
├── core/
│   ├── parsers.ts         # parseTabular, parseGeoFile, parseFile (pure functions)
│   └── validators.ts      # validateFile, validateFileExtension, validateMimeType
├── io/
│   └── geoparquet-reader.ts  # GeoParquet file reading with GeoArrow metadata
├── operations/
│   ├── analysis.ts        # buildDatasetFromDuckTable, enrichColumns
│   ├── geometry.ts        # extractGeometryInfo, computeBounds
│   └── quality.ts         # computeQualityWarnings
└── utils/
    ├── decimal-detector.ts      # detectDecimalSeparator (CSV decimal format)
    ├── geojson-converter.ts     # convertGeoJSONToRawDataset
    ├── geojson-guards.ts        # Type guards and GeoJSON validation
    ├── processed-dataset.utils.ts  # normalizeToProcessedDataset, normalizeDatasets
    ├── shapefile-validator.ts   # validateShapefileCompleteness
    └── zip-handler.ts           # extractZip, isZipFile, shapefile archive handling
```

The `Pipeline` facade provides a clean API that delegates to DuckDB for all parsing and analysis.

## Supported formats

| Format         | Extensions                | Function       | Notes                                       |
| -------------- | ------------------------- | -------------- | ------------------------------------------- |
| **CSV/TSV**    | `.csv`, `.tsv`, `.txt`    | `parseTabular` | Tabular data, uses DuckDB's `read_csv()`    |
| **Parquet**    | `.parquet`                | `parseTabular` | Columnar format, native DuckDB support      |
| **GeoJSON**    | `.geojson`, `.json`       | `parseGeoFile` | Spatial datasets, uses DuckDB's `ST_Read()` |
| **Shapefile**  | `.shp` (+ `.dbf`, `.shx`) | `parseGeoFile` | Converted to GeoJSON, then `ST_Read()`      |
| **GeoPackage** | `.gpkg`                   | `parseGeoFile` | Native DuckDB spatial support               |
| **GeoParquet** | `.geoparquet`, `.parquet` | `parseGeoFile` | GeoArrow encoding preserved                 |
| **KML/KMZ**    | `.kml`, `.kmz`            | `parseGeoFile` | Converted via DuckDB `ST_Read()`            |

## Processing flow

```
1. File upload
        ↓
2. validateFile() → check size, extension, MIME type
        ↓
3. detectFileFormat() → determine tabular vs geospatial
        ↓
4. parseTabular() or parseGeoFile() → creates DuckDB table
        ↓
5. buildDatasetFromDuckTable() → analysis + stats via Duck.analyse()
        ↓
6. DatasetResult → final enriched payload with columns, geometry, warnings
```

## Public API

### Default usage

```ts
import { dataPipeline } from '$lib/features/data-pipeline';

await dataPipeline.initialize(); // once at startup
const result = await dataPipeline.processFile(file);

console.log(result.tableName); // DuckDB table name
console.log(result.columns); // Enriched columns with stats
console.log(result.geometry); // Geometry info if spatial
```

### Additional methods

```ts
// Process uploaded file with UploadedFile payload
const result = await dataPipeline.processUploadedFile(
  uploadedFile,
  originalFile
);

// Process remote file from URL
const result = await dataPipeline.processRemoteFile(url, {
  tablename: 'remote_data'
});

// Process pasted data (CSV text)
const result = await dataPipeline.processPastedData(csvContent, {
  tablename: 'pasted'
});

// Join and filter operations
await dataPipeline.joinDatasetById(tableName, idColumn, options);
await dataPipeline.applyJoinAssociation(tableName, basemap);
await dataPipeline.applyFilters(tableName, filters);

// Validate file before processing
const validation = await dataPipeline.validateFile(file);
```

## DuckDB feature tie-in (`src/lib/features/duckdb`)

The DuckDB feature uses a **modular functional architecture** (NO classes, pure functions + module-level state):

```
src/lib/features/duckdb/
├── duck.ts                  # Duck facade object (singleton)
├── types.ts                 # ALL consolidated types
├── constants.ts             # DUCK_CONST, CACHE_CONSTANTS
├── validator.service.ts     # Validation diagnostics
├── core/                    # Low-level engine
│   ├── engine.ts            # WASM init, extensions
│   ├── query.ts             # SQL execution + Arrow conversion
│   └── transaction.ts       # TransactionMutex
├── io/                      # File I/O
│   ├── file-registry.ts     # File registration utilities
│   ├── readers.ts           # read_tabular, read_geofile, read_link
│   ├── reprojection.ts      # proj4 fallback for unsupported CRS (Lambert-93)
│   ├── exporters.ts         # CSV, GeoParquet export
│   └── arrow-converter.ts   # Arrow ↔ DuckDB conversion
├── cache/                   # Unified cache
│   └── cache-manager.ts     # describe, rowcount, geoparquet
├── operations/              # Data operations
│   ├── analysis.ts          # analyse, describeColumns
│   ├── search.ts            # searchInTable
│   ├── join.ts              # join_by_id, apply_join_association
│   ├── filters.ts           # add_filter, apply_filters
│   └── table-ops.ts         # describe_table, get_row_count, drop_rows
├── macros/                  # SQL macros
│   ├── analyse.ts, breaks.ts, join.ts, search.ts
└── orchestrator/            # Reactive Svelte 5 service
    ├── orchestrator.svelte.ts
    ├── dataset-state.ts     # Dataset state management
    └── (sub-modules: column-ops, filter-ops, join-ops, gps-ops, arrow-ops, file-processors)
```

Key reminders:

1. Always call `duckDBOrchestrator.initialize()` before running queries; it loads extensions and macros.
2. `processGeoJSON` tries ST_Read, then Arrow ingestion, then the legacy JSON fallback.
3. DuckDB queries drop GeoArrow metadata, so export to GeoParquet and re-read when metadata matters.
4. The GeoParquet cache lives in memory (LRU ~100 MB). Use `invalidateTableCache()` when dropping/recreating tables.

### DuckDB runtime optimizations

- **Pragma bootstrap** – `configureRuntimeSettings()` pins thread count, memory limit, disables the progress bar, and loads `httpfs`.
- **Transactional ingestion** – `read_tabular`, `read_geofile`, and `read_link` wrap operations inside `runInTransaction`.
- **Targeted cache invalidation** – mutations invalidate the describe/row-count caches and evict GeoParquet buffers.
- **Ephemeral file cleanup** – inline uploads are dropped via `dropRegisteredFile` once the table exists.

### Reprojection fallback (proj4js)

DuckDB WASM's `ST_Transform` cannot reproject all coordinate systems because the WebAssembly build lacks access to the full PROJ database (unlike native DuckDB). This affects projections like **Lambert-93 (EPSG:2154)**, common in French datasets.

**Symptom**: Geometries import successfully but coordinates remain in meters (Lambert-93) instead of degrees (WGS84), making them invisible on the map.

**Solution**: A fallback mechanism using `proj4js` handles unsupported projections:

```
1. Attempt ST_Transform via DuckDB
2. If fails → extract geometries as WKT
3. Reproject coordinates with proj4js (client-side)
4. Update DuckDB table with reprojected WKT
```

**Files involved**:

| File                        | Purpose                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `duckdb/io/reprojection.ts` | proj4 definitions + `reprojectPoint()`, `reprojectGeometry()`, `reprojectFeatureCollection()` |
| `duckdb/io/readers.ts`      | Fallback logic in `applyProj4Reprojection()` + `DUCKDB_UNSUPPORTED_PROJECTIONS` list          |

**Supported projections** (defined in `reprojection.ts`):

- EPSG:2154 – Lambert-93 (France métropolitaine)
- EPSG:27572 – Lambert II étendu
- EPSG:32631/32632 – UTM zones 31N/32N

**Architecture note**: proj4js is used _only_ for coordinate transformation. Data remains in DuckDB for all other operations (queries, filters, joins, exports).

## Core interfaces

```ts
// Pipeline facade singleton
export const Pipeline = {
  get initialized(): boolean;

  initialize(): Promise<void>;
  processFile(file: File): Promise<DatasetResult>;
  processUploadedFile(uploadedFile, originalFile?): Promise<DatasetResult>;
  processRemoteFile(url, options?): Promise<DatasetResult>;
  processPastedData(content, options?): Promise<DatasetResult>;

  joinDatasetById(tableName, idColumn, options): Promise<unknown>;
  applyJoinAssociation(tableName, basemap): Promise<void>;
  applyFilters(tableName, filters): Promise<unknown>;

  validateFile(file): Promise<ValidationResult>;
  destroy(): Promise<void>;
};

// DatasetResult structure
interface DatasetResult {
  id: string;
  name: string;
  sourceFileId: string;
  tableName: string;
  rowCount: number;
  columns: EnrichedColumn[];
  analysis: {
    columns: EnrichedColumn[];
    hasGeoData: boolean;
    geoColumns: GeoColumnInfo[];
    rowCount: number;
    warnings: string[];
  };
  geometry?: GeometryInfo;
  geoDetection?: GeoDetectionResult;
  duckdbTableName: string;
  metadata: { processedAt: Date; transformations: string[] };
}
```

The `dataPipeline` singleton is exported from `index.ts` for convenient access.

## Design patterns

### Facade

The `Pipeline` object is the facade: `initialize`, `processFile`, `processUploadedFile`, etc. Internals (DuckDB operations, parsing, validation) stay hidden.

### Module-level state

Uses module-level variables and pure functions instead of classes:

```ts
// Internal state
let initialized = false;

// Pure functions with context
async function processFileInternal(ctx, file, options) { ... }
async function buildDatasetFromDuckTable(ctx, params) { ... }
```

### Strategy via format detection

File format detection routes to the appropriate parser function:

```ts
const format = detectFileFormat(file.name);
if (format === 'csv' || format === 'tsv' || format === 'parquet') {
  return parseTabular(ctx, file, options);
} else {
  return parseGeoFile(ctx, file, options);
}
```

## Type inference

Type inference is handled by DuckDB's native type detection during table creation. The `Duck.analyse()` function provides column statistics and type information, which is then enriched via `enrichColumns()`.

## Performance checklist

| Challenge             | Solution                                |
| --------------------- | --------------------------------------- |
| Large imports         | DuckDB native parsing with TABLESAMPLE  |
| Multiple conversions  | Single-pass pipeline                    |
| Metadata preservation | GeoParquet with GeoArrow encoding       |
| Memory management     | Processing semaphore (max 2 concurrent) |

Target: <3 s load for "standard" datasets, smooth pan/zoom (~60 fps).

## API Usage

```ts
// Initialize once at startup
await dataPipeline.initialize();

// Process different file sources
const result = await dataPipeline.processFile(file);
const result = await dataPipeline.processUploadedFile(
  uploadedFile,
  originalFile
);
const result = await dataPipeline.processRemoteFile(url);
const result = await dataPipeline.processPastedData(csvText);
```

Core types (`DatasetResult`, `EnrichedColumn`, `ColumnType`) are defined in `src/lib/features/data-pipeline/types.ts`.

## Public exports

```ts
// Types
export type {
  DatasetResult,
  EnrichedColumn,
  ColumnType,
  GeometryInfo,
  GeoDetectionResult,
  ValidationResult
} from '$lib/features/data-pipeline';

// Constants
export { PIPELINE_CONST } from '$lib/features/data-pipeline';

// Pipeline singleton facade
export { dataPipeline, Pipeline } from '$lib/features/data-pipeline';
```
