# Technical Reference

> **Types, utilities, performance, accessibility, and cross-cutting concerns**

## Core Type Definitions

### Project Types

```ts
interface KhartisProject {
  id: string;
  manifest: {
    version: string; // '3.0.0'
    createdAt: Date;
    updatedAt: Date;
    name: string;
    author?: string;
    description?: string;
    format: 'kh' | 'khartis';
  };
  data: {
    sourceFiles: UploadedFile[];
    processedData?: any;
    joinedData?: any;
    basemap?: BasemapConfig;
  };
  visualization?: VisualizationConfig;
  layout?: LayoutConfig;
  resources?: Record<string, any>;
}

interface SavedProjectMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  description?: string;
  size: number; // Bytes
}
```

### Data Types

```ts
interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content?: ArrayBuffer | string;
  parsedData?: any[];
  fileType: FileType;
  status: 'uploading' | 'processing' | 'complete' | 'error';
  errorMessage?: string;
  relatedFiles?: string[]; // Shapefile components
  validation?: FileValidation;
  statistics?: DataStatistics;
}

interface ProcessedDataset {
  id: string;
  name: string;
  columns: DataColumn[];
  rowCount: number;
  geometry?: GeometryInfo;
}

interface DataColumn {
  name: string;
  type: ColumnType; // 'text' | 'numeric' | 'date' | 'boolean' | 'geometry'
  stats?: ColumnStats;
}

interface ColumnStats {
  min?: number;
  max?: number;
  mean?: number;
  nullCount: number;
  uniqueCount: number;
}
```

### Visualization Types

```ts
interface VisualizationConfig {
  id: string;
  datasetId: string;
  type: 'choropleth' | 'proportional' | 'categorical' | 'bivariate' | 'facets';
  classification?: Classification;
  color?: ColorConfig;
  proportional?: SymbolConfig;
  categorical?: CategoryConfig;
  bivariate?: BivariateConfig;
}

interface Classification {
  method: 'equal-interval' | 'quantile' | 'jenks' | 'stddev' | 'manual';
  classes: number; // 3-9 recommended
  breaks: number[];
}

type ColumnType = 'text' | 'numeric' | 'date' | 'boolean' | 'geometry';
```

### File Types

```ts
enum FileType {
  CSV = 'csv',
  TSV = 'tsv',
  GEOJSON = 'geojson',
  SHAPEFILE = 'shapefile',
  GEOPACKAGE = 'geopackage',
  KML = 'kml', // Planned
  KMZ = 'kmz', // Planned
  UNKNOWN = 'unknown'
}
```

## Utility Functions

### Validation & Sanitization

| Function               | Purpose                      | Usage                           |
| ---------------------- | ---------------------------- | ------------------------------- |
| `validateProjectName`  | Name constraints             | Max 100 chars, no special chars |
| `checkStorageQuota`    | Estimate remaining storage   | Before save                     |
| `sanitizeFileName`     | Safe portable filename       | Export file names               |
| `sanitizeCSVCell`      | Neutralize formula injection | Leading `=`, `+`, `-`, `@`      |
| `sanitizeNumericInput` | Replace NaN/Infinity         | Numeric validation              |
| `sanitizeTextInput`    | Trim + collapse whitespace   | Text inputs                     |

**Example:**

```ts
import {
  sanitizeFileName,
  sanitizeCSVCell
} from '$lib/features/commons/utils/validation.utils';

const safeFileName = sanitizeFileName('My Project! (2024).csv');
// → 'My_Project_2024.csv'

const safeCell = sanitizeCSVCell('=SUM(A1:A10)');
// → '\'=SUM(A1:A10)' (escaped)
```

### Pipeline Helpers

- **Type detection**: Infer column types from sample data
- **Stats accumulation**: Streaming min/max/mean/count
- **Geometry bounds**: Calculate bbox from features
- **Filtering**: Apply column filters
- **Aggregation**: Group-by operations

### Caching Pattern

```ts
// Map keyed by deterministic hash
const cache = new Map<string, CachedValue>();

// Cache key from config
const key = hashConfig(config);

// Check cache
if (cache.has(key)) {
  return cache.get(key);
}

// Compute and cache
const result = expensiveOperation(config);
cache.set(key, result);

// Clear on invalidation
datasetMutation.subscribe(() => cache.clear());
```

### Error Classes

```ts
class DataValidationError extends Error {
  constructor(
    message: string,
    public details?: any
  ) {
    super(message);
  }
}

class ExpressionError extends Error {}
class SizeLimitError extends Error {}
class FileGroupError extends Error {}
```

**Usage:**

```ts
try {
  validateData(dataset);
} catch (error) {
  if (error instanceof DataValidationError) {
    showNotification(error.message, 'error');
  }
}
```

## Performance Strategy

### Current Implementation

| Aspect          | Strategy                                                    |
| --------------- | ----------------------------------------------------------- |
| **Load**        | Code splitting, lazy heavy libs (Deck.gl, MapLibre, DuckDB) |
| **Compute**     | Main thread (classification, joins)                         |
| **DuckDB**      | WASM in main thread                                         |
| **Interaction** | Debounce + preview LOD                                      |
| **Rendering**   | Attribute packing, minimal redraws                          |
| **Caching**     | Palette + basic breaks reuse                                |

### Planned Optimizations

| Aspect          | Enhancement                           |
| --------------- | ------------------------------------- |
| **Load**        | Bundle budget CI gate                 |
| **Compute**     | Worker pool + transferable buffers    |
| **DuckDB**      | Dedicated worker + SharedArrayBuffer  |
| **Interaction** | Predictive precompute                 |
| **Rendering**   | GPU instancing refinements            |
| **Caching**     | Formal cache with invalidation hashes |

### Performance Targets

- **Load time**: <3s on typical device
- **Interaction**: ~60fps pan/zoom
- **Classification**: <1s recompute
- **File import**: <10s for large files (>5k rows)

### Monitoring (Future)

- Long task tracking
- Frame pacing sampling
- Bundle size CI gate
- Lighthouse budget check

## Accessibility

### Keyboard Navigation

- **Tab**: Navigate focusable elements
- **Enter/Space**: Activate buttons, toggles
- **Escape**: Close modals, dropdowns
- **Arrow keys**: Navigate lists, toolbars

### Visual Accessibility

- **Focus ring**: Visible on all interactive elements
- **Contrast**: WCAG AA minimum (4.5:1 text, 3:1 UI)
- **Color palettes**: Accessibility filter flags unsafe combos
- **Non-color encoding**: Patterns, shapes for color-blind users

### Screen Readers

- **Textual summaries**: Stats and map descriptions
- **ARIA labels**: All interactive elements
- **Semantic HTML**: Proper heading structure

## Security & Privacy

### Client-Only Architecture

- **No server upload**: All processing in browser
- **No external APIs**: User data stays local
- **No tracking**: No analytics on user data

### Input Sanitization

- **Filenames**: Remove dangerous characters
- **CSV cells**: Escape formula injection (`=`, `+`, `-`, `@`)
- **User inputs**: Trim, validate, escape
- **File uploads**: Extension and MIME type validation

### Size Quotas

| Limit             | Value  | Enforcement                   |
| ----------------- | ------ | ----------------------------- |
| **File size**     | 50 MB  | Hard limit (validation error) |
| **Project size**  | 100 MB | Warning at 80%, error at 100% |
| **Project count** | 50     | Warning at 80%                |

### Dependency Auditing

- Regular `npm audit` checks
- Update vulnerable dependencies
- Review supply chain security

**Not Applicable**: CSRF, server auth, multi-tenant isolation (client-only app)

## Internationalization (i18n)

### Paraglide Integration

**Compile-time messages**: Type-safe, zero runtime overhead

```ts
import * as m from '$paraglide/messages';

// Use in components
<button>{m.projectCreate()}</button>

// With parameters
<p>{m.fileSize({ size: formatBytes(bytes) })}</p>
```

### Supported Locales

- **English** (en): Default
- **French** (fr): Full translation

### Message Keys

- **Semantic naming**: `m.projectCreate()` not `m.button1()`
- **No concatenation**: Use parameters instead
- **Namespace by feature**: `tool_legend_title`, `validation_error_size`

### Adding Translations

1. Add key to `messages/en.json` and `messages/fr.json`
2. Use `m.yourKey()` in code
3. Paraglide auto-generates TypeScript types

## Logger

**Development only**: Stripped in production build

```ts
import { logger } from '$lib/features/commons/utils/logger';

logger.debug('Debug info');
logger.info('Info message');
logger.warn('Warning');
logger.error('Error', error);
```

**Levels**: DEBUG, INFO, WARN, ERROR

**Rule**: No `console.log` in production code (use logger instead)

## Storage Limits (Default Values)

| Limit                 | Value  | Warning Threshold |
| --------------------- | ------ | ----------------- |
| **Max file size**     | 50 MB  | 25 MB             |
| **Max project size**  | 100 MB | 80 MB             |
| **Max project count** | 50     | 40                |

## Glossary

| Term                     | Definition                                              |
| ------------------------ | ------------------------------------------------------- |
| **Aggregation**          | Grouping and summarizing data (e.g., sum, average)      |
| **Basemap**              | Background map layer (e.g., world countries, terrain)   |
| **Bivariate**            | Visualization combining two variables                   |
| **Choropleth**           | Map with regions colored by data values                 |
| **Classification**       | Method to divide data into classes/bins                 |
| **CRS**                  | Coordinate Reference System (e.g., WGS84, Web Mercator) |
| **Dataset**              | Processed data with columns and rows                    |
| **Deck.gl Layer**        | GPU-accelerated visualization layer                     |
| **Facet**                | Small multiple map for comparison                       |
| **Geometry**             | Geographic shapes (point, line, polygon)                |
| **Jenks**                | Natural breaks classification (optimal binning)         |
| **Join**                 | Merging datasets by common key                          |
| **LOD**                  | Level of Detail (geometry simplification)               |
| **Projection**           | Method to flatten 3D Earth onto 2D map                  |
| **Proportional Symbols** | Sized markers based on data values                      |
| **Quantile**             | Equal-count classification (balanced bins)              |
| **Simplification**       | Reducing geometry complexity for performance            |
| **Worker**               | Web Worker for background processing                    |

## Extension Guidelines

### Keep Utilities Pure

- No side effects
- Deterministic output
- No DOM manipulation
- No global state

### Promote to Commons

- Only after reuse in 2+ features
- Well-tested
- Well-documented
- Generic enough for reuse

### Avoid Data + DOM Mixing

- Data utilities → `utils/`
- DOM utilities → `components/` or `actions/`
- Keep concerns separated

---

**See also:**

- [ARCHITECTURE.md](ARCHITECTURE.md) - Overall design principles
- [DATA_PIPELINE.md](DATA_PIPELINE.md) - Data processing utilities
- [STATE_AND_FEATURES.md](STATE_AND_FEATURES.md) - State management patterns
