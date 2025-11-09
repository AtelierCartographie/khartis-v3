# Services & Orchestrators

## Overview

Services layer coordinates data flow between stores, external libraries, and UI components. Two main orchestrators manage the data pipeline.

## DataOrchestratorService

Central coordinator for data flow across the application.

### Responsibilities

- Initialize and synchronize all data stores
- Process files when added/removed
- Create default visualizations
- Export data in various formats
- Coordinate between stores and tools

### Key Methods

```ts
class DataOrchestratorService {
  initialize(): Promise<void>;
  onFileAdded(file: UploadedFile): Promise<void>;
  onFileRemoved(fileId: string): Promise<void>;
  onProjectChanged(): Promise<void>;
  exportData(format: 'csv' | 'geojson' | 'json'): Promise<Blob>;
  getVisualizationData(visualizationId: string): any;
}
```

### Data Flow

```
File Added → DataOrchestrator
  ├─→ DatasetsStore (primary processing)
  ├─→ DuckDBOrchestrator (analytical engine)
  ├─→ ProjectionActions (if geometry)
  ├─→ VisualizationStore (create default)
  └─→ LayersActions (sync UI)
```

### Auto-Visualization Logic

- Geometry + numeric columns → Choropleth
- Geometry + string columns → Categorical
- Numeric columns only → Proportional symbols
- No suitable columns → No visualization

## DuckDBOrchestratorService

Analytical engine for advanced data operations using DuckDB WASM.

### Responsibilities

- Initialize DuckDB WASM instance
- Convert data to DuckDB tables
- Perform SQL-based analysis
- Compute statistics and aggregations
- Support joins and transformations (future)

### Key Methods

```ts
class DuckDBOrchestratorService {
  initialize(): Promise<void>;
  processFile(file: UploadedFile): Promise<DuckDBDataset | null>;
  analyzeTable(tableName: string): Promise<ColumnAnalysis[]>;
  computeBreaks(
    tableName: string,
    column: string,
    method: string,
    k: number
  ): Promise<number[]>;
  joinTables(left: string, right: string, on: string): Promise<string>;
  executeQuery(sql: string): Promise<any[]>;
  getDataset(id: string): DuckDBDataset | undefined;
  clearAllTables(): Promise<void>;
}
```

### Supported File Types

- CSV/TSV → Direct table creation
- GeoJSON → Spatial table with geometry column
- Shapefile → Via GeoJSON conversion (planned)
- GeoPackage → Native spatial support (experimental)

### DuckDB Integration Points

```
File Processing:
  CSV → Duck.read_tabular() → Table
  GeoJSON → Duck.read_geofile() → Spatial Table

Analysis:
  Table → Duck.analyse() → Column stats
  Column → Duck.breaks() → Classification breaks
  Tables → Duck.join() → Merged table
```

## Service Initialization

### Startup Sequence

```
App Mount
  └─→ DataOrchestrator.initialize()
      ├─→ ProjectStore.waitForInit()
      ├─→ DuckDBOrchestrator.initialize()
      │   └─→ initDuckDB() (WASM load)
      └─→ Process existing project files
```

### Error Handling

| Service            | Error                | Recovery                     |
| ------------------ | -------------------- | ---------------------------- |
| DataOrchestrator   | File processing fail | Show notification, continue  |
| DuckDBOrchestrator | Init fail            | Fallback to basic processing |
| DuckDBOrchestrator | Query fail           | Log warning, return null     |

## Performance Considerations

### Current Implementation

- **Synchronous**: All processing on main thread
- **In-memory**: DuckDB tables stored in WASM memory
- **Eager**: Process files immediately on add

### Optimization Opportunities

- Move to Web Worker for heavy operations
- Implement lazy loading for large datasets
- Add query result caching
- Stream large file parsing

## Extension Points

### Adding New Service

```ts
// 1. Create service class
class CustomService {
  private state = {};

  async initialize() {}
  async process(data: any) {}
}

// 2. Export singleton
export const customService = new CustomService();

// 3. Wire into DataOrchestrator
dataOrchestrator.registerService(customService);
```

### Adding DuckDB Function

```ts
// Register custom SQL function
Duck.register_function('my_func', (args) => {
  // Implementation
});

// Use in queries
Duck.query('SELECT my_func(column) FROM table');
```

## Testing Services

### Unit Tests

```ts
// Mock dependencies
vi.mock('../store/project.store.svelte');
vi.mock('./duckdb/duckdb');

// Test service methods
test('processFile creates dataset', async () => {
  const file = createMockFile();
  const dataset = await service.processFile(file);
  expect(dataset).toBeDefined();
});
```

### Integration Tests

```ts
// Test service coordination
test('file add triggers visualization', async () => {
  await dataOrchestrator.onFileAdded(file);
  expect(visualizationStore.visualizations).toHaveLength(1);
});
```

## Logging

Current implementation uses console.log for debugging. Consider using conditional logging:

```ts
if (import.meta.env.DEV) {
  console.log('[Service] Debug info');
}
```

## Future Roadmap

### Near Term

- [ ] Move console.log to conditional logger
- [ ] Add service-level error boundaries
- [ ] Implement query result caching

### Medium Term

- [ ] Web Worker for DuckDB operations
- [ ] Streaming file parser integration
- [ ] Advanced join UI/logic

### Long Term

- [ ] Multi-file transaction support
- [ ] Undo/redo for data operations
- [ ] Cloud function offloading option
