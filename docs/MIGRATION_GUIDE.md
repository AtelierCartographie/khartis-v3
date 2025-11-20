# Migration Guide: Khartis v2 to v3

> **Comprehensive guide for migrating from Khartis v2 to Khartis v3**

## Overview

Khartis v3 is a complete rewrite of the application with significant architectural improvements, performance optimizations, and new features. This guide will help you migrate existing projects and understand the major changes.

## Major Changes

### 🏗️ Architecture Overhaul

| Aspect | v2 | v3 |
| --- | --- | --- |
| **Framework** | Svelte 3/4 | SvelteKit 5 with Runes |
| **State Management** | Svelte stores (`writable`, `derived`) | Svelte 5 Runes (`$state`, `$derived`) |
| **Data Processing** | Multiple parsing libraries | DuckDB WASM native functions |
| **Bundle Size** | ~8MB | ~5.5MB (-2.5MB) |
| **Performance** | Good | ~5x faster parsing |

### 📊 Data Pipeline Revolution

**v2 Approach:**
- PapaParse for CSV
- shpjs for Shapefiles
- Custom GeoJSON parser
- In-memory processing

**v3 Approach:**
- DuckDB native `read_csv()`
- DuckDB native `ST_Read()` for all geo formats
- GeoArrow-encoded GeoParquet
- Query-based processing with caching

### 🎨 Visualization Types

| v2 Name | v3 Name | Notes |
| --- | --- | --- |
| Choropleth | Choropleth | ✅ Unchanged |
| Proportional | Proportional | ✅ Unchanged |
| Categorical | Categorical | ✅ Unchanged |
| Bivariate | Bivariate | ✅ Unchanged |
| Collections/Facets | Combined | ⚠️ Renamed |

## Breaking Changes

### 1. Project File Format

**v2 Format (.kh2):**
```json
{
  "version": "2.0.0",
  "data": {
    "datasets": [...],
    "joins": [...]
  },
  "visualization": {...}
}
```

**v3 Format (.kh3):**
```json
{
  "manifest": {
    "version": "3.0.0",
    "format": "khartis"
  },
  "data": {
    "sourceFiles": [...],
    "processedData": {...}
  },
  "visualization": {...}
}
```

### 2. State Management

**v2 Store Pattern:**
```javascript
// v2 - Svelte stores
import { writable, derived } from 'svelte/store';

export const datasetStore = writable([]);
export const selectedDataset = derived(
  datasetStore,
  $datasets => $datasets[0]
);

// Component usage
$: dataset = $selectedDataset;
```

**v3 Store Pattern:**
```javascript
// v3 - Svelte 5 Runes
export class DatasetStore {
  private _state = $state({
    datasets: []
  });

  get datasets() {
    return this._state.datasets;
  }

  get selectedDataset() {
    return $derived(this._state.datasets[0]);
  }
}

// Component usage
const store = new DatasetStore();
$: dataset = store.selectedDataset;
```

### 3. Data Import API

**v2:**
```javascript
import { parseCSV } from '$lib/parsers';
const data = await parseCSV(file);
```

**v3:**
```javascript
import { dataPipeline } from '$lib/features/data-pipeline';
const result = await dataPipeline.processFile(file);
// Returns DatasetResult with DuckDB table
```

### 4. Classification Methods

**v2:**
```javascript
import { jenks } from 'simple-statistics';
const breaks = jenks(values, numClasses);
```

**v3:**
```javascript
import { Duck } from '$lib/features/duckdb';
const breaks = await Duck.breaks(tableName, columnName, 'jenks', numClasses);
```

## Migration Steps

### Step 1: Backup Your Projects

Before starting migration:
1. Export all v2 projects as `.kh2` files
2. Export data as CSV/GeoJSON for safety
3. Take screenshots of important visualizations

### Step 2: Install Khartis v3

```bash
# Clone the repository
git clone https://github.com/khartis/khartis-v3.git
cd khartis-v3

# Install dependencies
corepack enable
yarn install

# Start development server
yarn dev
```

### Step 3: Import v2 Projects

Khartis v3 includes an automatic migration tool:

1. Open Khartis v3
2. Click "Import Project"
3. Select your `.kh2` file
4. The migration tool will:
   - Convert project format
   - Re-process datasets with DuckDB
   - Update visualization configurations
   - Preserve your settings

### Step 4: Verify and Adjust

After automatic migration:

1. **Check Data Processing:**
   - Verify column types are correctly inferred
   - Check that joins are preserved
   - Validate calculated fields

2. **Review Visualizations:**
   - Confirm color palettes
   - Check classification breaks
   - Verify symbol sizes

3. **Update Custom Code:**
   - If you have custom extensions, update to new APIs
   - Replace Svelte stores with Runes pattern
   - Update import paths

## Feature Mapping

### Removed Features

| Feature | Reason | Alternative |
| --- | --- | --- |
| Manual CSV editor | Complexity | Use external tools + reimport |
| Legacy projections | Outdated | Modern projection set |
| Flash export | Deprecated format | SVG/PNG export |

### New Features in v3

- **Web Workers**: Background processing for better performance
- **GeoParquet Support**: Efficient geospatial file format
- **DuckDB Analytics**: SQL-based data analysis
- **PWA Support**: Offline capability
- **Auto-save**: Automatic project persistence

## Common Migration Issues

### Issue 1: Jenks Classification Fallback

**Problem:** Jenks classification may produce different breaks
**Solution:** v3 falls back to quantiles for large datasets. Use manual breaks if exact match needed.

### Issue 2: Collections → Combined

**Problem:** "Collections" visualization renamed to "Combined"
**Solution:** Automatic migration handles this, but update any documentation/training materials.

### Issue 3: Performance Differences

**Problem:** Some operations may behave differently
**Solution:** v3 is generally faster, but check:
- Large dataset handling (now uses TABLESAMPLE)
- Classification recomputation (now cached)

## API Migration Reference

### File Operations

```javascript
// v2
import { readFile } from '$lib/utils/file';
const content = await readFile(file);

// v3
import { dataPipeline } from '$lib/features/data-pipeline';
const dataset = await dataPipeline.processFile(file);
```

### Data Queries

```javascript
// v2
const filtered = data.filter(row => row.value > 100);

// v3
import { Duck } from '$lib/features/duckdb';
const filtered = await Duck.query(
  `SELECT * FROM ${tableName} WHERE value > 100`
);
```

### Visualization Creation

```javascript
// v2
createChoropleth(data, {
  variable: 'population',
  method: 'jenks',
  classes: 5
});

// v3
visualizationStore.create({
  type: VisualizationType.CHOROPLETH,
  datasetId: dataset.id,
  classification: {
    column: 'population',
    method: ClassificationMethod.JENKS,
    breaks: 5
  }
});
```

## Performance Improvements

### Benchmark Comparisons

| Operation | v2 Time | v3 Time | Improvement |
| --- | --- | --- | --- |
| CSV Import (10MB) | 8s | 1.5s | 5.3x faster |
| Shapefile Parse | 12s | 2s | 6x faster |
| Classification (100k rows) | 3s | 0.5s | 6x faster |
| Join Operations | 5s | 0.8s | 6.2x faster |

## Rollback Plan

If you need to revert to v2:

1. Export your v3 projects as CSV/GeoJSON
2. Manually recreate in v2
3. v2 remains available at: [legacy.khartis.fr](https://legacy.khartis.fr)

## Support & Resources

### Getting Help

- **Documentation**: [/docs](./README.md)
- **Issues**: [GitHub Issues](https://github.com/khartis/khartis-v3/issues)
- **Community**: [Discord Server](https://discord.gg/khartis)

### Training Materials

- Video tutorials (coming soon)
- Sample migration projects
- API reference guide

## Checklist

Use this checklist to track your migration progress:

- [ ] Backup all v2 projects
- [ ] Install Khartis v3
- [ ] Import first test project
- [ ] Verify data processing
- [ ] Check visualizations
- [ ] Update custom code (if any)
- [ ] Test all features
- [ ] Train team on v3
- [ ] Migrate production projects
- [ ] Update documentation

## FAQ

### Q: Can I run v2 and v3 side by side?
**A:** Yes, they use different storage keys in IndexedDB and can coexist.

### Q: Will my v2 projects work in v3?
**A:** Yes, with automatic migration. Minor adjustments may be needed for edge cases.

### Q: Is v3 backward compatible?
**A:** No, v3 is a complete rewrite. Use the migration tool for v2 projects.

### Q: What about browser compatibility?
**A:** v3 requires modern browsers with WebAssembly and Web Workers support.

### Q: Can I export v3 projects to v2 format?
**A:** No, but you can export data as CSV/GeoJSON and recreate in v2 if needed.

---

**Last Updated**: 2025-11-20
**Applies to**: Khartis v3.0.0 and later