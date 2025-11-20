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

## Error Handling

### Error Class Hierarchy

Khartis v3 uses a hierarchical error system for precise error handling and recovery:

```typescript
// Base error class
export class KhartisError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = false,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

// Data processing errors
export class DataError extends KhartisError {
  constructor(message: string, details?: any) {
    super(message, 'DATA_ERROR', true, details);
  }
}

export class DataValidationError extends DataError {
  constructor(message: string, public errors: string[], public warnings: string[]) {
    super(message, { errors, warnings });
    this.code = 'DATA_VALIDATION_ERROR';
  }
}

export class DataParseError extends DataError {
  constructor(message: string, public line?: number, public column?: string) {
    super(message, { line, column });
    this.code = 'DATA_PARSE_ERROR';
  }
}

// DuckDB errors
export class DuckDBError extends KhartisError {
  constructor(message: string, public query?: string) {
    super(message, 'DUCKDB_ERROR', true, { query });
  }
}

export class DuckDBConnectionError extends DuckDBError {
  constructor(message: string) {
    super(message);
    this.code = 'DUCKDB_CONNECTION_ERROR';
    this.recoverable = false;
  }
}

// Visualization errors
export class VisualizationError extends KhartisError {
  constructor(message: string, public vizType?: string) {
    super(message, 'VIZ_ERROR', true, { vizType });
  }
}

export class ClassificationError extends VisualizationError {
  constructor(message: string, public method?: string, public data?: any) {
    super(message);
    this.code = 'CLASSIFICATION_ERROR';
    this.details = { method, data };
  }
}

// Storage errors
export class StorageError extends KhartisError {
  constructor(message: string, public operation?: string) {
    super(message, 'STORAGE_ERROR', false, { operation });
  }
}

export class QuotaExceededError extends StorageError {
  constructor(public used: number, public quota: number) {
    super(`Storage quota exceeded: ${used}/${quota} bytes`);
    this.code = 'QUOTA_EXCEEDED';
    this.recoverable = true; // Can recover by deleting old projects
  }
}
```

### Error Handling Patterns

#### 1. Try-Catch with Type Guards

```typescript
try {
  const dataset = await dataPipeline.processFile(file);
} catch (error) {
  if (error instanceof DataValidationError) {
    // Show validation errors to user
    error.errors.forEach(e => notificationStore.error(e));
    error.warnings.forEach(w => notificationStore.warning(w));
  } else if (error instanceof DuckDBError) {
    // Log technical error, show user-friendly message
    logger.error('DuckDB query failed', error);
    notificationStore.error('Failed to process data. Please try again.');
  } else if (error instanceof QuotaExceededError) {
    // Offer to clear old projects
    const shouldClear = await confirm('Storage full. Delete old projects?');
    if (shouldClear) {
      await projectStore.deleteOldProjects(30);
      // Retry operation
    }
  } else {
    // Unknown error
    logger.error('Unexpected error', error);
    notificationStore.error('An unexpected error occurred');
  }
}
```

#### 2. Error Boundaries (Svelte)

```svelte
<!-- ErrorBoundary.svelte -->
<script>
  import { onMount } from 'svelte';
  import { errorStore } from '$lib/stores';

  let hasError = false;
  let error = null;

  onMount(() => {
    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      hasError = true;
      error = event.reason;
      errorStore.capture(error);
      event.preventDefault();
    });

    // Catch uncaught errors
    window.addEventListener('error', (event) => {
      hasError = true;
      error = event.error;
      errorStore.capture(error);
      event.preventDefault();
    });
  });

  function reset() {
    hasError = false;
    error = null;
    errorStore.clear();
  }
</script>

{#if hasError}
  <div class="error-boundary">
    <h2>Something went wrong</h2>
    <p>{error?.message || 'Unknown error'}</p>
    <button on:click={reset}>Try Again</button>
  </div>
{:else}
  <slot />
{/if}
```

#### 3. Async Error Handling

```typescript
// Wrapper for async operations
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorMessage = 'Operation failed'
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    logger.error(errorMessage, error);
    notificationStore.error(errorMessage);
    return null;
  }
}

// Usage
const dataset = await withErrorHandling(
  () => dataPipeline.processFile(file),
  'Failed to import file'
);
```

#### 4. Validation with Result Type

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function validateDataset(data: any): Result<ProcessedDataset, DataValidationError> {
  const errors: string[] = [];

  if (!data.columns || data.columns.length === 0) {
    errors.push('Dataset must have at least one column');
  }

  if (!data.rows || data.rows.length === 0) {
    errors.push('Dataset must have at least one row');
  }

  if (errors.length > 0) {
    return {
      ok: false,
      error: new DataValidationError('Dataset validation failed', errors, [])
    };
  }

  return { ok: true, value: data as ProcessedDataset };
}

// Usage
const result = validateDataset(rawData);
if (!result.ok) {
  handleValidationError(result.error);
} else {
  processDataset(result.value);
}
```

### Error Recovery Strategies

| Error Type | Recovery Strategy | User Action Required |
| --- | --- | --- |
| **File Too Large** | Suggest file splitting | Split file or sample data |
| **Invalid Format** | Show format requirements | Fix file format |
| **Parse Error** | Show line/column | Fix data at specific location |
| **Type Mismatch** | Suggest type conversion | Convert or cast column |
| **Classification Fail** | Fallback to quantiles | Accept fallback or manual breaks |
| **Quota Exceeded** | Auto-delete old projects | Confirm deletion |
| **Network Error** | Retry with backoff | Wait or retry manually |
| **Worker Crash** | Fallback to main thread | None (automatic) |
| **Memory Error** | Clear caches and retry | Reduce dataset size |
| **Projection Error** | Use default projection | Select different projection |

### Error Monitoring

```typescript
class ErrorMonitor {
  private errors: Map<string, number> = new Map();
  private readonly threshold = 5;
  private readonly window = 60000; // 1 minute

  track(error: Error): void {
    const key = `${error.name}:${error.message}`;
    const count = (this.errors.get(key) || 0) + 1;
    this.errors.set(key, count);

    // Alert if error frequency is too high
    if (count >= this.threshold) {
      this.alertHighFrequency(error);
    }

    // Clear old errors
    setTimeout(() => {
      this.errors.delete(key);
    }, this.window);
  }

  private alertHighFrequency(error: Error): void {
    logger.warn(`High error frequency detected: ${error.name}`, {
      message: error.message,
      count: this.errors.get(`${error.name}:${error.message}`)
    });
  }
}

export const errorMonitor = new ErrorMonitor();
```

### User-Friendly Error Messages

```typescript
// Map technical errors to user-friendly messages
const ERROR_MESSAGES: Record<string, string> = {
  'ENOENT': 'File not found. Please check the file path.',
  'EACCES': 'Permission denied. Please check file permissions.',
  'EMFILE': 'Too many files open. Please close some files and try again.',
  'ENOMEM': 'Out of memory. Please try with a smaller dataset.',
  'ETIMEDOUT': 'Operation timed out. Please check your connection and try again.',
  'ECONNREFUSED': 'Connection refused. Please check if the service is running.',
  'DataCloneError': 'Cannot process this data type. Please use a different format.',
  'QuotaExceededError': 'Storage limit reached. Please delete old projects.',
  'NetworkError': 'Network connection lost. Please check your internet connection.',
};

export function getUserMessage(error: Error): string {
  // Check for known error codes
  if ('code' in error && error.code in ERROR_MESSAGES) {
    return ERROR_MESSAGES[error.code];
  }

  // Check for error name
  if (error.name in ERROR_MESSAGES) {
    return ERROR_MESSAGES[error.name];
  }

  // Default message
  return 'An unexpected error occurred. Please try again or contact support.';
}
```

### Error Logging

```typescript
interface ErrorLog {
  timestamp: Date;
  message: string;
  stack?: string;
  code?: string;
  context?: any;
  userAgent: string;
  url: string;
}

class ErrorLogger {
  private logs: ErrorLog[] = [];
  private readonly maxLogs = 100;

  log(error: Error, context?: any): void {
    const log: ErrorLog = {
      timestamp: new Date(),
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
      context,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    this.logs.push(log);

    // Trim old logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Send to console in development
    if (import.meta.env.DEV) {
      console.error('Error logged:', log);
    }
  }

  export(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  clear(): void {
    this.logs = [];
  }
}

export const errorLogger = new ErrorLogger();
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
