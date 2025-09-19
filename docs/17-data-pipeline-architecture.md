# Data Pipeline Architecture

## Overview

The data pipeline provides a comprehensive system for processing, analyzing, and transforming data as it flows through Khartis. Built on **DuckDB WASM with spatial extensions**, it acts as the bridge between raw imported data and visualization-ready datasets, processing everything client-side for complete data privacy.

## Core Technologies

- **DuckDB WASM 1.29.1** - In-browser analytical database
- **DuckDB Spatial Extension** - Geographic data processing
- **Apache Arrow** - Columnar data format
- **SQL Macros** - Reusable analysis functions

See [DuckDB Integration Documentation](20-duckdb-integration.md) for detailed implementation.

## Architecture Components

### 1. Data Pipeline Utils (`data-pipeline.utils.ts`)

Core processing functions for data transformation and analysis:

```typescript
export interface DataColumn {
  name: string;
  type: 'text' | 'numeric' | 'date' | 'boolean' | 'geometry';
  nullable: boolean;
  unique: boolean;
  stats?: ColumnStats;
}

export interface ProcessedDataset {
  id: string;
  name: string;
  data: any[];
  columns: DataColumn[];
  rowCount: number;
  metadata: DatasetMetadata;
  geometry?: GeometryInfo;
}
```

### 2. Type Detection System

Automatic column type detection with configurable sampling:

```typescript
export function detectColumnType(values: any[]): DataColumn['type'] {
  const sampleSize = Math.min(100, values.length);
  const samples = values.slice(0, sampleSize).filter(v => v != null);

  if (samples.length === 0) return 'text';

  // Check for boolean values
  if (samples.every(v =>
    typeof v === 'boolean' ||
    ['true', 'false', 'yes', 'no', '0', '1'].includes(String(v).toLowerCase())
  )) {
    return 'boolean';
  }

  // Check for dates
  if (samples.every(v => !isNaN(Date.parse(String(v))))) {
    return 'date';
  }

  // Check for numbers
  if (samples.every(v => !isNaN(Number(v)))) {
    return 'numeric';
  }

  // Check for geometry
  if (samples.some(v =>
    v && typeof v === 'object' &&
    ('type' in v || 'coordinates' in v)
  )) {
    return 'geometry';
  }

  return 'text';
}
```

### 3. Column Analysis

Comprehensive statistical analysis for each column:

```typescript
export function analyzeColumn(
  values: any[],
  type: DataColumn['type']
): ColumnStats {
  const nonNullValues = values.filter(v => v != null);

  const stats: ColumnStats = {
    count: values.length,
    nullCount: values.length - nonNullValues.length,
    uniqueCount: new Set(nonNullValues).size
  };

  if (type === 'numeric') {
    const numbers = nonNullValues.map(Number).filter(n => !isNaN(n));
    if (numbers.length > 0) {
      stats.min = Math.min(...numbers);
      stats.max = Math.max(...numbers);
      stats.mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
      stats.median = calculateMedian(numbers);
      stats.stdDev = calculateStdDev(numbers, stats.mean);
    }
  }

  if (type === 'text') {
    const categories = new Map<string, number>();
    nonNullValues.forEach(v => {
      const key = String(v);
      categories.set(key, (categories.get(key) || 0) + 1);
    });
    stats.categories = Array.from(categories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([value, count]) => ({ value, count }));
  }

  if (type === 'date') {
    const dates = nonNullValues.map(v => new Date(v).getTime());
    if (dates.length > 0) {
      stats.minDate = new Date(Math.min(...dates));
      stats.maxDate = new Date(Math.max(...dates));
    }
  }

  return stats;
}
```

### 4. Dataset Processing

Main processing function that orchestrates the pipeline:

```typescript
export async function processDataset(
  input: DatasetInput
): Promise<ProcessedDataset> {
  const { data, name, source } = input;

  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error('Invalid or empty dataset');
  }

  // Extract column names
  const columnNames = Object.keys(data[0]);

  // Process each column
  const columns: DataColumn[] = columnNames.map(name => {
    const values = data.map(row => row[name]);
    const type = detectColumnType(values);
    const stats = analyzeColumn(values, type);

    return {
      name,
      type,
      nullable: stats.nullCount > 0,
      unique: stats.uniqueCount === stats.count - stats.nullCount,
      stats
    };
  });

  // Process geometry if present
  let geometryInfo: GeometryInfo | undefined;
  const geomColumn = columns.find(c => c.type === 'geometry');

  if (geomColumn) {
    geometryInfo = processGeometry(
      data.map(row => row[geomColumn.name])
    );
  }

  // Generate metadata
  const metadata: DatasetMetadata = {
    source,
    processedAt: new Date(),
    columnCount: columns.length,
    rowCount: data.length,
    hasGeometry: !!geometryInfo
  };

  return {
    id: input.id || generateId(),
    name,
    data,
    columns,
    rowCount: data.length,
    metadata,
    geometry: geometryInfo
  };
}
```

### 5. Geometry Processing

Spatial data handling and analysis:

```typescript
export function processGeometry(geometries: any[]): GeometryInfo {
  const validGeometries = geometries.filter(g => g && g.type);

  if (validGeometries.length === 0) {
    throw new Error('No valid geometries found');
  }

  const types = new Set(validGeometries.map(g => g.type));
  const bounds = calculateBounds(validGeometries);
  const centroid = calculateCentroid(validGeometries);

  return {
    types: Array.from(types),
    bounds,
    centroid,
    count: validGeometries.length,
    crs: 'EPSG:4326' // Default to WGS84
  };
}
```

## Integration with Stores

### Datasets Store

Central repository for processed datasets:

```typescript
class DatasetsStore {
  private _datasets = $state<ProcessedDataset[]>([]);

  addDataset(dataset: ProcessedDataset): void {
    const existing = this._datasets.findIndex(d => d.id === dataset.id);
    if (existing !== -1) {
      this._datasets[existing] = dataset;
    } else {
      this._datasets.push(dataset);
    }

    // Notify visualization system
    visualizationStore.suggestVisualizations(dataset);

    // Update projection if geographic
    if (dataset.geometry) {
      projectionActions.suggestProjectionForCurrentData();
    }
  }

  updateColumn(
    datasetId: string,
    columnName: string,
    updates: Partial<DataColumn>
  ): void {
    const dataset = this._datasets.find(d => d.id === datasetId);
    if (dataset) {
      const column = dataset.columns.find(c => c.name === columnName);
      if (column) {
        Object.assign(column, updates);
        // Re-analyze if type changed
        if (updates.type) {
          const values = dataset.data.map(row => row[columnName]);
          column.stats = analyzeColumn(values, updates.type);
        }
      }
    }
  }
}
```

## Data Flow

### 1. Import Phase
```
File Import → Parse → Initial Validation → Data Pipeline
```

### 2. Processing Phase
```
Data Pipeline → Type Detection → Column Analysis → Dataset Creation
```

### 3. Storage Phase
```
Dataset Store → Visualization Suggestions → Layer Creation → Projection Setup
```

### 4. Export Phase
```
Dataset Store → Transformation → Format Conversion → File Export
```

## Transformation Operations

### Filter Operations

```typescript
export function applyFilter(
  data: any[],
  filter: DataFilter
): any[] {
  const { column, operator, value } = filter;

  return data.filter(row => {
    const cellValue = row[column];

    switch (operator) {
      case 'equals':
        return cellValue === value;
      case 'contains':
        return String(cellValue).includes(String(value));
      case 'greater_than':
        return Number(cellValue) > Number(value);
      case 'less_than':
        return Number(cellValue) < Number(value);
      case 'between':
        return Number(cellValue) >= value[0] &&
               Number(cellValue) <= value[1];
      case 'is_null':
        return cellValue == null;
      case 'is_not_null':
        return cellValue != null;
      default:
        return true;
    }
  });
}
```

### Aggregation Operations

```typescript
export function aggregateData(
  data: any[],
  groupBy: string,
  aggregations: AggregationConfig[]
): any[] {
  const groups = new Map<string, any[]>();

  // Group data
  data.forEach(row => {
    const key = row[groupBy];
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(row);
  });

  // Apply aggregations
  return Array.from(groups.entries()).map(([key, rows]) => {
    const result: any = { [groupBy]: key };

    aggregations.forEach(agg => {
      const values = rows.map(r => r[agg.column]);
      result[agg.alias || agg.column] =
        calculateAggregation(values, agg.function);
    });

    return result;
  });
}
```

### Calculated Fields

```typescript
export function addCalculatedField(
  data: any[],
  fieldName: string,
  expression: string
): any[] {
  return data.map(row => ({
    ...row,
    [fieldName]: evaluateExpression(expression, row)
  }));
}
```

## Performance Optimizations

### 1. Lazy Processing
- Process only visible data initially
- Background processing for large datasets
- Progressive enhancement of statistics

### 2. Caching Strategy
```typescript
class DataCache {
  private cache = new Map<string, CacheEntry>();

  get(key: string): any {
    const entry = this.cache.get(key);
    if (entry && !this.isExpired(entry)) {
      return entry.data;
    }
    return null;
  }

  set(key: string, data: any, ttl: number = 300000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }
}
```

### 3. Memory Management
- Stream processing for large files
- Incremental garbage collection
- Virtual scrolling for data tables

## Error Handling

### Validation Errors
```typescript
export class DataValidationError extends Error {
  constructor(
    message: string,
    public column?: string,
    public row?: number
  ) {
    super(message);
    this.name = 'DataValidationError';
  }
}
```

### Recovery Strategies
- Automatic type correction
- Missing value imputation
- Outlier detection and handling
- Encoding detection and conversion

## Metadata Schema

### Dataset Metadata
```typescript
interface DatasetMetadata {
  source: {
    type: 'file' | 'url' | 'paste' | 'database';
    fileName?: string;
    url?: string;
    fileSize?: number;
  };
  processedAt: Date;
  columnCount: number;
  rowCount: number;
  hasGeometry: boolean;
  encoding?: string;
  delimiter?: string;
  transformations?: Transformation[];
}
```

### Column Metadata
```typescript
interface ColumnStats {
  count: number;
  nullCount: number;
  uniqueCount: number;

  // Numeric columns
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  stdDev?: number;

  // Text columns
  categories?: Array<{ value: string; count: number }>;
  maxLength?: number;
  minLength?: number;

  // Date columns
  minDate?: Date;
  maxDate?: Date;

  // Geometry columns
  geometryTypes?: string[];
  bounds?: [number, number, number, number];
}
```

## Future Enhancements

### Planned Features
1. **Machine Learning Integration** - Automatic pattern detection
2. **Data Profiling** - Advanced quality metrics
3. **Schema Inference** - Automatic relationship detection
4. **Data Lineage** - Track transformation history
5. **Real-time Processing** - Stream processing support

### Performance Goals
- Process 1M rows in < 5 seconds
- Support datasets up to 1GB
- Real-time type detection
- Incremental statistics updates

## Testing Strategy

### Unit Tests
```typescript
describe('Data Pipeline', () => {
  test('detects column types correctly', () => {
    const values = [1, 2, 3, 4, 5];
    expect(detectColumnType(values)).toBe('numeric');
  });

  test('handles mixed types', () => {
    const values = [1, 'text', 3, null, 5];
    expect(detectColumnType(values)).toBe('text');
  });

  test('calculates statistics accurately', () => {
    const values = [1, 2, 3, 4, 5];
    const stats = analyzeColumn(values, 'numeric');
    expect(stats.mean).toBe(3);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(5);
  });
});
```

### Integration Tests
- File import to dataset creation
- Transformation pipeline
- Export with transformations
- Performance benchmarks