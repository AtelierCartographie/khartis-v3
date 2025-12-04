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

| Format      | Extensions             | Parser          | Notes                                       |
| ----------- | ---------------------- | --------------- | ------------------------------------------- |
| **CSV/TSV** | `.csv`, `.tsv`, `.txt` | `CSVParser`     | Tabular data, uses DuckDB's `read_csv()`    |
| **GeoJSON** | `.geojson`, `.json`    | `GeoJSONParser` | Spatial datasets, uses DuckDB's `ST_Read()` |

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
│   ├── readers.ts           # read_tabular, read_geofile, read_link
│   ├── exporters.ts         # CSV, GeoParquet export
│   └── arrow-converter.ts   # Arrow ↔ DuckDB conversion
├── cache/                   # Unified cache
│   └── cache-manager.ts     # describe, rowcount, geoparquet
├── operations/              # Data operations
│   ├── analysis.ts          # analyse, describeColumns
│   ├── search.ts            # searchInTable
│   ├── join.ts              # join_by_id, apply_join_association
│   └── filters.ts           # add_filter, apply_filters
├── macros/                  # SQL macros
│   ├── analyse.ts, breaks.ts, join.ts, search.ts
└── orchestrator/            # Reactive Svelte 5 service
    ├── orchestrator.svelte.ts
    └── (sub-modules: column-ops, filter-ops, join-ops, etc.)
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
