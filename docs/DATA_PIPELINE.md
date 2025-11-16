# Data Pipeline

> **Modern DuckDB-based ingestion architecture**

## Overview

The feature `src/lib/features/data` still embraces **SOLID**, **KISS**, and **DRY**, but is now organized as a feature module: models, contracts, adapters, and the pipeline live together, and everything is wired via `createDataPipeline`. Dependencies are injected, which keeps testing straightforward.

### Folder map

```
src/lib/features/data/
├── index.ts               # Public entry (pipeline, adapters, models, contracts)
├── pipeline/              # createDataPipeline + orchestration helpers
├── adapters/              # Parsers, validators, type inferrer
├── models/                # DatasetResult, ColumnType, GeometryInfo, GeoArrow metadata…
├── contracts/             # Interfaces IParser, IValidator, ITypeInferrer…
├── types/                 # Legacy DTOs (ProcessedDataset, AnalysisResult…)
└── utils/                 # Processed-dataset helpers, etc.
```

The default pipeline assembles the built-in adapters but you can supply custom lists (parsers, validators, type inferrers) when calling the factory. This replaces the former Domain/Application/Infrastructure split without losing responsibilities.

## Migration snapshot

### Components already on the new pipeline

- `datasetsStore` – uses `dataPipeline.processUploadedFile`
- `FileProcessorService` (CSV path) – calls the CSV parser directly to avoid worker errors

### Migration benefits

1. **Performance** – one pass instead of triple parsing
2. **Reliability** – no more worker `postMessage` issues
3. **Maintainability** – DI-friendly architecture
4. **Type safety** – full TypeScript typings

### Web worker note

The legacy CSV path relied on a worker (`csv-parser.worker.ts`). Browser quirks around `postMessage` made error handling brittle. PapaParse now runs on the main thread:

- Zero worker serialization errors
- Simpler code
- Still very fast (PapaParse is heavily optimized)
- For huge files, type inference samples the first 100 rows

## Supported formats

| Format        | Extensions             | Parser            | Notes                                              |
| ------------- | ---------------------- | ----------------- | -------------------------------------------------- |
| **CSV/TSV**   | `.csv`, `.tsv`, `.txt` | `CSVParser`       | Tabular data, sampled type inference via PapaParse |
| **GeoJSON**   | `.geojson`, `.json`    | `GeoJSONParser`   | Spatial datasets, bounds + centroid extracted      |
| **Shapefile** | `.shp` + companions    | `ShapefileParser` | Expects zipped bundle, converts to GeoJSON first   |

## Processing flow

```
1. File upload
        ↓
2. findParser() → pick matching parser
        ↓
3. parser.parse() → returns RawDataset
        ↓
4. runValidators() → size, schema, quality
        ↓
5. HeuristicTypeInferrer → column types
        ↓
6. DuckDB → tables + stats
        ↓
7. DatasetResult → final enriched payload
```

## Public API

### Default usage

```ts
import { dataPipeline } from '$lib/features/data';

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
  createParserList,
  createValidatorList,
  HeuristicTypeInferrer
} from '$lib/features/data';

const parsers = createParserList();
parsers.unshift(new ExcelParser()); // custom parser first

const validators = createValidatorList();
validators.push(new CustomValidator());

const pipeline = createDataPipeline({
  parsers,
  validators,
  typeInferrer: new HeuristicTypeInferrer(),
  stopOnFirstValidationError: true
});
```

The factory mirrors the old khartis-pipeline-old flow but keeps extensions easy.

## DuckDB feature tie-in (`src/lib/features/duckdb`)

- `duckdb-orchestrator.service.svelte.ts`: manages registered datasets, chooses the GeoJSON path (ST_Read → Arrow → Legacy) based on `VITE_USE_ST_READ` and `VITE_USE_ARROW_GEOJSON`, and exposes tables to the UI.
- `duckdb/duckdb.ts`: wraps DuckDB-WASM, installs macros (`analyse`, `breaks`, `join`), maintains the GeoParquet LRU cache, and offers helpers (`read_geofile`, `copy_to_geoparquet_as_buffer`, `insertArrowFromIPCStream`).
- `duckdb-validator.service.ts`: leverages the macros to produce describe/summary/histogram diagnostics and suggest geocatalog matches.

Key reminders:

1. Always call `duckDBOrchestrator.initialize()` before running queries; it loads extensions and macros.
2. `processGeoJSON` tries ST_Read, then Arrow ingestion, then the legacy JSON fallback based on the env flags.
3. DuckDB queries drop GeoArrow metadata, so export to GeoParquet (`copy_to_geoparquet_as_buffer`) and re-read via `geoParquetReader` when metadata matters.
4. The GeoParquet cache lives in memory (LRU ~100 MB). Clear it (`clearGeoParquetCache`) when dropping/recreating tables.

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
  validators?: ValidatorList;
  typeInferrer?: ITypeInferrer;
  stopOnFirstValidationError?: boolean;
};

export type DataPipeline = {
  initialize(): Promise<void>;
  processFile(file: File): Promise<DatasetResult>;
  processUploadedFile(
    uploadedFile: UploadedFilePayload,
    originalFile?: File
  ): Promise<DatasetResult>;
  validateFile(file: File): Promise<ValidationResult>;
  destroy(): Promise<void>;
  getParsers(): IParser[];
  getValidators(): IValidator[];
};
```

`createDataPipeline(options?: DataPipelineOptions)` returns an object implementing `DataPipeline`. Apps typically re-export the singleton `dataPipeline` from `index.ts`. During tests you can instantiate a fresh pipeline with mocks.

## Design patterns

### Facade

The pipeline object is the facade: `initialize`, `processFile`, `processUploadedFile`, `validateFile`, `destroy`. Internals (validations, inference, DuckDB) stay hidden.

### Strategy / Selector

- Parsers implement `IParser` and are plugged via `createParserList` + `findParser`.
- Validators implement `IValidator` and are executed via `runValidators`.

```ts
const parsers = createParserList();
parsers.unshift(new ExcelParser());
const parser = findParser(file, parsers);
if (!parser) throw new Error('Unsupported format');
```

### Chain of Responsibility

`runValidators(rawDataset, validators, stopOnFirstError)` chains the validators in order; set `stopOnFirstError` to short-circuit.

```ts
const validators = createValidatorList();
validators.push(new CustomValidator());
const result = runValidators(dataset, validators, true);
if (!result.isValid) throw new Error(result.errors.join(', '));
```

## Type inference heuristics

- 80 % of the sampled values must match to promote a type.
- Only the first 100 non-null values are sampled.
- Priority: boolean → date → number → geometry → text.

## Performance checklist

| Challenge            | Solution                                    |
| -------------------- | ------------------------------------------- |
| Large imports        | Streaming PapaParse + sampled inference     |
| Multiple conversions | Single-pass pipeline                        |
| DuckDB metadata loss | GeoParquet export + GeoArrow-aware reader   |
| Worker errors        | Main-thread parsing to avoid browser quirks |

Target: <3 s load for “standard” datasets, smooth pan/zoom (~60 fps).

## Backward compatibility

Legacy entry points remain available:

```ts
const result = await dataPipeline.processUploadedFile(uploadedFile);
```

Legacy DTOs (`ProcessedDataset`, `ColumnInfo`, `AnalysisResult`) still live in `src/lib/features/data/types` until all consumers migrate.

## Public exports

```ts
// Types
export type {
  ProcessedDataset,
  ColumnInfo,
  AnalysisResult
} from '$lib/features/data';

// Facade + factory
export { dataPipeline, createDataPipeline } from '$lib/features/data';

// Extension helpers
export {
  createParserList,
  createValidatorList,
  runValidators,
  CSVParser,
  GeoJSONParser,
  ShapefileParser,
  HeuristicTypeInferrer
} from '$lib/features/data';
```
