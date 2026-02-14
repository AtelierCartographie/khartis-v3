# Khartis v3 - AI Coding Agent Instructions

## Project Context

Khartis v3 is a **client-side thematic mapping application** built with SvelteKit 5 (Runes), TypeScript, and modern web technologies. All data processing happens in the browser for privacy - user data never leaves the client.

**Tech Stack**: SvelteKit 5 + TypeScript + Vite + DuckDB WASM + Deck.gl + MapLibre + Carbon Design System

## Essential Developer Commands

```bash
# Setup (first time only)
corepack enable pnpm     # Enable pnpm via Corepack
pnpm install             # Install dependencies

# Development workflow
pnpm dev                 # Start dev server on port 5176
pnpm check               # Svelte type checks (strict TypeScript enabled)
pnpm lint                # Prettier + ESLint check
pnpm format              # Auto-format with Prettier
pnpm test:unit           # Vitest unit tests
pnpm test:e2e            # Playwright E2E tests

# Production
pnpm build               # Build for production (uses /cartographie/khartisnewpprd base path)
pnpm preview             # Preview production build
```

**⚠️ Critical**: Always use pnpm (via Corepack), never npm. TypeScript strict mode is enabled - no `any` types allowed.

## Architecture Overview

### Four Core Principles

1. **Client-only Privacy**: All processing in browser (IndexedDB + memory), no server upload
2. **Feature-first Modularity**: Self-contained features in `src/lib/features/`
3. **Svelte 5 Runes Reactive State**: `$state`, `$derived`, `$effect` (not Svelte 4 stores)
4. **GPU-first Rendering**: Deck.gl for thematic layers, MapLibre for basemaps

### Data Flow Pipeline

```
File Upload → validateFile() → detectFileFormat() → parseTabular/parseGeoFile()
                                                              ↓
                                    DuckDB table → buildDatasetFromDuckTable() → DatasetResult
                                                              ↓
                                        Visualization Suggestion → User Config → Deck.gl Layers → GPU Rendering
```

**Key Insight**: Direct-to-DuckDB processing with native functions (`read_csv()`, `ST_Read()`), providing SQL query capabilities for all data analysis.

### Feature-based Structure

```
src/lib/
├── features/           # Feature-based architecture
│   ├── commons/        # Shared: components, stores, services, utils, types
│   ├── data-pipeline/  # Data pipeline (modular functional design)
│   │   ├── pipeline.ts         # Pipeline facade singleton
│   │   ├── types.ts            # DatasetResult, EnrichedColumn, ColumnType
│   │   ├── constants.ts        # PIPELINE_CONST (extensions, limits)
│   │   ├── core/               # parsers.ts, validators.ts
│   │   ├── io/                 # geoparquet-reader.ts
│   │   ├── operations/         # analysis.ts, geometry.ts, quality.ts
│   │   └── utils/              # GeoJSON converter, guards
│   ├── duckdb/         # DuckDB WASM integration (modular functional)
│   │   ├── duck.ts             # Duck facade object
│   │   ├── types.ts            # ALL consolidated types
│   │   ├── core/               # Engine, query, transaction
│   │   ├── io/                 # File I/O (readers, exporters)
│   │   ├── cache/              # Unified cache manager
│   │   ├── operations/         # Analysis, search, join, filters
│   │   ├── macros/             # SQL macros
│   │   └── orchestrator/       # Reactive Svelte 5 service
│   ├── create-project/ # Project creation modal
│   │   ├── create-project.svelte       # Main modal wrapper
│   │   ├── create-new-project.svelte   # New project tab
│   │   ├── open-project.svelte         # Open existing tab
│   │   ├── try-with-example.svelte     # Example projects tab
│   │   └── services/                   # File processing & validation
│   ├── header/         # Top navigation
│   ├── main-toolbar/   # Left sidebar (data/viz/styling tabs)
│   ├── map/            # Map visualization with Deck.gl + MapLibre
│   └── step-toolbar/   # Right panel tools (annotations, layers, legend, etc.)
├── paraglide/          # i18n messages (auto-generated, do not edit manually)
└── types/              # Shared TypeScript types
```

**Critical Pattern**: Each feature is self-contained with its own store, components, and types. Minimal cross-feature coupling.

## Svelte 5 Runes Store Pattern

**All stores follow this exact pattern** - this is non-negotiable:

```typescript
// Example: src/lib/features/step-toolbar/tools/annotations/annotations.store.svelte.ts
export function createAnnotationsStore() {
  // Private reactive state (NEVER expose directly)
  const state = $state<AnnotationsState>({
    items: [],
    selectedId: null,
    activeType: 'text'
  });

  return {
    // Public getters (read-only access)
    get items() {
      return state.items;
    },
    get selectedId() {
      return state.selectedId;
    },

    // Derived state (computed from reactive state)
    get selectedItem() {
      return $derived(state.items.find((i) => i.id === state.selectedId));
    },

    // Explicit mutation methods (NEVER mutate state directly outside these)
    addItem(item: AnnotationType): void {
      state.items = [...state.items, item];
    },
    selectItem(id: string | null): void {
      state.selectedId = id;
    },
    removeItem(id: string): void {
      state.items = state.items.filter((i) => i.id !== id);
    }
  };
}

// Singleton export
export const annotationsStore = createAnnotationsStore();
```

**Key Rules**:

- Use `.svelte.ts` extension for stores (required for runes outside `.svelte` files)
- Private `_state` with `$state()` - never expose directly
- Public getters for state access (no setters)
- `$derived()` for computed values
- Explicit action methods for mutations (clear names: `addItem`, `removeItem`, not `set`)
- Export singleton instance at bottom

## Critical Project-Specific Conventions

### 1. Data Pipeline (Modular Functional Architecture)

The data pipeline uses **pure functions + module-level state** (NO classes):

```typescript
// Usage
import { dataPipeline } from '$lib/features/data-pipeline';

await dataPipeline.initialize(); // Initialize DuckDB once at startup
const result = await dataPipeline.processFile(file); // Returns DatasetResult

// Other methods
await dataPipeline.processUploadedFile(uploadedFile, originalFile);
await dataPipeline.processRemoteFile(url);
await dataPipeline.processPastedData(csvContent);
await dataPipeline.joinDatasetById(tableName, idColumn, options);
```

**Architecture structure**:

```
src/lib/features/data-pipeline/
├── pipeline.ts            # Pipeline facade singleton
├── types.ts               # DatasetResult, EnrichedColumn, ColumnType
├── constants.ts           # PIPELINE_CONST (extensions, MIME types, limits)
├── core/
│   ├── parsers.ts         # parseTabular(), parseGeoFile(), parseFile()
│   └── validators.ts      # validateFile(), validateFileExtension()
├── io/
│   └── geoparquet-reader.ts  # GeoParquet with GeoArrow metadata
├── operations/
│   ├── analysis.ts        # buildDatasetFromDuckTable(), enrichColumns()
│   ├── geometry.ts        # extractGeometryInfo()
│   └── quality.ts         # computeQualityWarnings()
└── utils/
    └── geojson-converter.ts  # convertGeoJSONToRawDataset()
```

**To add a new file format**:

```typescript
// 1. Add extension to constants.ts
PIPELINE_CONST.EXTENSIONS.TABULAR.push('.xlsx');

// 2. Update detectFileFormat() in pipeline.ts
if (ext === 'xlsx') return 'xlsx';

// 3. Add parser function in core/parsers.ts
export async function parseExcel(ctx, file, options): Promise<ParseResult> {
  // Convert to format DuckDB can handle, then use existing parsers
}

// 4. Update parseFile() to route to new parser
```

**Type Inference**: Handled by DuckDB's native type detection, mapped via `enrichColumns()`

### 2. DuckDB Integration

All data analysis uses **DuckDB WASM** (runs in main thread):

```typescript
import { Duck } from '$lib/features/duckdb';

// Query data (tables auto-created by dataPipeline)
const rows = await Duck.query(`SELECT * FROM ${tableName} WHERE value > 100`);

// Get row count
const count = await Duck.get_row_count(tableName);

// Analyze all columns (returns stats for each column)
const columns = await Duck.analyse(tableName);
// Returns: ColumnInfo[] with { name, type_simple, count, nulls, uniques, min, max, mean, median, stddev }

// Register files for DuckDB access
await Duck.register_files([file]);

// Read tabular data (CSV, etc.)
await Duck.read_tabular(file, { tablename: 'my_table' });

// Read geospatial files (GeoJSON, GeoParquet, etc.)
const tableName = await Duck.read_geofile(file, { tablename: 'geo_table' });
```

**DuckDB Service Location**: `src/lib/features/duckdb/` (modular functional architecture)

#### DuckDB Orchestrator (Advanced)

**DuckDB Orchestrator** provides reactive state management for advanced data operations:

```typescript
import { duckDBOrchestrator, RefineOperation } from '$lib/features/duckdb';

// Add dataset
duckDBOrchestrator.addDataset({
  id: dataset.id,
  tableName: dataset.tableName,
  columns: dataset.columns,
  rowCount: dataset.rowCount
});

// Add filter
duckDBOrchestrator.addFilter({
  column: 'population',
  operator: 'gte', // gte, lte, contains, equals, between, top_asc, top_desc, empty, not_empty
  value: 10000
});

// Apply column refinement
await duckDBOrchestrator.refineColumn('city', RefineOperation.UPPERCASE);
// Available: UPPERCASE, LOWERCASE, TITLECASE, TRIM, TRIM_ALL

// Access reactive filtered data
const filtered = duckDBOrchestrator.filteredData;
```

### 3. Basemaps (GeoArrow/GeoParquet)

Basemaps use **GeoArrow encoding** (not WKB), stored as GeoParquet files:

**Location**: `static/basemaps/`

- `all-basemaps-metadata.json` - Catalog with bbox, layers, metadata
- `all-basemaps-attributes.parquet` - Normalized table for joins (DuckDB)
- `geometry/[basemap-id].parquet` - Geometry files (GeoArrow encoding)

**Critical Requirements**:

- Geometry column MUST be named `geom`
- Use GeoArrow encoding (not WKB)
- ZSTD compression
- WGS84 projection (EPSG:4326) by default

### 4. Internationalization (Paraglide)

Type-safe i18n using **Inlang Paraglide**:

```typescript
import { m } from '$lib/paraglide/messages';

// In components
<h1>{m.project_create_title()}</h1>

// With parameters
<p>{m.file_uploaded_count({ count: 5 })}</p>
```

**Rules**:

- Never edit `src/lib/paraglide/` manually (auto-generated)
- Edit message files in `messages/en.json` and `messages/fr.json`
- Use semantic keys: `m.projectCreate()` not `m.label1()`
- No string concatenation - use message parameters

### 5. Security & Input Sanitization

Client-only architecture, but still sanitize all inputs:

```typescript
import {
  sanitizeFileName,
  sanitizeCSVCell
} from '$lib/features/commons/utils/validation.utils';

const safeFileName = sanitizeFileName('My Project! (2024).csv');
// → 'My_Project_2024.csv'

const safeCell = sanitizeCSVCell('=SUM(A1:A10)'); // Prevent formula injection
// → '\'=SUM(A1:A10)' (escaped)
```

**Storage Limits**: 50MB file, 100MB project, 50 projects max

### 6. Visualization Types & Classification

**Viz Types**: choropleth, proportional, categorical, bivariate, facets

**Classification Methods**:

- Equal Interval: `(max - min) / k` uniform ranges
- Quantile: Equal-count bins with tie handling
- Jenks: Natural breaks (⚠️ falls back to Quantile if needed)
- Std Deviation: `mean ± n×σ` bands
- Manual: User-specified breaks

**Default**: 5 classes (recommended range: 3-9)

## Component Structure Pattern

**Standard Svelte component template**:

```svelte
<script lang="ts">
  // 1. Imports
  import { Component } from 'carbon-components-svelte';
  import { store } from './store.svelte';
  import { m } from '$lib/paraglide/messages';
  import type { Props } from './types';

  // 2. Props interface + destructuring
  interface Props {
    title: string;
    onClose?: () => void;
  }
  const { title, onClose }: Props = $props();

  // 3. Local state
  let localState = $state(0);

  // 4. Derived values
  const computed = $derived(localState * 2);

  // 5. Effects
  $effect(() => {
    // Side effects, cleanup in return
  });

  // 6. Functions
  function handleClick() {
    // Logic
  }
</script>

<!-- 7. Template with i18n -->
<div class="component-wrapper">
  <h1>{m.component_title()}</h1>
</div>

<!-- 8. Styles (scoped by default) -->
<style>
  .component-wrapper {
    /* Styles */
  }
</style>
```

## Common Workflows

### Adding a New Tool

1. Create `src/lib/features/step-toolbar/tools/<tool-name>/`
2. Implement store: `<tool-name>.store.svelte.ts` (follow pattern above)
3. Create UI: `<tool-name>.svelte` component
4. Add types: `<tool-name>.types.ts`
5. Register in toolbar navigation
6. Add i18n keys: `tool_<tool-name>_*` in `messages/en.json` and `messages/fr.json`

**Real examples**: `annotations`, `layers`, `legend`, `simplification`, `color-blindness`

### Reading Project Data

```typescript
import { projectStore } from '$lib/features/commons/store/project.store.svelte';

const project = projectStore.currentProject;
const datasets = project?.data?.sourceFiles;
const projectName = projectStore.projectName;
const isDirty = projectStore.isDirty;
```

### Error Handling Pattern

```typescript
import {
  DataValidationError,
  DuckDBError
} from '$lib/features/commons/errors/pipeline.errors';

try {
  await dataPipeline.processFile(file);
} catch (error) {
  if (error instanceof DataValidationError) {
    showNotification(error.message, 'error');
  } else if (error instanceof DuckDBError) {
    logger.error('DuckDB query failed', error);
  } else {
    throw error; // Re-throw unknown errors
  }
}
```

## Golden Rules (Non-Negotiable)

1. **No `any`** - TypeScript strict mode is enabled, type everything
2. **No comments** unless required - code should be self-documenting
3. **No magic strings** - use constants, enums, or type literals
4. **No direct state mutation** - only through explicit action methods
5. **No `console.log`** - use `logger` from `$lib/features/commons/utils/logger`
6. **Use pnpm** - never npm or other package managers
7. **Use Carbon Design System** - import from `carbon-components-svelte`
8. **Use Paraglide i18n** - all visible text must use `m.key()` messages
9. **Client-only** - user data never leaves the browser
10. **Prefer functions over classes** - use pure functions + module-level state. Exceptions: Svelte stores (need `$state`) and mutex patterns. Never use classes just for namespacing.

## Testing

```bash
# Unit tests (Vitest) - fast logic checks
pnpm test:unit src/path/to/file.test.ts

# E2E tests (Playwright) - critical user flows
pnpm test:e2e e2e/critical-flows.spec.ts
pnpm test:e2e:ui  # Interactive UI mode
```

**Test files**: `*.test.ts` or `*.spec.ts` (Vitest), `*.spec.ts` (Playwright in `e2e/`)

## Key Documentation

- `docs/ARCHITECTURE.md` - System design and principles
- `docs/DATA_PIPELINE.md` - SOLID/DDD data processing architecture
- `docs/DEVELOPER_GUIDE.md` - Onboarding and golden rules
- `docs/STATE_AND_FEATURES.md` - State management patterns
- `CLAUDE.md` - Comprehensive reference (869 lines, read for deep context)

## Common Pitfalls to Avoid

1. **Don't** mutate store `_state` directly - use action methods
2. **Don't** use Svelte 4 writable stores - use Svelte 5 runes (`$state`, `$derived`)
3. **Don't** edit `src/lib/paraglide/` manually - it's auto-generated
4. **Don't** use WKB encoding for basemaps - must be GeoArrow
5. **Don't** run heavy computations in main thread without debouncing
6. **Don't** forget to sanitize user inputs (file names, CSV cells, text inputs)
7. **Don't** use external parsers - use DuckDB native functions (`read_csv()`, `ST_Read()`)

## Performance Targets

- **Load time**: <3s on typical device
- **Interaction**: ~60fps pan/zoom
- **Classification**: <1s recompute
- **File import**: <10s for large files (>5k rows)

**Optimization strategies**: Code splitting (lazy load libraries), memoization (palettes, breaks), debounced recompute, LOD for geometry.
