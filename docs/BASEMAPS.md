# Basemaps

> **How Khartis v3 stores and ships vector basemaps**

## 📚 Overview

Basemaps use a **geometry/attribute split**:

- Geometry lives in GeoParquet (GeoArrow encoding, ZSTD compression) for fast Deck.gl rendering
- Attributes are normalized into a long-form Parquet table to power DuckDB joins and fuzzy matching
- Metadata (bbox, projection, layers) is stored in JSON

## 🗺️ Catalog

- **World** – `world-countries-50m` (Natural Earth, ~200 countries, 5.8 MB)
- **Europe** – `nuts2-europe-2021` (242 NUTS‑2 regions, 636 KB)
- **France (IGN Admin Express 2025)** – regions, departments, cantons, communes (+ optional centroids/boundaries)

## 🏗️ Folder layout

```
static/basemaps/
├── all-basemaps-metadata.json      # Catalog (bbox, layers, projection)
├── all-basemaps-attributes.parquet # Normalized attribute table
└── geometry/
    ├── [id].parquet                # GeoArrow geometry
    ├── [id]-centroids.parquet      # Optional centroids
    └── [id]-boundaries.parquet     # Optional boundary overlays
```

## ➕ Adding a basemap

### 1. Convert to GeoParquet

```bash
ogr2ogr \
  static/basemaps/geometry/my-basemap.parquet \
  source-data/my-basemap.shp \
  -lco GEOMETRY_NAME=geom \
  -lco GEOMETRY_ENCODING=GEOARROW \
  -lco COMPRESSION=ZSTD \
  -lco WRITE_COVERING_BBOX=NO \
  -nlt PROMOTE_TO_MULTI
```

Apply `-t_srs EPSG:4326`, `-simplify 0.001`, or `-select "id,name,iso3"` if necessary.

### 2. Build the attribute table

```sql
CREATE OR REPLACE MACRO normalize_text(s) AS
  regexp_replace(regexp_replace(lower(strip_accents(trim(s))), '[^a-z0-9]', ''), '\s+', '');

CREATE TABLE basemap_attributes AS
SELECT DISTINCT
  name AS raw,
  id,
  'name' AS variant,
  normalize_text(name) AS normalized,
  'my-basemap-id' AS basemap,
  count(*) OVER () AS basemap_count
FROM parquet_scan('static/basemaps/geometry/my-basemap.parquet')

UNION ALL

SELECT DISTINCT
  iso3 AS raw,
  id,
  'iso3' AS variant,
  normalize_text(iso3) AS normalized,
  'my-basemap-id' AS basemap,
  count(*) OVER () AS basemap_count
FROM parquet_scan('static/basemaps/geometry/my-basemap.parquet')
WHERE iso3 IS NOT NULL;

COPY basemap_attributes
TO 'static/basemaps/my-basemap-attributes.parquet'
(FORMAT PARQUET, COMPRESSION ZSTD);
```

### 3. Metadata

```json
{
  "file": "my-basemap-id",
  "title": "Region > Administrative level",
  "description": "Full description",
  "source": "IGN Admin Express 2025",
  "date": "2025",
  "bbox": [minLon, minLat, maxLon, maxLat],
  "projection": "WGS84",
  "layers": [
    { "title": "Entity centroids", "type": "centroid", "file": "my-basemap-id-centroids" },
    { "title": "Administrative boundaries", "type": "limit", "file": "my-basemap-id-boundaries" }
  ]
}
```

Compute the bbox with GDAL (`ogrinfo`) or DuckDB (`ST_Envelope_Agg`).

### 4. Catalog integration

1. Copy geometry files to `static/basemaps/geometry/`
2. Update `all-basemaps-metadata.json`
3. Append attributes to `all-basemaps-attributes.parquet`
4. Test in-app (`yarn dev`, create a project, verify the join suggestions)

## ✅ Validation checklist

| Area       | Items                                                                |
| ---------- | -------------------------------------------------------------------- |
| Files      | Geometry + optional centroids/boundaries, GeoArrow, `geom` column    |
| Metadata   | Entry in JSON catalog, bbox, projection, documented layers           |
| Attributes | Normalized table, appended to the global attribute Parquet, variants |
| Technical  | GeoParquet + ZSTD, promote to multi, size kept reasonable (<10 MB)   |
| Testing    | Loads, renders, joins, auto-suggest works, overlays render correctly |

## 🎨 Decorative layers

- **Centroids** help with label placement. Use DuckDB Spatial to generate `ST_Centroid(geom)`.
- **Boundaries** reuse higher administrative levels for context (e.g., department boundaries overlaying communes).

## 🚀 Example: NUTS‑2 Europe

1. Download `NUTS_RG_20M_2021_4326_LEVL_2.geojson`
2. Convert to GeoParquet (see command above)
3. Build the attribute table (NUTS name + code variants)
4. Compute bbox via DuckDB Spatial
5. Add metadata entry

## 📈 Roadmap

- Expand Eurostat coverage (NUTS 0/1/3)
- Add world Admin‑1, large cities
- Add French historic communes, EPCIs, pre‑2016 regions
- Automate shapefile → GeoParquet + attribute generation

## 🔧 Troubleshooting

| Issue               | Fix                                                                               |
| ------------------- | --------------------------------------------------------------------------------- |
| Geometry not found  | Ensure file name matches `file` in metadata and geometry column is `geom`         |
| Join fails          | Inspect normalized attributes, confirm lowercase/accent stripping, check variants |
| Rendering too heavy | Simplify geometry, ensure ZSTD compression, use a lower-res source                |

## 📚 References

- [IGN Admin Express](https://geoservices.ign.fr/adminexpress)
- [Eurostat GISCO](https://ec.europa.eu/eurostat/web/gisco)
- [Natural Earth](https://www.naturalearthdata.com/)

## 🛠️ Requirements

- GDAL 3.9+
- DuckDB 1.1+ (`INSTALL spatial; LOAD spatial;`)
- Node.js for helper scripts

```
gdalinfo --version
duckdb --version
```
