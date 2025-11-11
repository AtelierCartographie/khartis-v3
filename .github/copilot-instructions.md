# Khartis v3 - AI Coding Agent Instructions

## Project Context

Khartis v3 is a **client-side thematic mapping application** built with SvelteKit 5 (Runes), TypeScript, and modern web technologies. All data processing happens in the browser for privacy - user data never leaves the client.

**Tech Stack**: SvelteKit 5 + TypeScript + Vite + DuckDB WASM + Deck.gl + MapLibre + Carbon Design System

## Essential Developer Commands

```bash
# Setup (first time only)
corepack enable          # Enable Yarn 4 via Corepack
yarn install             # Install dependencies

# Development workflow
yarn dev                 # Start dev server on port 5176
yarn check               # Svelte type checks (strict TypeScript enabled)
yarn lint                # Prettier + ESLint check
yarn format              # Auto-format with Prettier
yarn test:unit           # Vitest unit tests
yarn test:e2e            # Playwright E2E tests

# Production
yarn build               # Build for production (uses /cartographie/khartisnewpprd base path)
yarn preview             # Preview production build
```

**⚠️ Critical**: Always use Yarn 4 (via Corepack), never npm. TypeScript strict mode is enabled - no `any` types allowed.

## Architecture Overview

### Four Core Principles

1. **Client-only Privacy**: All processing in browser (IndexedDB + memory), no server upload
2. **Feature-first Modularity**: Self-contained features in `src/lib/features/`
3. **Svelte 5 Runes Reactive State**: `$state`, `$derived`, `$effect` (not Svelte 4 stores)
4. **GPU-first Rendering**: Deck.gl for thematic layers, MapLibre for basemaps

### Data Flow Pipeline

```
File Upload → ParserRegistry → Parse → ValidationChain → TypeInferrer → DuckDB → Stats → ProcessedDataset
                                                                          ↓
                                        Visualization Suggestion → User Config → Deck.gl Layers → GPU Rendering
```

**Key Insight**: Single-pass processing - files are parsed once, not 3 times like the old architecture. DuckDB WASM runs in main thread and provides SQL query capabilities for all data analysis.

### Feature-based Structure

```
src/lib/
├── features/           # Feature-based architecture (DDD principles)
│   ├── commons/        # Shared: components, stores, services, utils, types
│   ├── data/           # Data pipeline (Domain-Driven Design)
│   │   ├── domain/         # Interfaces (IParser, IValidator, ITypeInferrer)
│   │   ├── application/    # Use cases (DataPipelineService facade)
│   │   └── infrastructure/ # Implementations (parsers, validators, type inference)
│   ├── create-project/ # Project creation modal
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
export class AnnotationsStore {
  // Private reactive state (NEVER expose directly)
  private _state = $state<AnnotationsState>({
    items: [],
    selectedId: null,
    activeType: 'text'
  });

  // Public getters (read-only access)
  get items() {
    return this._state.items;
  }
  get selectedId() {
    return this._state.selectedId;
  }

  // Derived state (computed from reactive state)
  get selectedItem() {
    return $derived(
      this._state.items.find((i) => i.id === this._state.selectedId)
    );
  }

  // Explicit mutation methods (NEVER mutate _state directly outside these)
  addItem(item: AnnotationType): void {
    this._state.items = [...this._state.items, item];
  }

  selectItem(id: string | null): void {
    this._state.selectedId = id;
  }

  removeItem(id: string): void {
    this._state.items = this._state.items.filter((i) => i.id !== id);
  }
}

// Singleton export
export const annotationsStore = new AnnotationsStore();
```

**Key Rules**:

- Use `.svelte.ts` extension for stores (required for runes outside `.svelte` files)
- Private `_state` with `$state()` - never expose directly
- Public getters for state access (no setters)
- `$derived()` for computed values
- Explicit action methods for mutations (clear names: `addItem`, `removeItem`, not `set`)
- Export singleton instance at bottom

## Critical Project-Specific Conventions

### 1. Data Pipeline (SOLID/DDD Architecture)

The data pipeline uses **Domain-Driven Design** with strict SOLID principles:

```typescript
// Usage (facade pattern hides complexity)
import { dataPipeline } from '$lib/features/data';

await dataPipeline.initialize(); // Initialize once at startup
const result = await dataPipeline.processFile(file); // Returns ProcessedDataset
```

**To add a new file parser**:

```typescript
// 1. Implement IParser interface in src/lib/features/data/infrastructure/parsers/
export class ExcelParser implements IParser {
  readonly supportedExtensions = ['.xlsx'];

  canParse(file: File): boolean {
    return file.name.endsWith('.xlsx');
  }

  async parse(file: File): Promise<RawDataset> {
    // Parse logic
  }
}

// 2. Register in ParserRegistry (auto-discovery pattern)
registry.register(new ExcelParser());
```

**Type Inference**: Priority order is Boolean → Date → Number → Geometry → Text (80% threshold on 100-row sample)

### 2. DuckDB Integration

All data analysis uses **DuckDB WASM** (runs in main thread):

```typescript
import { Duck } from '$lib/features/commons/services/duckdb/duckdb';

// Query data (tables auto-created by dataPipeline)
const rows = await Duck.query(`SELECT * FROM ${tableName} WHERE value > 100`);

// Calculate statistics
const analysis = await Duck.analyse(tableName, columnName);
// Returns: { min, max, mean, median, stddev, count, nulls, uniques }

// Calculate breaks for classification
const breaks = await Duck.calculateBreaks(tableName, columnName, 'quantile', 5);
```

**Key Insight**: No Web Workers for CSV parsing (caused message passing errors). PapaParse in main thread is fast enough, and type inference only samples 100 rows for large files.

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
6. **Use Yarn 4** - never npm or other package managers
7. **Use Carbon Design System** - import from `carbon-components-svelte`
8. **Use Paraglide i18n** - all visible text must use `m.key()` messages
9. **Client-only** - user data never leaves the browser

## Testing

```bash
# Unit tests (Vitest) - fast logic checks
yarn test:unit src/path/to/file.test.ts

# E2E tests (Playwright) - critical user flows
yarn test:e2e e2e/critical-flows.spec.ts
yarn test:e2e:ui  # Interactive UI mode
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
5. **Don't** run heavy computations in main thread without debouncing - impacts 60fps target
6. **Don't** forget to sanitize user inputs (file names, CSV cells, text inputs)
7. **Don't** create Web Workers for CSV parsing - use PapaParse in main thread

## Performance Targets

- **Load time**: <3s on typical device
- **Interaction**: ~60fps pan/zoom
- **Classification**: <1s recompute
- **File import**: <10s for large files (>5k rows)

**Optimization strategies**: Code splitting (lazy load libraries), memoization (palettes, breaks), debounced recompute, LOD for geometry.
