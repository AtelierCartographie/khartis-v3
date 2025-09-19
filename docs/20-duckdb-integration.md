# DuckDB Integration

## Overview

DuckDB WASM with spatial extension serves as the core data processing engine for Khartis v3, providing SQL-based analytics directly in the browser. This integration enables processing of large datasets without server-side dependencies.

## Architecture

### Core Components

```typescript
// Main DuckDB interface
src/lib/features/commons/services/duckdb/duckdb.ts
src/lib/features/commons/services/duckdb-orchestrator.service.ts

// SQL Macros
src/lib/features/commons/services/duckdb/analyse.ts
src/lib/features/commons/services/duckdb/breaks.ts
src/lib/features/commons/services/duckdb/join.ts

// Type definitions
src/lib/features/commons/services/duckdb/types/index.ts
```

### Initialization

```typescript
class DuckDB {
  private ready_promise: Promise<void>;
  private _db?: AsyncDatabaseConnection;
  private _instance?: AsyncDuckDB;

  constructor() {
    this.ready_promise = this.init();
  }

  private async init(): Promise<void> {
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

    const worker_url = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker!}");`], {
        type: 'text/javascript'
      })
    );

    const worker = new Worker(worker_url);
    const logger = new duckdb.ConsoleLogger();

    this._instance = new duckdb.AsyncDuckDB(logger, worker);
    await this._instance.instantiate(bundle.mainModule, bundle.pthreadWorker);

    // Load spatial extension
    const spatialUrl = 'https://extensions.duckdb.org/v1.1.3/wasm_eh/spatial.duckdb_extension.wasm';
    await this._instance.registerFileURL('spatial.duckdb_extension', spatialUrl, 2);

    this._db = await this._instance.connect();

    // Install and load spatial extension
    await this._db.query(`INSTALL spatial;`);
    await this._db.query(`LOAD spatial;`);

    // Initialize SQL macros
    await this.initMacros();
  }
}
```

## Data Import

### Tabular Data Import

```typescript
async read_tabular(
  input: string | File,
  options?: ReadTabularOptions
): Promise<string> {
  const table_name = options?.table_name || `table_${generateUID()}`;

  if (typeof input === 'string') {
    // CSV data as string
    await this._db.query(
      `CREATE OR REPLACE TABLE ${table_name} AS
       SELECT * FROM read_csv_auto(?, ALL_VARCHAR=true)`,
      [input]
    );
  } else {
    // File upload
    await this._instance.registerFileHandle(
      input.name,
      input,
      duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
      true
    );

    await this._db.query(
      `CREATE OR REPLACE TABLE ${table_name} AS
       SELECT * FROM read_csv_auto('${input.name}', ALL_VARCHAR=true)`
    );
  }

  return table_name;
}
```

### Spatial Data Import

```typescript
async read_geofile(
  geofile: File,
  options?: ReadGeofileOptions
): Promise<string> {
  const table_name = options?.table_name || `geo_${generateUID()}`;

  // Register file with DuckDB
  await this._instance.registerFileHandle(
    geofile.name,
    geofile,
    duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
    true
  );

  // Detect geometry type and import
  const extension = geofile.name.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'geojson':
      await this._db.query(
        `CREATE OR REPLACE TABLE ${table_name} AS
         SELECT * FROM ST_Read('${geofile.name}')`
      );
      break;

    case 'shp':
      // Shapefile requires multiple files
      await this._db.query(
        `CREATE OR REPLACE TABLE ${table_name} AS
         SELECT * FROM ST_Read('${geofile.name}', layer='${options?.layer || ''}')`
      );
      break;

    case 'gpkg':
      // GeoPackage support
      await this._db.query(
        `CREATE OR REPLACE TABLE ${table_name} AS
         SELECT * FROM ST_Read('${geofile.name}', layer='${options?.layer || ''}')`
      );
      break;
  }

  return table_name;
}
```

## SQL Macros System

### Analysis Macros

```typescript
// Column description macro
const describe_full_macro = `
CREATE OR REPLACE MACRO describe_full(table_name, column_name) AS (
  WITH stats AS (
    SELECT
      COUNT(*) as count,
      COUNT(DISTINCT column_name) as unique_count,
      COUNT(*) - COUNT(column_name) as null_count,
      MODE(column_name) as mode,
      MIN(column_name) as min,
      MAX(column_name) as max
    FROM query_table(table_name)
  )
  SELECT * FROM stats
);`;

// Numeric summary macro
const summary_numeric_macro = `
CREATE OR REPLACE MACRO summary_numeric(table_name, column_name) AS (
  WITH numeric_stats AS (
    SELECT
      AVG(TRY_CAST(column_name AS DOUBLE)) as mean,
      MEDIAN(TRY_CAST(column_name AS DOUBLE)) as median,
      STDDEV(TRY_CAST(column_name AS DOUBLE)) as stddev,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY TRY_CAST(column_name AS DOUBLE)) as q1,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY TRY_CAST(column_name AS DOUBLE)) as q3
    FROM query_table(table_name)
    WHERE TRY_CAST(column_name AS DOUBLE) IS NOT NULL
  )
  SELECT * FROM numeric_stats
);`;
```

### Classification Macros

```typescript
// Quantile breaks
const quantile_macro = `
CREATE OR REPLACE MACRO quantile(table_name, column_name, n_classes) AS (
  SELECT
    LIST(value) as breaks
  FROM (
    SELECT DISTINCT
      PERCENTILE_CONT((i + 1.0) / n_classes)
        WITHIN GROUP (ORDER BY TRY_CAST(column_name AS DOUBLE)) as value
    FROM query_table(table_name),
         generate_series(0, n_classes - 1) as t(i)
    WHERE TRY_CAST(column_name AS DOUBLE) IS NOT NULL
  )
);`;

// K-means clustering
const kmeans_macro = `
CREATE OR REPLACE MACRO kmeans(table_name, column_name, n_classes) AS (
  WITH kmeans_result AS (
    SELECT
      cluster_id,
      MIN(value) as min_val,
      MAX(value) as max_val
    FROM (
      SELECT
        TRY_CAST(column_name AS DOUBLE) as value,
        KMEANS(TRY_CAST(column_name AS DOUBLE), n_classes) OVER () as cluster_id
      FROM query_table(table_name)
      WHERE TRY_CAST(column_name AS DOUBLE) IS NOT NULL
    )
    GROUP BY cluster_id
    ORDER BY min_val
  )
  SELECT LIST(max_val) as breaks FROM kmeans_result
);`;
```

### Join Macros

```typescript
// Text normalization for joins
const normalize_text_macro = `
CREATE OR REPLACE MACRO normalize_text(string) AS (
  SELECT
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(trim(string)),
          '[àáäâãå]', 'a', 'g'
        ),
        '[èéëê]', 'e', 'g'
      ),
      '[^a-z0-9]', '', 'g'
    )
);`;

// Similarity scoring
const get_similarity_macro = `
CREATE OR REPLACE MACRO get_similarity(str1, str2) AS (
  SELECT
    CASE
      WHEN str1 = str2 THEN 1.0
      WHEN normalize_text(str1) = normalize_text(str2) THEN 0.95
      WHEN jaro_winkler_similarity(str1, str2) > 0.9 THEN jaro_winkler_similarity(str1, str2)
      ELSE 0.0
    END
);`;
```

## DuckDB Orchestrator Service

### File Processing

```typescript
class DuckDBOrchestratorService {
  private db: DuckDB;
  private datasets: Map<string, DuckDBDataset> = new Map();

  async processFile(file: UploadedFile): Promise<DuckDBDataset | null> {
    try {
      let tableName: string;

      // Import based on file type
      if (file.fileType === FileType.GeoJSON ||
          file.fileType === FileType.Shapefile ||
          file.fileType === FileType.GeoPackage) {
        tableName = await this.db.read_geofile(file.content as File);
      } else {
        tableName = await this.db.read_tabular(file.content as File);
      }

      // Analyze imported data
      const columns = await this.db.analyse(tableName);
      const rowCount = await this.db.getRowCount(tableName);

      const dataset: DuckDBDataset = {
        tableName,
        sourceFileId: file.id,
        columns,
        rowCount,
        hasGeometry: columns.some(c => c.type.includes('GEOMETRY'))
      };

      this.datasets.set(file.id, dataset);
      return dataset;

    } catch (error) {
      console.error('[DuckDBOrchestrator] Error processing file:', error);
      return null;
    }
  }

  async getTableData(
    tableName: string,
    options?: { offset?: number; limit?: number; orderBy?: string; order?: string }
  ): Promise<any> {
    const { offset = 0, limit = 100, orderBy, order = 'ASC' } = options || {};

    let query = `SELECT * FROM ${tableName}`;

    if (orderBy) {
      query += ` ORDER BY "${orderBy}" ${order}`;
    }

    query += ` LIMIT ${limit} OFFSET ${offset}`;

    return await this.db.query(query);
  }
}
```

## Spatial Operations

### Geometry Processing

```typescript
// Convert lat/lon columns to point geometry
async latlon_to_point(
  table_name: string,
  lat_column: string,
  lon_column: string
): Promise<void> {
  await this._db.query(`
    ALTER TABLE ${table_name}
    ADD COLUMN IF NOT EXISTS geom GEOMETRY;

    UPDATE ${table_name}
    SET geom = ST_Point(
      TRY_CAST("${lon_column}" AS DOUBLE),
      TRY_CAST("${lat_column}" AS DOUBLE)
    );
  `);
}

// Calculate geometry bounds
async getGeometryBounds(table_name: string): Promise<[number, number, number, number]> {
  const result = await this._db.query(`
    SELECT
      ST_XMin(ST_Envelope(ST_Union(geom))) as xmin,
      ST_YMin(ST_Envelope(ST_Union(geom))) as ymin,
      ST_XMax(ST_Envelope(ST_Union(geom))) as xmax,
      ST_YMax(ST_Envelope(ST_Union(geom))) as ymax
    FROM ${table_name}
    WHERE geom IS NOT NULL
  `);

  const bounds = result.toArray()[0];
  return [bounds.xmin, bounds.ymin, bounds.xmax, bounds.ymax];
}
```

### Spatial Joins

```typescript
async spatial_join(
  table1: string,
  table2: string,
  join_type: 'intersects' | 'contains' | 'within' = 'intersects'
): Promise<string> {
  const result_table = `joined_${generateUID()}`;

  const spatial_predicate = {
    'intersects': 'ST_Intersects',
    'contains': 'ST_Contains',
    'within': 'ST_Within'
  }[join_type];

  await this._db.query(`
    CREATE OR REPLACE TABLE ${result_table} AS
    SELECT
      a.*,
      b.* EXCLUDE (geom)
    FROM ${table1} a
    JOIN ${table2} b
      ON ${spatial_predicate}(a.geom, b.geom)
  `);

  return result_table;
}
```

## Performance Optimizations

### Batch Processing

```typescript
async batch_process<T>(
  items: T[],
  processor: (batch: T[]) => Promise<void>,
  batch_size: number = 1000
): Promise<void> {
  for (let i = 0; i < items.length; i += batch_size) {
    const batch = items.slice(i, i + batch_size);
    await processor(batch);
  }
}
```

### Query Caching

```typescript
class QueryCache {
  private cache = new Map<string, { result: any; timestamp: number }>();
  private ttl = 5 * 60 * 1000; // 5 minutes

  async get(query: string, executor: () => Promise<any>): Promise<any> {
    const cached = this.cache.get(query);

    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.result;
    }

    const result = await executor();
    this.cache.set(query, { result, timestamp: Date.now() });
    return result;
  }

  clear(): void {
    this.cache.clear();
  }
}
```

### Memory Management

```typescript
// Clean up temporary tables
async cleanup_temp_tables(): Promise<void> {
  const tables = await this._db.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_name LIKE 'temp_%'
  `);

  for (const table of tables.toArray()) {
    await this._db.query(`DROP TABLE IF EXISTS ${table.table_name}`);
  }
}

// Monitor memory usage
async get_memory_usage(): Promise<{ used: number; available: number }> {
  const result = await this._db.query(`
    SELECT
      current_memory() as used,
      max_memory() as available
  `);

  return result.toArray()[0];
}
```

## Data Export

### CSV Export

```typescript
async export_to_csv(table_name: string): Promise<string> {
  const result = await this._db.query(
    `SELECT * FROM ${table_name}`
  );

  const arrow_table = result.toArrowTable();
  const csv = arrow_table.toCSV();

  return csv;
}
```

### GeoJSON Export

```typescript
async export_to_geojson(table_name: string): Promise<object> {
  const result = await this._db.query(`
    SELECT
      ST_AsGeoJSON(geom) as geometry,
      * EXCLUDE (geom)
    FROM ${table_name}
    WHERE geom IS NOT NULL
  `);

  const features = result.toArray().map(row => ({
    type: 'Feature',
    geometry: JSON.parse(row.geometry),
    properties: { ...row, geometry: undefined }
  }));

  return {
    type: 'FeatureCollection',
    features
  };
}
```

### Parquet Export

```typescript
async export_to_parquet(table_name: string): Promise<Uint8Array> {
  await this._db.query(`
    COPY ${table_name}
    TO 'output.parquet'
    (FORMAT PARQUET, COMPRESSION SNAPPY)
  `);

  const buffer = await this._instance.copyFileToBuffer('output.parquet');
  return buffer;
}
```

## Error Handling

### Connection Management

```typescript
async ensureConnection(): Promise<void> {
  if (!this._db) {
    throw new Error('DuckDB not initialized');
  }

  try {
    await this._db.query('SELECT 1');
  } catch (error) {
    console.error('Connection test failed, reinitializing...');
    await this.init();
  }
}
```

### Query Error Handling

```typescript
async safe_query(sql: string, params?: any[]): Promise<any> {
  try {
    await this.ensureConnection();
    return await this._db.query(sql, params);
  } catch (error) {
    console.error('Query failed:', sql, error);

    // Parse error for user-friendly message
    if (error.message.includes('no such table')) {
      throw new Error('Table not found. Please import data first.');
    }
    if (error.message.includes('no such column')) {
      throw new Error('Column not found. Please check column names.');
    }

    throw error;
  }
}
```

## Testing

### Unit Tests

```typescript
describe('DuckDB Integration', () => {
  let db: DuckDB;

  beforeEach(async () => {
    db = new DuckDB();
    await db.ready();
  });

  test('imports CSV data', async () => {
    const csv = 'id,name,value\n1,A,100\n2,B,200';
    const tableName = await db.read_tabular(csv);

    const result = await db.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    expect(result.toArray()[0].count).toBe(2);
  });

  test('performs spatial operations', async () => {
    const tableName = await db.read_tabular('lat,lon\n45.5,2.3\n48.8,2.3');
    await db.latlon_to_point(tableName, 'lat', 'lon');

    const result = await db.query(`
      SELECT ST_AsText(geom) as wkt
      FROM ${tableName}
      LIMIT 1
    `);

    expect(result.toArray()[0].wkt).toContain('POINT');
  });

  test('calculates statistics', async () => {
    const tableName = await db.read_tabular('value\n1\n2\n3\n4\n5');
    const stats = await db.analyse(tableName);

    expect(stats[0].mean).toBe(3);
    expect(stats[0].min).toBe(1);
    expect(stats[0].max).toBe(5);
  });
});
```

### Performance Tests

```typescript
describe('DuckDB Performance', () => {
  test('handles large datasets', async () => {
    const db = new DuckDB();
    await db.ready();

    // Generate 1M rows
    const large_csv = generateLargeCSV(1000000);

    const start = performance.now();
    const tableName = await db.read_tabular(large_csv);
    const importTime = performance.now() - start;

    expect(importTime).toBeLessThan(5000); // Under 5 seconds

    const count = await db.getRowCount(tableName);
    expect(count).toBe(1000000);
  });
});
```

## Configuration

### DuckDB Settings

```typescript
// Memory configuration
await this._db.query(`SET memory_limit = '1GB';`);
await this._db.query(`SET threads = 4;`);

// Query optimization
await this._db.query(`SET enable_optimizer = true;`);
await this._db.query(`SET enable_profiling = false;`);

// Spatial settings
await this._db.query(`SET spatial_ref_sys_path = '/spatial_ref_sys.parquet';`);
```

## Troubleshooting

### Common Issues

1. **Memory Errors**
   - Solution: Reduce batch size, enable streaming mode
   - Use: `SET memory_limit = '512MB'` for constrained environments

2. **Extension Loading Failures**
   - Ensure correct WASM URL
   - Check CORS headers for extension files
   - Fallback to non-spatial operations if needed

3. **Query Performance**
   - Create indexes: `CREATE INDEX idx_name ON table(column)`
   - Use table statistics: `ANALYZE table_name`
   - Enable query profiling: `EXPLAIN ANALYZE query`

4. **File Format Issues**
   - Use `ALL_VARCHAR=true` for initial import
   - Handle encoding with `encoding='UTF-8'`
   - Detect delimiter with `auto_detect=true`

## Best Practices

1. **Always use parameterized queries** to prevent SQL injection
2. **Clean up temporary tables** after operations
3. **Monitor memory usage** for large datasets
4. **Cache frequently accessed results**
5. **Use batch processing** for bulk operations
6. **Handle connection failures** gracefully
7. **Provide user feedback** during long operations
8. **Test with various data sizes** and formats

## Future Enhancements

1. **Streaming Processing** - Handle datasets larger than memory
2. **Custom Extensions** - Domain-specific spatial functions
3. **Query Optimization** - Automatic index creation
4. **Distributed Processing** - Multi-worker support
5. **Real-time Sync** - Live data updates
6. **ML Integration** - In-database machine learning