# Data Pipeline

> **Data import, validation, processing, and export workflows**

## Supported Formats

| Format | Extensions | Features |
|--------|-----------|----------|
| **CSV/TSV** | `.csv`, `.tsv` | Tabular data, auto-type inference |
| **GeoJSON** | `.geojson`, `.json` | Spatial data, geometry support |
| **Shapefile** | `.shp` + `.shx` + `.dbf` + `.prj` (optional) | Multi-file geometry + attributes |
| **GeoPackage** | `.gpkg` | SQLite-based spatial data (experimental) |

## Dual Processing Architecture

Data flows through **two complementary systems**:

### 1. JavaScript Processing (DatasetsStore)
- Immediate parsing and type inference
- Basic statistics (min, max, mean, counts)
- In-memory data storage
- Direct visualization binding

### 2. DuckDB Analytical Engine
- SQL-based advanced analysis
- Efficient aggregations and joins
- Classification break calculations
- Column profiling

## Import Workflow

```
File Input → Basic Validation → Deep Analysis → Parsing
  ↓
Type Inference → Statistics → Geometry Detection
  ↓
Dataset Store + DuckDB Table → Catalog Matching → Ready for Visualization
```

### Step-by-Step

1. **File Grouping**: Detect shapefile components (.shp, .shx, .dbf, .prj)
2. **Basic Validation**: Size limits (50MB/file, 100MB/project), extension checks
3. **Deep Validation**: Content analysis, geographic column detection, quality assessment
4. **Parsing**:
   - CSV/TSV → PapaParse streaming
   - GeoJSON → Native JSON + geometry extraction
   - Shapefile → Convert to GeoJSON
5. **Dual Processing**:
   - **DatasetsStore**: Type inference → stats → store
   - **DuckDB**: Create table → analyze → prepare SQL queries
6. **Type Inference**: boolean → date → numeric → geometry → text (in order)
7. **Statistics**: Compute min/max/mean/counts (median/stdDev on-demand via DuckDB)
8. **Catalog Matching**: Match geographic columns to reference catalogs

## Validation System

### Three Validation Layers

#### Layer 1: Basic File Validation
- **Size limits**: 50MB per file, 100MB total project
- **Extensions**: Whitelist of supported formats
- **MIME types**: Verify content matches extension
- **Magic numbers**: Binary format verification
- **Filename sanitization**: Remove dangerous characters

#### Layer 2: Deep Data Analysis
- **Column type detection**: Numeric, text, date, boolean, mixed
- **Statistics**: Min, max, mean, median, stddev
- **Null values**: Detect and report percentage
- **Duplicates**: Identify duplicate rows
- **Performance warnings**: >10k rows or >100 columns

**Performance Thresholds:**
| Metric | Warning | Error |
|--------|---------|-------|
| Rows | 5,000 | 10,000 |
| Columns | 50 | 100 |
| File Size | - | 50MB |

#### Layer 3: Geographic Detection
Auto-detect geographic columns by:
- **Name patterns**: `country`, `region`, `iso2`, `iso3`, `lat`, `lon`, etc.
- **Value patterns**: ISO codes, coordinate formats
- **Sample matching**: Test values against known entities
- **Confidence scoring**: 0-1 match confidence

### Catalog Matching

**Features:**
- Exact match with normalization (accents, case, articles)
- Fuzzy matching (Levenshtein distance)
- Alternative names support (Paris/Paname, NYC/New York)
- Multi-language variants
- Match rate calculation

**Error Handling:**
- **Critical** (blocks creation): No geo columns, match rate <10%, file too large
- **Warnings** (allows with caution): High nulls (>50%), performance concerns, low confidence

## Type Inference

**Heuristic order** (stop early on match):
1. **Boolean**: `true`/`false`, `yes`/`no`, `0`/`1`
2. **Date**: ISO dates, common formats (DD/MM/YYYY, MM-DD-YYYY)
3. **Numeric**: Integers, floats, scientific notation
4. **Geometry**: WKT, GeoJSON, coordinate pairs
5. **Text**: Fallback for everything else

**Optimization**: Sample first N rows; full pass only if borderline

## Statistics Computation

### Ingest Phase (Automatic)
- Min, max, mean
- Null counts
- Unique value counts
- Row count

### On-Demand (DuckDB)
- Median
- Standard deviation
- Quantiles
- Histograms
- Category frequencies

## DuckDB Integration

### Table Creation

```sql
-- CSV import
CREATE TABLE dataset_name AS
SELECT * FROM read_csv_auto('file.csv');

-- GeoJSON spatial table
CREATE TABLE geo_dataset AS
SELECT * FROM ST_Read('file.geojson');
```

### Analysis Operations

```ts
// Column profiling
const stats = await Duck.analyse(tableName);

// Classification breaks
const breaks = await Duck.breaks(column, 'quantile', 5);

// Custom queries
const result = await Duck.query('SELECT * FROM table WHERE ...');
```

## Data Orchestration

### DataOrchestratorService

**Responsibilities:**
- Coordinate data flow between stores
- Process files on add/remove
- Create default visualizations
- Manage export workflows

**Key Flow:**
```
File Added → DataOrchestrator
  ├─→ DatasetsStore (parse + type + stats)
  ├─→ DuckDBOrchestrator (create table + analyze)
  ├─→ VisualizationStore (suggest default viz)
  └─→ UI sync (layers, projections)
```

**Auto-Visualization Logic:**
- Geometry + numeric → Choropleth
- Geometry + categorical → Categorical map
- Numeric only → Proportional symbols
- No suitable data → No visualization

## Export System

### Supported Export Formats

| Type | Formats | Use Case |
|------|---------|----------|
| **Map** | PNG, JPEG, SVG, PDF | Static images, print |
| **Data** | CSV, GeoJSON | Data portability |
| **Project** | `.kh` (JSON) | Save/load projects |

**Security:**
- Filename sanitization always applied
- CSV cells escaped if dangerous leading character
- Size limits enforced

## Performance Strategies

| Operation | Current | Planned |
|-----------|---------|---------|
| **Parsing** | Main thread (PapaParse) | Web Worker offload |
| **DuckDB** | Main thread WASM | Dedicated Worker + SharedArrayBuffer |
| **Type inference** | Single pass | Sampling + selective deep scan |
| **Statistics** | Single pass accumulation | Streaming quantile sketches |
| **Geometry** | Direct GeoJSON | DuckDB spatial functions |

**Targets**: <3s for typical files, <10s for large (>5k rows)

## Extension Points

### Add New File Format

```ts
// 1. Create parser
export async function parseMyFormat(file: File): Promise<RawDataset> {
  // Parse logic
  return { columns, rows };
}

// 2. Register parser
ParserRegistry.register('myformat', {
  extensions: ['.myext'],
  parse: parseMyFormat,
  validate: validateMyFormat
});
```

### Add New Export Format

```ts
// 1. Create exporter
export async function exportToMyFormat(project: Project): Promise<Blob> {
  // Export logic
  return new Blob([data], { type: 'application/myformat' });
}

// 2. Register exporter
ExportRegistry.register('myformat', {
  id: 'myformat',
  label: 'My Format',
  export: exportToMyFormat
});
```

## Error Classes

```ts
class DataValidationError extends Error {}
class FileGroupError extends Error {}
class SizeLimitError extends Error {}
class ExpressionError extends Error {}
```

## Known Limitations & Roadmap

| Area | Current Status | Planned |
|------|----------------|---------|
| **Joins/Merges** | Not implemented | Conflict resolution + diff preview |
| **Workers** | Main thread processing | Offload parsing & classification |
| **Transformations** | Limited | Column calculator, filter, normalize |
| **Large files** | Memory-bound | Streaming + chunked processing |
| **Geometry stats** | Not computed | Lazy bounds/centroid calculation |

## Quick Reference

### File Validation
```ts
import { FileValidator } from '$lib/features/commons/utils/file-validator.utils';
const result = FileValidator.validate(file);
```

### Geographic Detection
```ts
import { GeoColumnDetector } from '$lib/features/commons/utils/geo-detector.utils';
const geo = await GeoColumnDetector.detectGeoColumns(columns, sampleData);
```

### Catalog Matching
```ts
import { GeoMatcher } from '$lib/features/commons/utils/geo-matcher.utils';
const matches = await GeoMatcher.validateAgainstCatalogue(data, catalog);
```

### DuckDB Operations
```ts
import { duckDBOrchestratorService } from '$lib/features/commons/services/duckdb-orchestrator.service';
await duckDBOrchestratorService.initialize();
const dataset = await duckDBOrchestratorService.processFile(file);
```

---

**See also:**
- [ARCHITECTURE.md](ARCHITECTURE.md) - Overall system design
- [VISUALIZATION.md](VISUALIZATION.md) - How data flows to rendering
- [REFERENCE.md](REFERENCE.md) - Type definitions
