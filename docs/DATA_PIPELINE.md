# Data Pipeline

> **Modern DuckDB-based ingestion architecture**

## Overview

The feature `src/lib/features/data-pipeline` embraces **SOLID**, **KISS**, and **DRY** principles. It's organized as a feature module where models, contracts, adapters, and the pipeline live together, wired via `createDataPipeline`. Dependencies are injected, which keeps testing straightforward.

### Folder map

```
src/lib/features/data-pipeline/
├── index.ts               # Public entry (pipeline, adapters, models, contracts)
├── pipeline/              # createDataPipeline + orchestration helpers
├── adapters/
│   ├── parsers/           # CSVParser, GeoJSONParser
│   └── readers/           # GeoParquetReader
├── models/                # DatasetResult, ColumnType, GeometryInfo, GeoArrow metadata…
├── contracts/             # Interfaces IParser, IColumnAnalyzer, IAnalyticsEngine…
├── types/                 # Core DTOs (ProcessedDataset, AnalysisResult…)
└── utils/                 # Processed-dataset helpers, GeoJSON converter
```

The default pipeline assembles the built-in parsers. You can supply custom parsers when calling the factory.

## Supported formats

| Format      | Extensions             | Parser          | Notes                                        |
| ----------- | ---------------------- | --------------- | -------------------------------------------- |
| **CSV/TSV** | `.csv`, `.tsv`, `.txt` | `CSVParser`     | Tabular data, uses DuckDB's `read_csv()`     |
| **GeoJSON** | `.geojson`, `.json`    | `GeoJSONParser` | Spatial datasets, uses DuckDB's `ST_Read()`  |

> **Note**: Additional formats (Shapefile, GeoParquet, KML, GeoPackage) are handled directly by DuckDB via the orchestrator service when files are registered.

## Processing flow

```
1. File upload
        ↓
2. findParser() → pick matching parser
        ↓
3. parser.parse() → creates DuckDB table + returns DatasetResult
        ↓
4. DuckDB orchestrator → analysis + stats via Duck.analyse()
        ↓
5. DatasetResult → final enriched payload
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

### Advanced configuration

```ts
import {
  createDataPipeline,
  createParserList
} from '$lib/features/data-pipeline';

const parsers = createParserList();
// Add custom parser at the beginning of the list
parsers.unshift(new MyCustomParser());

const pipeline = createDataPipeline({
  parsers
});
```

## DuckDB feature tie-in (`src/lib/features/duckdb`)

- `duckdb-orchestrator.service.svelte.ts`: manages registered datasets, chooses the GeoJSON path (ST_Read → Arrow → Legacy) based on `VITE_USE_ST_READ` and `VITE_USE_ARROW_GEOJSON`, and exposes tables to the UI.
- `duckdb/duckdb.ts`: wraps DuckDB-WASM, installs macros (`analyse`, `breaks`, `join`), maintains the GeoParquet LRU cache, and offers helpers (`read_geofile`, `copy_to_geoparquet_as_buffer`, `insertArrowFromIPCStream`).
- `duckdb-validator.service.ts`: leverages the macros to produce describe/summary/histogram diagnostics and suggest geocatalog matches.

Key reminders:

1. Always call `duckDBOrchestrator.initialize()` before running queries; it loads extensions and macros.
2. `processGeoJSON` tries ST_Read, then Arrow ingestion, then the legacy JSON fallback based on the env flags.
3. DuckDB queries drop GeoArrow metadata, so export to GeoParquet (`copy_to_geoparquet_as_buffer`) and re-read via `geoParquetReader` when metadata matters.
4. The GeoParquet cache lives in memory (LRU ~100 MB). Clear it (`clearGeoParquetCache`) when dropping/recreating tables.

### DuckDB runtime optimizations

`src/lib/features/duckdb/services/duckdb/duckdb.ts` now squeezes more out of DuckDB-WASM:

- **Pragma bootstrap** – `configureRuntimeSettings()` pins thread count, memory limit, disables the progress bar, and attempts to load `httpfs` so remote basemaps can be streamed without temporary files.
- **Transactional ingestion** – `read_tabular`, `read_geofile`, and `read_link` wrap `CREATE TABLE` + `ST_Read` + `add_row_id` inside `runInTransaction`, so partially-created tables cannot leak when a conversion fails midway.
- **Prepared statements** – frequently executed queries (`describe_table`, `get_row_count`) now rely on cached `AsyncPreparedStatement`s with parameter binding (`query_table(?)`). This avoids re-parsing SQL and makes metadata lookups immune to identifier injection.
- **Targeted cache invalidation** – every mutation funnels through `markTableMutated()`, which clears the describe/row-count caches and evicts any GeoParquet buffer for the affected table. Joins, column edits, and even Arrow inserts automatically invalidate their caches.
- **Ephemeral file cleanup** – inline uploads registered via `registerFileText` are dropped via `dropRegisteredFile` once the table exists, preventing the WASM FS from holding on to large pasted datasets.

Thanks to these tweaks DuckDB stays the single source of truth (CDC §3.A) but avoids the previous round-trips through GeoParquet for metadata, and deck.gl pulls Arrow IPC directly from DuckDB.

## Core interfaces

```ts
export type DataPipelineOptions = {
  parsers?: ParserList;
};

export type DataPipeline = {
  initialize(): Promise<void>;
  processFile(file: File): Promise<DatasetResult>;
  processUploadedFile(
    uploadedFile: UploadedFilePayload,
    originalFile?: File
  ): Promise<DatasetResult>;
  destroy(): Promise<void>;
};
```

`createDataPipeline(options?: DataPipelineOptions)` returns an object implementing `DataPipeline`. Apps typically re-export the singleton `dataPipeline` from `index.ts`. During tests you can instantiate a fresh pipeline with mocks.

## Design patterns

### Facade

The pipeline object is the facade: `initialize`, `processFile`, `processUploadedFile`, `destroy`. Internals (DuckDB operations, parsing) stay hidden.

### Strategy / Selector

Parsers implement `IParser` and are plugged via `createParserList` + `findParser`.

```ts
const parsers = createParserList();
parsers.unshift(new MyCustomParser());
const parser = findParser(file, parsers);
if (!parser) throw new Error('Unsupported format');
```

## Type inference

Type inference is handled by DuckDB's native type detection during table creation. The `Duck.analyse()` function provides column statistics and type information.

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
const result = await dataPipeline.processUploadedFile(uploadedFile);
```

Core DTOs (`ProcessedDataset`, `ColumnInfo`, `AnalysisResult`) are defined in `src/lib/features/data-pipeline/types`.

## Public exports

```ts
// Types
export type {
  ProcessedDataset,
  ColumnInfo,
  AnalysisResult
} from '$lib/features/data-pipeline';

// Facade + factory
export { dataPipeline, createDataPipeline } from '$lib/features/data-pipeline';

// Extension helpers
export {
  createParserList,
  findParser,
  CSVParser,
  GeoJSONParser
} from '$lib/features/data-pipeline';
```
