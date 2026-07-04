import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import {
  CANONICAL_ID_COLUMN,
  INTERNAL_COLUMN,
  JOINED_BASEMAP_COLUMN
} from '$lib/features/commons/constants/data.constants';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { DataValidationError } from '$lib/features/commons/pipeline.errors';
import * as m from '$lib/paraglide/messages';
import {
  DENSITY_LEVEL,
  type DensityLevelOption
} from '$lib/features/commons/constants/visualization.constants';
import { Duck } from '../duck';
import { registerTableMutationCallback } from '../cache/cache-manager';
import {
  addGeoArrowMetadataFromDuckDB,
  fetchArrowTableWithGeometry
} from './arrow-ops';

const GEOMETRY_COLUMN = 'geometry';
const DENSITY_CACHE_MAX_ENTRIES = 12;
const densityCache = new Map<string, ArrowTable>();
const densityCacheTableIndex = new Map<string, Set<string>>();

interface GeometryColumnInfo {
  column_name: string;
  data_type: string;
}

async function getTableColumns(
  tableName: string
): Promise<GeometryColumnInfo[]> {
  return (await Duck.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = '${escapeSqlString(tableName)}'`,
    { format: 'array', useProxy: false }
  )) as GeometryColumnInfo[];
}

function findGeometryColumn(
  columns: GeometryColumnInfo[]
): GeometryColumnInfo | undefined {
  return columns.find((c) => {
    const name = c.column_name.toLowerCase();
    return (
      name === INTERNAL_COLUMN.GEOM ||
      name === INTERNAL_COLUMN.GEOMETRY ||
      name === INTERNAL_COLUMN.WKB_GEOMETRY ||
      name === INTERNAL_COLUMN.THE_GEOM
    );
  });
}

function findJoinColumn(columns: GeometryColumnInfo[]): string | null {
  const hasFeatureIdCol = columns.some(
    (c) => c.column_name === INTERNAL_COLUMN.FEATURE_ID
  );
  if (hasFeatureIdCol) return INTERNAL_COLUMN.FEATURE_ID;

  const nativeIdColumn = columns.find(
    (c) => c.column_name.toLowerCase() === CANONICAL_ID_COLUMN
  );
  return nativeIdColumn?.column_name ?? null;
}

function getSafeTempName(prefix: string, tableName: string): string {
  return `${prefix}_${tableName.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

function buildDensityCacheKey(
  tableName: string,
  dataColumn: string,
  ratio: number,
  seed: number | undefined
): string {
  const safeRatio = Math.max(1, Math.floor(ratio));
  const safeSeed =
    typeof seed === 'number' && Number.isFinite(seed) ? seed : 'nodet';
  return `${tableName}::${dataColumn}::${safeRatio}::${safeSeed}`;
}

function indexDensityCacheEntry(tableName: string, key: string): void {
  let bucket = densityCacheTableIndex.get(tableName);
  if (!bucket) {
    bucket = new Set();
    densityCacheTableIndex.set(tableName, bucket);
  }
  bucket.add(key);
}

function evictOldestDensityEntry(): void {
  const oldestKey = densityCache.keys().next().value;
  if (!oldestKey) return;
  densityCache.delete(oldestKey);
  for (const [tableName, bucket] of densityCacheTableIndex) {
    if (bucket.delete(oldestKey) && bucket.size === 0) {
      densityCacheTableIndex.delete(tableName);
    }
  }
}

function setDensityCacheEntry(
  tableName: string,
  key: string,
  arrow: ArrowTable
): void {
  if (densityCache.has(key)) {
    densityCache.delete(key);
  } else if (densityCache.size >= DENSITY_CACHE_MAX_ENTRIES) {
    evictOldestDensityEntry();
  }
  densityCache.set(key, arrow);
  indexDensityCacheEntry(tableName, key);
}

function invalidateDensityCacheForTable(tableName: string): void {
  const bucket = densityCacheTableIndex.get(tableName);
  if (!bucket) return;
  for (const key of bucket) {
    densityCache.delete(key);
  }
  densityCacheTableIndex.delete(tableName);
}

registerTableMutationCallback((table: string) => {
  invalidateDensityCacheForTable(table);
});

/**
 * Computes the 3 density ratios (more / standard / less) for a numeric column.
 * Relies on the `get_density_levels` SQL macro registered at engine init.
 */
export async function computeDensityLevels(
  tableName: string,
  columnName: string,
  maxPoints: number = 100000
): Promise<DensityLevelOption[]> {
  const safeTable = escapeSqlString(tableName);
  const safeColumn = escapeIdentifier(columnName);
  const rows = (await Duck.query(
    `FROM get_density_levels('${safeTable}', "${safeColumn}", max_points := ${maxPoints})
     SELECT level, ratio`,
    { format: 'array', useProxy: false }
  )) as Array<{ level: string; ratio: number }>;

  return rows
    .filter(
      (r): r is { level: DensityLevelOption['level']; ratio: number } =>
        r.level === DENSITY_LEVEL.MORE ||
        r.level === DENSITY_LEVEL.STANDARD ||
        r.level === DENSITY_LEVEL.LESS
    )
    .map((r) => ({ level: r.level, ratio: Number(r.ratio) }));
}

/**
 * Generates dot-density points for a polygon table and exports them as an Arrow
 * table with geometry encoded as `geoarrow.wkb` (DuckDB ≥ 1.33). Consumable
 * directly by `geoarrow-deck-stream`'s `parsePoints()`.
 */
export async function generateDotDensityArrow(
  tableName: string,
  geomColumn: string,
  dataColumn: string,
  ratio: number,
  options: { seed?: number } = {}
): Promise<ArrowTable> {
  const safeTable = escapeSqlString(tableName);
  const safeGeom = escapeIdentifier(geomColumn);
  const safeData = escapeIdentifier(dataColumn);

  if (typeof options.seed === 'number') {
    const seed = Number(options.seed);
    if (Number.isFinite(seed)) {
      await Duck.query(`SELECT setseed(${seed})`, { useProxy: false });
    }
  }

  const tempName = `dd_out_${tableName.replace(/[^a-zA-Z0-9_]/g, '_')}_${Date.now()}`;

  await Duck.query(
    `CREATE OR REPLACE TEMP TABLE "${tempName}" AS
     FROM generate_dot_density('${safeTable}', "${safeGeom}", "${safeData}", ${Math.floor(ratio)})
     SELECT geometry AS ${GEOMETRY_COLUMN}`,
    { useProxy: false }
  );

  try {
    const { table, geomColumn } = await fetchArrowTableWithGeometry(
      tempName,
      Duck
    );
    return await addGeoArrowMetadataFromDuckDB(
      table,
      tempName,
      Duck,
      undefined,
      geomColumn
    );
  } finally {
    await Duck.query(`DROP TABLE IF EXISTS "${tempName}"`, { useProxy: false });
  }
}

/**
 * Builds a `(geom, data_value)` view by joining the basemap geometry table with
 * the dataset on the joined basemap id, then runs `generate_dot_density` on that view.
 *
 * Catalog basemaps expose an `id` column ; custom basemaps expose
 * `__feature_id__` (both indexed by the join association output id).
 * Returns an Arrow Table whose `geometry` column is encoded as `geoarrow.wkb`.
 */
export async function generateDotDensityFromJoin(
  geometryTableName: string,
  datasetTableName: string,
  dataColumn: string,
  ratio: number,
  options: { seed?: number } = {}
): Promise<ArrowTable> {
  const geomCols = await getTableColumns(geometryTableName);
  const joinColumn = findJoinColumn(geomCols);
  if (!joinColumn) {
    throw new DataValidationError(
      m.error_density_no_feature_id({ geometryTableName }),
      'featureId',
      { geometryTableName }
    );
  }

  const geometryColumn = findGeometryColumn(geomCols);
  if (!geometryColumn) {
    throw new DataValidationError(
      m.error_density_no_geometry({ geometryTableName }),
      'geometry',
      { geometryTableName }
    );
  }

  const cacheTableId = `${datasetTableName}+${geometryTableName}`;
  const cacheKey = buildDensityCacheKey(
    cacheTableId,
    dataColumn,
    ratio,
    options.seed
  );
  const cached = densityCache.get(cacheKey);
  if (cached) return cached;

  const viewName = getSafeTempName('density_src', datasetTableName);
  const escapedDataset = escapeIdentifier(datasetTableName);
  const escapedGeometry = escapeIdentifier(geometryTableName);
  const escapedJoinCol = escapeIdentifier(joinColumn);
  const escapedGeomCol = escapeIdentifier(geometryColumn.column_name);
  const escapedDataCol = escapeIdentifier(dataColumn);
  const escapedBasemapIdCol = escapeIdentifier(JOINED_BASEMAP_COLUMN.ID);

  await Duck.query(`
    CREATE OR REPLACE TEMP VIEW "${viewName}" AS
    SELECT g."${escapedGeomCol}" AS geom, d."${escapedDataCol}" AS value
    FROM "${escapedDataset}" d
    INNER JOIN "${escapedGeometry}" g
      ON CAST(d."${escapedBasemapIdCol}" AS VARCHAR) = CAST(g."${escapedJoinCol}" AS VARCHAR)
    WHERE g."${escapedGeomCol}" IS NOT NULL
      AND d."${escapedDataCol}" IS NOT NULL
  `);

  try {
    const arrow = await generateDotDensityArrow(
      viewName,
      'geom',
      'value',
      ratio,
      options
    );
    setDensityCacheEntry(cacheTableId, cacheKey, arrow);
    return arrow;
  } finally {
    await Duck.query(`DROP VIEW IF EXISTS "${viewName}"`, { useProxy: false });
  }
}

async function createGpsDensitySourceView(
  viewName: string,
  geometryTableName: string,
  datasetTableName: string,
  dataColumn: string,
  latColumn: string,
  lonColumn: string
): Promise<void> {
  const geomCols = await getTableColumns(geometryTableName);
  const geometryColumn = findGeometryColumn(geomCols);
  if (!geometryColumn) {
    throw new DataValidationError(
      m.error_density_no_geometry({ geometryTableName }),
      'geometry',
      { geometryTableName }
    );
  }

  const escapedView = escapeIdentifier(viewName);
  const escapedDataset = escapeIdentifier(datasetTableName);
  const escapedGeometry = escapeIdentifier(geometryTableName);
  const escapedGeomCol = escapeIdentifier(geometryColumn.column_name);
  const escapedDataCol = escapeIdentifier(dataColumn);
  const escapedLatCol = escapeIdentifier(latColumn);
  const escapedLonCol = escapeIdentifier(lonColumn);

  await Duck.query(`
    CREATE OR REPLACE TEMP VIEW "${escapedView}" AS
    WITH points AS (
      SELECT
        ST_Point(
          TRY_CAST("${escapedLonCol}" AS DOUBLE),
          TRY_CAST("${escapedLatCol}" AS DOUBLE)
        ) AS point_geom,
        COALESCE(TRY_CAST("${escapedDataCol}" AS DOUBLE), 1.0) AS point_value
      FROM "${escapedDataset}"
      WHERE "${escapedDataCol}" IS NOT NULL
        AND TRY_CAST("${escapedLatCol}" AS DOUBLE) BETWEEN -90 AND 90
        AND TRY_CAST("${escapedLonCol}" AS DOUBLE) BETWEEN -180 AND 180
    ),
    geometry_rows AS (
      SELECT
        ROW_NUMBER() OVER () AS feature_key,
        "${escapedGeomCol}" AS geom
      FROM "${escapedGeometry}"
      WHERE "${escapedGeomCol}" IS NOT NULL
    )
    SELECT
      g.geom AS geom,
      SUM(p.point_value) AS value
    FROM geometry_rows g
    INNER JOIN points p
      ON ST_X(p.point_geom) BETWEEN ST_XMin(g.geom) AND ST_XMax(g.geom)
     AND ST_Y(p.point_geom) BETWEEN ST_YMin(g.geom) AND ST_YMax(g.geom)
     AND ST_Intersects(g.geom, p.point_geom)
    GROUP BY g.feature_key, g.geom
    HAVING SUM(p.point_value) > 0
  `);
}

export async function generateDotDensityFromGpsJoin(
  geometryTableName: string,
  datasetTableName: string,
  dataColumn: string,
  latColumn: string,
  lonColumn: string,
  ratio: number,
  options: { seed?: number } = {}
): Promise<ArrowTable> {
  const cacheTableId = `${datasetTableName}+${geometryTableName}+gps:${latColumn}:${lonColumn}`;
  const cacheKey = buildDensityCacheKey(
    cacheTableId,
    dataColumn,
    ratio,
    options.seed
  );
  const cached = densityCache.get(cacheKey);
  if (cached) return cached;

  const viewName = getSafeTempName('density_gps_src', datasetTableName);
  await createGpsDensitySourceView(
    viewName,
    geometryTableName,
    datasetTableName,
    dataColumn,
    latColumn,
    lonColumn
  );

  try {
    const arrow = await generateDotDensityArrow(
      viewName,
      'geom',
      'value',
      ratio,
      options
    );
    setDensityCacheEntry(cacheTableId, cacheKey, arrow);
    return arrow;
  } finally {
    await Duck.query(`DROP VIEW IF EXISTS "${viewName}"`, { useProxy: false });
  }
}

/**
 * Variant of `computeDensityLevels` that first builds the same join view used
 * for point generation, ensuring the ratio is based on the visible dataset rows.
 */
export async function computeDensityLevelsFromJoin(
  geometryTableName: string,
  datasetTableName: string,
  dataColumn: string,
  maxPoints: number = 100000
): Promise<DensityLevelOption[]> {
  const geomCols = await getTableColumns(geometryTableName);
  const joinColumn = findJoinColumn(geomCols);
  if (!joinColumn) {
    return computeDensityLevels(datasetTableName, dataColumn, maxPoints);
  }

  const viewName = getSafeTempName('density_levels', datasetTableName);
  const escapedDataset = escapeIdentifier(datasetTableName);
  const escapedGeometry = escapeIdentifier(geometryTableName);
  const escapedJoinCol = escapeIdentifier(joinColumn);
  const escapedDataCol = escapeIdentifier(dataColumn);
  const escapedBasemapIdCol = escapeIdentifier(JOINED_BASEMAP_COLUMN.ID);

  await Duck.query(`
    CREATE OR REPLACE TEMP VIEW "${viewName}" AS
    SELECT d."${escapedDataCol}" AS value
    FROM "${escapedDataset}" d
    INNER JOIN "${escapedGeometry}" g
      ON CAST(d."${escapedBasemapIdCol}" AS VARCHAR) = CAST(g."${escapedJoinCol}" AS VARCHAR)
    WHERE d."${escapedDataCol}" IS NOT NULL
  `);

  try {
    return await computeDensityLevels(viewName, 'value', maxPoints);
  } finally {
    await Duck.query(`DROP VIEW IF EXISTS "${viewName}"`, { useProxy: false });
  }
}

export async function computeDensityLevelsFromGpsJoin(
  geometryTableName: string,
  datasetTableName: string,
  dataColumn: string,
  latColumn: string,
  lonColumn: string,
  maxPoints: number = 100000
): Promise<DensityLevelOption[]> {
  const viewName = getSafeTempName('density_gps_levels', datasetTableName);
  await createGpsDensitySourceView(
    viewName,
    geometryTableName,
    datasetTableName,
    dataColumn,
    latColumn,
    lonColumn
  );

  try {
    return await computeDensityLevels(viewName, 'value', maxPoints);
  } finally {
    await Duck.query(`DROP VIEW IF EXISTS "${viewName}"`, { useProxy: false });
  }
}

export async function generateDotDensityFromGeoTable(
  tableName: string,
  dataColumn: string,
  ratio: number,
  options: { seed?: number } = {}
): Promise<ArrowTable> {
  const cacheKey = buildDensityCacheKey(
    tableName,
    dataColumn,
    ratio,
    options.seed
  );
  const cached = densityCache.get(cacheKey);
  if (cached) return cached;

  const cols = await getTableColumns(tableName);
  const geometryColumn = findGeometryColumn(cols);
  if (!geometryColumn) {
    throw new DataValidationError(
      m.error_table_no_geometry_density({ tableName }),
      'geometry',
      { tableName }
    );
  }

  const arrow = await generateDotDensityArrow(
    tableName,
    geometryColumn.column_name,
    dataColumn,
    ratio,
    options
  );
  setDensityCacheEntry(tableName, cacheKey, arrow);
  return arrow;
}
