# Architecture

> **Mental model and core design principles of Khartis v3**

## Runtime Flow

```
Import → Validate → Parse → Type Inference + Stats → Dataset Store
  ↓
Visualization Suggestion → User Configuration → Layer Assembly (Deck.gl)
  ↓
Basemap (MapLibre) + Annotations + Layout → Export (PNG/SVG/PDF/CSV/GeoJSON)
```

## Core Data Shapes

```ts
interface DataColumn {
  name: string;
  type: ColumnType; // 'text' | 'numeric' | 'date' | 'boolean' | 'geometry'
  stats?: ColumnStats; // min, max, mean, nulls, uniques
}

interface ProcessedDataset {
  id: string;
  name: string;
  columns: DataColumn[];
  rowCount: number;
  geometry?: GeometryInfo; // type, bbox, crs
}

interface Visualization {
  id: string;
  datasetId: string;
  type: VizType; // 'choropleth' | 'proportional' | 'categorical' | 'bivariate'
  classification?: Classification;
  color?: ColorConfig;
}

interface Project {
  id: string;
  datasets: ProcessedDataset[];
  visualizations: Visualization[];
  layout: LayoutConfig;
  settings: ProjectSettings;
}
```

## Four Pillars

1. **Client-only Privacy**
   - All processing in browser (IndexedDB + memory)
   - No server upload or external API calls for user data
   - Offline-capable

2. **Feature-first Modularity**
   - Self-contained features in `src/lib/features/`
   - Each feature owns its store, components, types
   - Minimal cross-feature coupling

3. **Runes Reactive State**
   - Svelte 5 `$state` and `$derived`
   - Explicit mutation methods (no direct assignment)
   - Predictable state updates

4. **GPU-first Rendering**
   - Deck.gl for thematic layers
   - MapLibre for basemaps
   - Hardware-accelerated pan/zoom/render

## Store Layering

| Layer               | Purpose                    | Example                            |
| ------------------- | -------------------------- | ---------------------------------- |
| **Component Local** | Ephemeral UI state         | Form inputs, modal visibility      |
| **Feature Store**   | Canonical domain state     | Dataset list, visualization config |
| **Global Store**    | Cross-feature coordination | Project metadata, active dataset   |
| **Persistence**     | Long-term storage          | IndexedDB snapshots, auto-save     |

**State flow**: Component → Feature Store → Global Store → IndexedDB

## Performance Strategy

| Challenge          | Solution                                            |
| ------------------ | --------------------------------------------------- |
| Large file imports | Streaming parse + sampled type inference            |
| Heavy computations | Web Workers (classification, joins, simplification) |
| Complex geometry   | Pre-simplified tiers + dynamic LOD                  |
| Rapid edits        | `$derived` memoization + debounced recompute        |

**Target**: <3s load, ~60fps rendering (small-medium datasets)

## Web Workers Architecture

The **Web Workers** feature (`src/lib/features/workers/`) provides background thread execution for CPU-intensive operations, preventing UI freezes and improving responsiveness.

### Purpose & Benefits

- **Non-blocking UI**: Heavy computations run in background threads
- **Parallel Processing**: Multiple workers can run simultaneously
- **Better Performance**: Offload CPU-intensive tasks from main thread
- **Improved UX**: UI remains responsive during data processing

### Supported Operations

| Operation                | Status        | Notes                                    |
| ------------------------ | ------------- | ---------------------------------------- |
| **Type Inference**       | ✅ Active     | Column type detection in background      |
| **DuckDB Batch Queries** | ✅ Active     | Execute multiple queries in parallel     |
| **Geometry Processing**  | ✅ Active     | Simplify, buffer, union operations       |
| **CSV Parsing**          | ⚠️ Deprecated | Migrated to DuckDB's native `read_csv()` |
| **Shapefile Parsing**    | ⚠️ Deprecated | Migrated to DuckDB's native `ST_Read()`  |
| **GeoJSON Parsing**      | ⚠️ Deprecated | Migrated to DuckDB's native `ST_Read()`  |

### Worker Communication

Workers use type-safe message passing:

```typescript
// Request to worker
interface WorkerRequest<T> {
  id: string; // Unique request ID
  type: string; // Operation type
  payload: T; // Request data
  transferables?: Transferable[]; // For efficient memory transfer
}

// Response from worker
interface WorkerResponse<T> {
  id: string; // Matching request ID
  type: 'success' | 'error' | 'progress';
  payload?: T; // Result data
  error?: string; // Error message if failed
  progress?: number; // Progress percentage (0-100)
}
```

### Usage Example

```typescript
// Type inference in background
const request: TypeInferenceRequest = {
  columns: [
    { name: 'age', values: [25, 30, 'N/A', 45] },
    { name: 'date', values: ['2024-01-01', '2024-02-15'] }
  ],
  sampleSize: 100,
  threshold: 0.8
};

// Worker will respond with inferred types
const response: TypeInferenceResponse = {
  columns: [
    { name: 'age', type: 'numeric', confidence: 0.75, nullable: true },
    { name: 'date', type: 'date', confidence: 1.0, nullable: false }
  ]
};
```

### Worker Pool Management

- **Pool Size**: Automatically managed based on CPU cores
- **Task Queue**: Pending tasks queued when all workers busy
- **Error Recovery**: Failed tasks can be retried or fallback to main thread
- **Performance Monitoring**: Track execution times and throughput

### Implementation Notes

- Workers are compatible with Vite + PWA configuration
- SharedArrayBuffer support enables efficient data sharing
- Fallback to main thread execution when workers unavailable
- Type guards ensure type-safe message passing

## Extensibility Contracts

```ts
// Add new file parser
type Parser = (file: File) => Promise<RawDataset>;

// Add new classification method
interface ClassificationStrategy {
  id: string;
  compute(values: number[], k: number): number[];
}

// Add new export format
interface Exporter {
  id: string;
  export(project: Project): Promise<Blob>;
}

// Add new visualization type
interface VizFactory {
  id: string;
  create(dataset: Dataset, config: VizConfig): Visualization;
}
```

All extensions register in respective registries (parser, classification, export, visualization).

## Error Handling Principles

- **Fail fast** on invalid input (validation)
- **Fallback gracefully** on computation errors (default projection, safe classification)
- **Never block UI** for long tasks (workers + progress feedback)
- **User-friendly messages** (contextual, actionable)

## Security & Privacy

- **Client-only**: No server attack surface
- **Sanitization**: File names, CSV cells, user inputs
- **Size quotas**: 50MB file, 100MB project, 50 projects max
- **Dependency audits**: Regular security checks

Not applicable: CSRF, server auth, multi-tenant isolation

## Accessibility

- **Keyboard-first**: Full keyboard navigation
- **Focus management**: Visible focus indicators
- **Contrast-aware**: Color palette suggestions respect WCAG
- **Textual summaries**: Stats and map descriptions for screen readers

## Internationalization

- **Paraglide**: Compile-time message extraction
- **Semantic keys**: `m.projectCreate()` not `m.label1()`
- **No concatenation**: Use message parameters
- **Supported locales**: en, fr

## Extension Points Quick Reference

| Task               | Entry Point                                            |
| ------------------ | ------------------------------------------------------ |
| New file format    | `src/lib/features/commons/services/parsers/`           |
| New visualization  | `src/lib/features/map/utils/visualization-registry.ts` |
| New classification | `src/lib/features/map/utils/classification/`           |
| New export format  | `src/lib/features/commons/utils/export/`               |
| New tool           | `src/lib/features/step-toolbar/tools/<tool-name>`      |

---

**See also:**

- [DATA_PIPELINE.md](DATA_PIPELINE.md) - Data processing details
- [VISUALIZATION.md](VISUALIZATION.md) - Rendering system
- [STATE_AND_FEATURES.md](STATE_AND_FEATURES.md) - State management
