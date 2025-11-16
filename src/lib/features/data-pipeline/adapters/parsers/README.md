# Parsers (DEPRECATED)

## ⚠️ These parsers are deprecated as of v3.x

The pipeline has been refactored to use **DuckDB-first** approach for all file parsing.

### What changed?

**Before (v2.x):**

```
File → External Parser (PapaParse/shpjs/sql.js) → RawDataset →
Validation → Type Inference → CSV Conversion → DuckDB → Analytics
```

**After (v3.x DuckDB-first):**

```
File → DuckDB Native Reading (read_csv/ST_Read) →
Analytics (type inference + stats in one query) → DatasetResult
```

### Performance improvements

- **2-3x faster** processing
- **Single pass** (no intermediate conversions)
- **-2MB bundle size** (removed sql.js, shpjs, papaparse deps)
- **Lower memory usage** (data stays in DuckDB)

### Supported formats (via DuckDB)

| Format     | Method                | Notes                                     |
| ---------- | --------------------- | ----------------------------------------- |
| CSV/TSV    | `Duck.read_tabular()` | Uses DuckDB's `read_csv()`                |
| GeoJSON    | `Duck.read_geofile()` | Uses DuckDB spatial extension `ST_Read()` |
| Shapefile  | `Duck.read_geofile()` | Requires .shp + .shx + .dbf               |
| GeoPackage | `Duck.read_geofile()` | Native GPKG support                       |
| KML        | `Duck.read_geofile()` | Via spatial extension                     |
| GeoParquet | `Duck.read_tabular()` | Native Parquet + GeoArrow                 |

### Migration guide

If you need to add a new file format:

1. Check if DuckDB supports it natively (see [DuckDB docs](https://duckdb.org/docs/data/overview))
2. If yes: just use `Duck.read_tabular()` or `Duck.read_geofile()`
3. If no: consider adding DuckDB extension or preprocessing step

### Legacy code

These parser files are kept for:

- `convertGeoJSONToRawDataset()` utility (used in shapefile processing)
- Reference implementation
- Potential fallback scenarios

They are **not used** in the main processing pipeline anymore.
