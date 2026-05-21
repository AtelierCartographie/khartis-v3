import { Duck } from '$lib/features/duckdb';
import { loadingStore } from '$lib/features/commons/stores/loading.store.svelte';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import { type Table as ArrowTable } from 'apache-arrow/Arrow';
import { LogCategory, logger } from '../../commons/utils/logger';
import { resolveStaticAssetUrl } from '../../commons/utils/static-asset-url';
import {
  escapeIdentifier,
  escapeSqlString
} from '../../commons/utils/sanitize.utils';
import { projectionStore } from '../stores/projection.store.svelte';
import type {
  BasemapMetadata,
  ProjectionPresets,
  StylePresets
} from '../types/basemap.types';
import { readGeoParquetDirect } from './read-geojson-arrow.service';
import { SimplificationLevel } from '../../commons/types/enums';
import {
  addGeoArrowMetadataFromDuckDB,
  fetchArrowTableWithGeometry
} from '../../duckdb/orchestrator/arrow-ops';
import { INTERNAL_COLUMN } from '../../commons/constants/data.constants';
import { GEOMETRY_WKT_TYPES } from '../../commons/constants/geometry.constants';
import { getCustomBasemapGeometryProjectColumns } from './custom-basemap-columns.service';

const BASEMAP_METADATA_PATH = '/basemaps/all-basemaps-metadata.json';
const BASEMAP_ATTRIBUTES_PATH = '/basemaps/all-basemaps-attributes.parquet';
const PROJECTION_PRESETS_PATH = '/basemaps/projection-presets.json';
const STYLE_PRESETS_PATH = '/basemaps/style-presets.json';
const GEOMETRY_BASE_PATH = '/basemaps/geometry';
const DEFAULT_BASEMAP_ID = 'monde-countries-2024-medium';
const SIMPLIFICATION_LEVEL_ORDER = [
  SimplificationLevel.Low,
  SimplificationLevel.Medium,
  SimplificationLevel.High
] as const;
const CATALOG_SIMPLIFICATION_PRIORITY = [
  SimplificationLevel.Medium,
  SimplificationLevel.High,
  SimplificationLevel.Low
] as const;
const SIMPLIFICATION_LEVEL_SUFFIX_REGEX = /-(low|medium|high)$/;
const CATALOG_ROW_ID_COLUMN = '__khartis_catalog_rowid__';

type CatalogGeometryKind =
  | 'point'
  | 'linestring'
  | 'polygon'
  | 'multipoint'
  | 'multilinestring'
  | 'multipolygon';

function getGeometryParquetUrl(filename: string): string {
  return resolveStaticAssetUrl(`${GEOMETRY_BASE_PATH}/${filename}.parquet`);
}

function getCatalogDuckDBFilename(basemapId: string): string {
  const safeBasemapId = basemapId.replace(/[^a-zA-Z0-9_]/g, '_');
  return `khartis_basemap_${safeBasemapId}.parquet`;
}

async function ensureCatalogParquetRegistered(
  resolvedBasemapId: string,
  arrayBuffer: ArrayBuffer
): Promise<string> {
  const db = Duck.db;
  if (!db) {
    throw new Error('DuckDB not initialized');
  }

  const duckDBFilename = getCatalogDuckDBFilename(resolvedBasemapId);
  if (!Duck.registered_files.has(duckDBFilename)) {
    await db.registerFileBuffer(
      duckDBFilename,
      new Uint8Array(arrayBuffer.slice(0))
    );
    Duck.registered_files.add(duckDBFilename);
  }

  return duckDBFilename;
}

async function materializeCatalogParquetWithSTRead(
  resolvedBasemapId: string,
  arrayBuffer: ArrayBuffer,
  tempTableName: string
): Promise<void> {
  const duckDBFilename = await ensureCatalogParquetRegistered(
    resolvedBasemapId,
    arrayBuffer
  );

  await Duck.query(
    `CREATE OR REPLACE TEMP TABLE "${escapeIdentifier(tempTableName)}" AS SELECT * FROM ST_Read('${escapeSqlString(duckDBFilename)}')`
  );
}

function getCatalogLayerGeometryKind(
  layerType: BasemapLayerType | null | undefined
): CatalogGeometryKind | null {
  switch (layerType) {
    case BasemapLayerType.CENTROID:
    case BasemapLayerType.POINT:
      return 'point';
    case BasemapLayerType.LIMIT:
    case BasemapLayerType.LINE:
    case BasemapLayerType.GRATICULE:
    case BasemapLayerType.GEOGRAPHIC_LINES:
      return 'multilinestring';
    case BasemapLayerType.POLYGON:
    case BasemapLayerType.LAND:
      return 'multipolygon';
    default:
      return null;
  }
}

function getCatalogGeometryKind(
  basemaps: BasemapMetadata[],
  resolvedBasemapId: string
): CatalogGeometryKind {
  if (basemaps.some((basemap) => basemap.file === resolvedBasemapId)) {
    return 'multipolygon';
  }

  for (const basemap of basemaps) {
    const layer = basemap.layers.find(
      (candidate) => candidate.file === resolvedBasemapId
    );
    const layerKind = getCatalogLayerGeometryKind(layer?.type);
    if (layerKind) {
      return layerKind;
    }
  }

  if (/-centroids?-/i.test(resolvedBasemapId)) {
    return 'point';
  }
  if (/-limites?-|graticule|geographic-lines/i.test(resolvedBasemapId)) {
    return 'multilinestring';
  }

  return 'multipolygon';
}

function getNativeGeoArrowGeometryKind(
  geometryColumn: DuckTableColumnInfo,
  expectedKind: CatalogGeometryKind
): CatalogGeometryKind {
  const dataType = geometryColumn.data_type.replace(/\s+/g, ' ').toUpperCase();

  if (dataType.endsWith('[][][]')) {
    return 'multipolygon';
  }
  if (dataType.endsWith('[][]')) {
    return expectedKind === 'multilinestring' ? 'multilinestring' : 'polygon';
  }
  if (dataType.endsWith('[]')) {
    if (expectedKind === 'point' || expectedKind === 'multipoint') {
      return expectedKind;
    }
    return 'linestring';
  }

  return 'point';
}

function pointExpression(pointAlias: string): string {
  return `CAST(${pointAlias}.x AS VARCHAR) || ' ' || CAST(${pointAlias}.y AS VARCHAR)`;
}

function buildPointGeometrySql(
  rawTableName: string,
  tempTableName: string,
  geometryColumnName: string,
  isListEncoded: boolean
): string {
  const escapedRawTableName = escapeIdentifier(rawTableName);
  const escapedTempTableName = escapeIdentifier(tempTableName);
  const escapedGeometryColumnName = escapeIdentifier(geometryColumnName);
  const sourcePoint = isListEncoded
    ? `"${escapedGeometryColumnName}"[1]`
    : `"${escapedGeometryColumnName}"`;

  return `
    CREATE OR REPLACE TEMP TABLE "${escapedTempTableName}" AS
    SELECT
      * EXCLUDE ("${escapedGeometryColumnName}"),
      ST_GeomFromText('POINT (' || ${pointExpression(sourcePoint)} || ')') AS ${INTERNAL_COLUMN.GEOM}
    FROM "${escapedRawTableName}"
  `;
}

function buildLineStringGeometrySql(
  rawTableName: string,
  tempTableName: string,
  geometryColumnName: string
): string {
  const escapedRawTableName = escapeIdentifier(rawTableName);
  const escapedTempTableName = escapeIdentifier(tempTableName);
  const escapedGeometryColumnName = escapeIdentifier(geometryColumnName);

  return `
    CREATE OR REPLACE TEMP TABLE "${escapedTempTableName}" AS
    WITH source AS (
      SELECT row_number() OVER () AS ${CATALOG_ROW_ID_COLUMN}, *
      FROM "${escapedRawTableName}"
    ),
    points AS (
      SELECT ${CATALOG_ROW_ID_COLUMN}, point, point_index
      FROM source,
      unnest("${escapedGeometryColumnName}") WITH ORDINALITY AS pt(point, point_index)
    ),
    geom_wkt AS (
      SELECT
        ${CATALOG_ROW_ID_COLUMN},
        'LINESTRING (' || string_agg(${pointExpression('point')}, ', ' ORDER BY point_index) || ')' AS wkt
      FROM points
      GROUP BY ${CATALOG_ROW_ID_COLUMN}
    )
    SELECT
      source.* EXCLUDE ("${escapedGeometryColumnName}", ${CATALOG_ROW_ID_COLUMN}),
      CASE WHEN geom_wkt.wkt IS NULL THEN NULL ELSE ST_GeomFromText(geom_wkt.wkt) END AS ${INTERNAL_COLUMN.GEOM}
    FROM source
    LEFT JOIN geom_wkt USING (${CATALOG_ROW_ID_COLUMN})
  `;
}

function buildPolygonGeometrySql(
  rawTableName: string,
  tempTableName: string,
  geometryColumnName: string
): string {
  const escapedRawTableName = escapeIdentifier(rawTableName);
  const escapedTempTableName = escapeIdentifier(tempTableName);
  const escapedGeometryColumnName = escapeIdentifier(geometryColumnName);

  return `
    CREATE OR REPLACE TEMP TABLE "${escapedTempTableName}" AS
    WITH source AS (
      SELECT row_number() OVER () AS ${CATALOG_ROW_ID_COLUMN}, *
      FROM "${escapedRawTableName}"
    ),
    rings AS (
      SELECT ${CATALOG_ROW_ID_COLUMN}, ring, ring_index
      FROM source,
      unnest("${escapedGeometryColumnName}") WITH ORDINALITY AS r(ring, ring_index)
    ),
    points AS (
      SELECT ${CATALOG_ROW_ID_COLUMN}, ring_index, point, point_index
      FROM rings,
      unnest(ring) WITH ORDINALITY AS pt(point, point_index)
    ),
    ring_wkt AS (
      SELECT
        ${CATALOG_ROW_ID_COLUMN},
        ring_index,
        '(' || string_agg(${pointExpression('point')}, ', ' ORDER BY point_index) || ')' AS wkt
      FROM points
      GROUP BY ${CATALOG_ROW_ID_COLUMN}, ring_index
    ),
    geom_wkt AS (
      SELECT
        ${CATALOG_ROW_ID_COLUMN},
        'POLYGON (' || string_agg(wkt, ', ' ORDER BY ring_index) || ')' AS wkt
      FROM ring_wkt
      GROUP BY ${CATALOG_ROW_ID_COLUMN}
    )
    SELECT
      source.* EXCLUDE ("${escapedGeometryColumnName}", ${CATALOG_ROW_ID_COLUMN}),
      CASE WHEN geom_wkt.wkt IS NULL THEN NULL ELSE ST_GeomFromText(geom_wkt.wkt) END AS ${INTERNAL_COLUMN.GEOM}
    FROM source
    LEFT JOIN geom_wkt USING (${CATALOG_ROW_ID_COLUMN})
  `;
}

function buildMultiPointGeometrySql(
  rawTableName: string,
  tempTableName: string,
  geometryColumnName: string
): string {
  const escapedRawTableName = escapeIdentifier(rawTableName);
  const escapedTempTableName = escapeIdentifier(tempTableName);
  const escapedGeometryColumnName = escapeIdentifier(geometryColumnName);

  return `
    CREATE OR REPLACE TEMP TABLE "${escapedTempTableName}" AS
    WITH source AS (
      SELECT row_number() OVER () AS ${CATALOG_ROW_ID_COLUMN}, *
      FROM "${escapedRawTableName}"
    ),
    points AS (
      SELECT ${CATALOG_ROW_ID_COLUMN}, point, point_index
      FROM source,
      unnest("${escapedGeometryColumnName}") WITH ORDINALITY AS pt(point, point_index)
    ),
    geom_wkt AS (
      SELECT
        ${CATALOG_ROW_ID_COLUMN},
        'MULTIPOINT (' || string_agg('(' || ${pointExpression('point')} || ')', ', ' ORDER BY point_index) || ')' AS wkt
      FROM points
      GROUP BY ${CATALOG_ROW_ID_COLUMN}
    )
    SELECT
      source.* EXCLUDE ("${escapedGeometryColumnName}", ${CATALOG_ROW_ID_COLUMN}),
      CASE WHEN geom_wkt.wkt IS NULL THEN NULL ELSE ST_GeomFromText(geom_wkt.wkt) END AS ${INTERNAL_COLUMN.GEOM}
    FROM source
    LEFT JOIN geom_wkt USING (${CATALOG_ROW_ID_COLUMN})
  `;
}

function buildMultiLineStringGeometrySql(
  rawTableName: string,
  tempTableName: string,
  geometryColumnName: string
): string {
  const escapedRawTableName = escapeIdentifier(rawTableName);
  const escapedTempTableName = escapeIdentifier(tempTableName);
  const escapedGeometryColumnName = escapeIdentifier(geometryColumnName);

  return `
    CREATE OR REPLACE TEMP TABLE "${escapedTempTableName}" AS
    WITH source AS (
      SELECT row_number() OVER () AS ${CATALOG_ROW_ID_COLUMN}, *
      FROM "${escapedRawTableName}"
    ),
    lines AS (
      SELECT ${CATALOG_ROW_ID_COLUMN}, line, line_index
      FROM source,
      unnest("${escapedGeometryColumnName}") WITH ORDINALITY AS l(line, line_index)
    ),
    points AS (
      SELECT ${CATALOG_ROW_ID_COLUMN}, line_index, point, point_index
      FROM lines,
      unnest(line) WITH ORDINALITY AS pt(point, point_index)
    ),
    line_wkt AS (
      SELECT
        ${CATALOG_ROW_ID_COLUMN},
        line_index,
        '(' || string_agg(${pointExpression('point')}, ', ' ORDER BY point_index) || ')' AS wkt
      FROM points
      GROUP BY ${CATALOG_ROW_ID_COLUMN}, line_index
    ),
    geom_wkt AS (
      SELECT
        ${CATALOG_ROW_ID_COLUMN},
        'MULTILINESTRING (' || string_agg(wkt, ', ' ORDER BY line_index) || ')' AS wkt
      FROM line_wkt
      GROUP BY ${CATALOG_ROW_ID_COLUMN}
    )
    SELECT
      source.* EXCLUDE ("${escapedGeometryColumnName}", ${CATALOG_ROW_ID_COLUMN}),
      CASE WHEN geom_wkt.wkt IS NULL THEN NULL ELSE ST_GeomFromText(geom_wkt.wkt) END AS ${INTERNAL_COLUMN.GEOM}
    FROM source
    LEFT JOIN geom_wkt USING (${CATALOG_ROW_ID_COLUMN})
  `;
}

function buildMultiPolygonGeometrySql(
  rawTableName: string,
  tempTableName: string,
  geometryColumnName: string
): string {
  const escapedRawTableName = escapeIdentifier(rawTableName);
  const escapedTempTableName = escapeIdentifier(tempTableName);
  const escapedGeometryColumnName = escapeIdentifier(geometryColumnName);

  return `
    CREATE OR REPLACE TEMP TABLE "${escapedTempTableName}" AS
    WITH source AS (
      SELECT row_number() OVER () AS ${CATALOG_ROW_ID_COLUMN}, *
      FROM "${escapedRawTableName}"
    ),
    polygons AS (
      SELECT ${CATALOG_ROW_ID_COLUMN}, polygon, polygon_index
      FROM source,
      unnest("${escapedGeometryColumnName}") WITH ORDINALITY AS p(polygon, polygon_index)
    ),
    rings AS (
      SELECT ${CATALOG_ROW_ID_COLUMN}, polygon_index, ring, ring_index
      FROM polygons,
      unnest(polygon) WITH ORDINALITY AS r(ring, ring_index)
    ),
    points AS (
      SELECT ${CATALOG_ROW_ID_COLUMN}, polygon_index, ring_index, point, point_index
      FROM rings,
      unnest(ring) WITH ORDINALITY AS pt(point, point_index)
    ),
    ring_wkt AS (
      SELECT
        ${CATALOG_ROW_ID_COLUMN},
        polygon_index,
        ring_index,
        '(' || string_agg(${pointExpression('point')}, ', ' ORDER BY point_index) || ')' AS wkt
      FROM points
      GROUP BY ${CATALOG_ROW_ID_COLUMN}, polygon_index, ring_index
    ),
    polygon_wkt AS (
      SELECT
        ${CATALOG_ROW_ID_COLUMN},
        polygon_index,
        '(' || string_agg(wkt, ', ' ORDER BY ring_index) || ')' AS wkt
      FROM ring_wkt
      GROUP BY ${CATALOG_ROW_ID_COLUMN}, polygon_index
    ),
    geom_wkt AS (
      SELECT
        ${CATALOG_ROW_ID_COLUMN},
        'MULTIPOLYGON (' || string_agg(wkt, ', ' ORDER BY polygon_index) || ')' AS wkt
      FROM polygon_wkt
      GROUP BY ${CATALOG_ROW_ID_COLUMN}
    )
    SELECT
      source.* EXCLUDE ("${escapedGeometryColumnName}", ${CATALOG_ROW_ID_COLUMN}),
      CASE WHEN geom_wkt.wkt IS NULL THEN NULL ELSE ST_GeomFromText(geom_wkt.wkt) END AS ${INTERNAL_COLUMN.GEOM}
    FROM source
    LEFT JOIN geom_wkt USING (${CATALOG_ROW_ID_COLUMN})
  `;
}

function buildNativeGeoArrowGeometrySql(
  rawTableName: string,
  tempTableName: string,
  geometryColumn: DuckTableColumnInfo,
  expectedKind: CatalogGeometryKind
): string {
  const geometryKind = getNativeGeoArrowGeometryKind(
    geometryColumn,
    expectedKind
  );
  const dataType = geometryColumn.data_type.replace(/\s+/g, ' ').toUpperCase();

  switch (geometryKind) {
    case 'point':
      return buildPointGeometrySql(
        rawTableName,
        tempTableName,
        geometryColumn.column_name,
        dataType.endsWith('[]')
      );
    case 'linestring':
      return buildLineStringGeometrySql(
        rawTableName,
        tempTableName,
        geometryColumn.column_name
      );
    case 'polygon':
      return buildPolygonGeometrySql(
        rawTableName,
        tempTableName,
        geometryColumn.column_name
      );
    case 'multipoint':
      return buildMultiPointGeometrySql(
        rawTableName,
        tempTableName,
        geometryColumn.column_name
      );
    case 'multilinestring':
      return buildMultiLineStringGeometrySql(
        rawTableName,
        tempTableName,
        geometryColumn.column_name
      );
    case 'multipolygon':
      return buildMultiPolygonGeometrySql(
        rawTableName,
        tempTableName,
        geometryColumn.column_name
      );
    default:
      throw new Error(`Unsupported catalog geometry kind: ${geometryKind}`);
  }
}

function buildWkbGeometrySql(
  rawTableName: string,
  tempTableName: string,
  geometryColumnName: string
): string {
  const escapedRawTableName = escapeIdentifier(rawTableName);
  const escapedTempTableName = escapeIdentifier(tempTableName);
  const escapedGeometryColumnName = escapeIdentifier(geometryColumnName);

  return `
    CREATE OR REPLACE TEMP TABLE "${escapedTempTableName}" AS
    SELECT
      * EXCLUDE ("${escapedGeometryColumnName}"),
      ST_GeomFromWKB("${escapedGeometryColumnName}") AS ${INTERNAL_COLUMN.GEOM}
    FROM "${escapedRawTableName}"
  `;
}

async function materializeCatalogParquetWithReadParquet(
  resolvedBasemapId: string,
  arrayBuffer: ArrayBuffer,
  tempTableName: string,
  geometryKind: CatalogGeometryKind
): Promise<void> {
  const duckDBFilename = await ensureCatalogParquetRegistered(
    resolvedBasemapId,
    arrayBuffer
  );
  const rawTableName = `${tempTableName}_raw`;
  const escapedRawTableName = escapeIdentifier(rawTableName);
  const escapedTempTableName = escapeIdentifier(tempTableName);

  await Duck.query(
    `CREATE OR REPLACE TEMP TABLE "${escapedRawTableName}" AS SELECT * FROM read_parquet('${escapeSqlString(duckDBFilename)}')`
  );

  try {
    const columns = (await Duck.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = '${escapeSqlString(rawTableName)}'`,
      { format: 'array' }
    )) as DuckTableColumnInfo[];
    const geometryColumn = columns.find(isGeometryColumnCandidate);

    if (!geometryColumn) {
      throw new Error(
        `No geometry column found in native GeoParquet table: ${resolvedBasemapId}`
      );
    }

    const dataType = geometryColumn.data_type.toUpperCase();
    const geometryColumnName = escapeIdentifier(geometryColumn.column_name);

    if (dataType.startsWith('GEOMETRY')) {
      const canonicalGeometrySelect =
        geometryColumn.column_name === INTERNAL_COLUMN.GEOM
          ? '*'
          : `* EXCLUDE ("${geometryColumnName}"), "${geometryColumnName}" AS ${INTERNAL_COLUMN.GEOM}`;

      await Duck.query(
        `CREATE OR REPLACE TEMP TABLE "${escapedTempTableName}" AS SELECT ${canonicalGeometrySelect} FROM "${escapedRawTableName}"`
      );
      return;
    }

    if (dataType === 'BLOB' || dataType.includes('WKB')) {
      await Duck.query(
        buildWkbGeometrySql(
          rawTableName,
          tempTableName,
          geometryColumn.column_name
        )
      );
      return;
    }

    if (dataType.includes('STRUCT(X DOUBLE, Y DOUBLE)')) {
      await Duck.query(
        buildNativeGeoArrowGeometrySql(
          rawTableName,
          tempTableName,
          geometryColumn,
          geometryKind
        )
      );
      return;
    }

    throw new Error(
      `Unsupported catalog GeoParquet geometry type: ${geometryColumn.data_type}`
    );
  } finally {
    await Duck.query(`DROP TABLE IF EXISTS "${escapedRawTableName}"`);
  }
}

function isSimplificationLevel(
  value: string | null | undefined
): value is SimplificationLevel {
  return (
    value === SimplificationLevel.Low ||
    value === SimplificationLevel.Medium ||
    value === SimplificationLevel.High
  );
}

export function getBasemapSimplificationLevel(
  metadata: BasemapMetadata
): SimplificationLevel | null {
  return isSimplificationLevel(metadata.simplification_level)
    ? metadata.simplification_level
    : null;
}

export function getBasemapVariantFamily(file: string): string {
  return file.replace(SIMPLIFICATION_LEVEL_SUFFIX_REGEX, '');
}

export function getAvailableBasemapSimplificationLevels(
  basemaps: BasemapMetadata[],
  basemapFile: string
): SimplificationLevel[] {
  const family = getBasemapVariantFamily(basemapFile);
  const levels = new Set<SimplificationLevel>();

  for (const basemap of basemaps) {
    if (getBasemapVariantFamily(basemap.file) !== family) {
      continue;
    }

    const level = getBasemapSimplificationLevel(basemap);
    if (!level) {
      continue;
    }

    levels.add(level);
  }

  return SIMPLIFICATION_LEVEL_ORDER.filter((level) => levels.has(level));
}

export function getPreferredCatalogBasemapLevel(
  basemaps: BasemapMetadata[],
  basemapFile: string
): SimplificationLevel | null {
  const availableLevels = getAvailableBasemapSimplificationLevels(
    basemaps,
    basemapFile
  );

  for (const level of CATALOG_SIMPLIFICATION_PRIORITY) {
    if (availableLevels.includes(level)) {
      return level;
    }
  }

  return null;
}

export function getPreferredBasemapFile(
  basemaps: BasemapMetadata[],
  basemapFile: string
): string {
  if (basemaps.some((candidate) => candidate.file === basemapFile)) {
    return basemapFile;
  }

  const preferredLevel = getPreferredCatalogBasemapLevel(basemaps, basemapFile);
  if (!preferredLevel) {
    return basemapFile;
  }

  return `${getBasemapVariantFamily(basemapFile)}-${preferredLevel}`;
}

export function getPreferredBasemapSimplificationLevel(
  basemaps: BasemapMetadata[],
  metadata: BasemapMetadata,
  requestedLevel?: SimplificationLevel | null
): SimplificationLevel | null {
  const availableLevels = getAvailableBasemapSimplificationLevels(
    basemaps,
    metadata.file
  );

  if (availableLevels.length === 0) {
    return null;
  }

  const currentLevel = getBasemapSimplificationLevel(metadata);
  const candidateLevels = [
    requestedLevel,
    currentLevel,
    SimplificationLevel.Medium,
    SimplificationLevel.High,
    SimplificationLevel.Low
  ];

  for (const level of candidateLevels) {
    if (level && availableLevels.includes(level)) {
      return level;
    }
  }

  return availableLevels[0] ?? null;
}

export function resolveBasemapVariantFile(
  file: string,
  currentLevel: string | undefined,
  nextLevel: SimplificationLevel
): string | null {
  if (!isSimplificationLevel(currentLevel)) {
    return null;
  }

  return file.replace(new RegExp(`-${currentLevel}$`), `-${nextLevel}`);
}

export interface LoadedBasemapVariantData {
  metadata: BasemapMetadata;
  geometryTable: ArrowTable;
  layerTables: Map<string, ArrowTable>;
}

interface LoadedBasemapVariantState extends LoadedBasemapVariantData {
  failedLayerFiles: Set<string>;
  loadingLayerTables: Map<string, Promise<ArrowTable | null>>;
}

interface LoadedBasemapVariantContainer extends LoadedBasemapVariantData {
  simplifiedVariants?: Map<SimplificationLevel, LoadedBasemapVariantData>;
  activeSimplificationLevel?: SimplificationLevel | null;
}

interface LoadedBasemap extends LoadedBasemapVariantState {
  simplifiedVariants?: Map<SimplificationLevel, LoadedBasemapVariantState>;
  activeSimplificationLevel?: SimplificationLevel | null;
}

interface DuckTableColumnInfo {
  column_name: string;
  data_type: string;
}

export function getResolvedBasemapVariant(
  loadedBasemap: LoadedBasemapVariantContainer | null,
  level?: SimplificationLevel
): LoadedBasemapVariantData | null {
  if (!loadedBasemap) {
    return null;
  }

  const targetLevel = level ?? loadedBasemap.activeSimplificationLevel;
  const baseLevel = getBasemapSimplificationLevel(loadedBasemap.metadata);

  if (!targetLevel || targetLevel === baseLevel) {
    return loadedBasemap;
  }

  return loadedBasemap.simplifiedVariants?.get(targetLevel) ?? loadedBasemap;
}

function getResolvedBasemapVariantState(
  loadedBasemap: LoadedBasemap | null,
  level?: SimplificationLevel
): LoadedBasemapVariantState | null {
  if (!loadedBasemap) {
    return null;
  }

  const targetLevel = level ?? loadedBasemap.activeSimplificationLevel;
  const baseLevel = getBasemapSimplificationLevel(loadedBasemap.metadata);

  if (!targetLevel || targetLevel === baseLevel) {
    return loadedBasemap;
  }

  return loadedBasemap.simplifiedVariants?.get(targetLevel) ?? loadedBasemap;
}

function isGeometryColumnCandidate(column: DuckTableColumnInfo): boolean {
  const columnName = column.column_name.toLowerCase();
  const dataType = column.data_type.toUpperCase();

  return (
    dataType.startsWith('GEOMETRY') ||
    columnName === INTERNAL_COLUMN.GEOM ||
    columnName === INTERNAL_COLUMN.GEOMETRY ||
    columnName === INTERNAL_COLUMN.WKB_GEOMETRY ||
    columnName === INTERNAL_COLUMN.THE_GEOM
  );
}

function findBasemapMetadataByFile(
  basemaps: BasemapMetadata[],
  file: string
): BasemapMetadata | null {
  return basemaps.find((basemap) => basemap.file === file) ?? null;
}

export function findBasemapLayerByType(
  metadata: BasemapMetadata,
  layerType: BasemapLayerType
): BasemapMetadata['layers'][number] | null {
  return metadata.layers.find((layer) => layer.type === layerType) ?? null;
}

export function getCustomBasemapLayerGeometryTypeOverride(
  layerType: BasemapLayerType | null | undefined
): string | undefined {
  switch (layerType) {
    case BasemapLayerType.LIMIT:
    case BasemapLayerType.LINE:
      return GEOMETRY_WKT_TYPES.MULTI_LINE_STRING;
    case BasemapLayerType.CENTROID:
    case BasemapLayerType.POINT:
      return GEOMETRY_WKT_TYPES.POINT;
    case BasemapLayerType.POLYGON:
      return GEOMETRY_WKT_TYPES.MULTI_POLYGON;
    default:
      return undefined;
  }
}

function createLoadedBasemapVariant(
  metadata: BasemapMetadata,
  geometryTable: ArrowTable,
  layerTables: Map<string, ArrowTable>
): LoadedBasemapVariantState {
  return {
    metadata,
    geometryTable,
    layerTables,
    failedLayerFiles: new Set(),
    loadingLayerTables: new Map()
  };
}

function createBasemapService() {
  let availableBasemaps: BasemapMetadata[] = [];
  let isInitialized = false;
  let initializePromise: Promise<void> | null = null;
  let currentBasemap: LoadedBasemap | null = null;
  let simplificationVersion = $state(0);
  let attributesLoaded = false;
  let projectionPresetsData: ProjectionPresets | null = null;
  let stylePresetsData: StylePresets | null = null;
  const basemapCache = new Map<string, LoadedBasemap>();
  const geometryTablesInDuckDB = new Set<string>();
  const loadingBasemaps = new Map<string, Promise<LoadedBasemap | null>>();

  async function loadMetadata(): Promise<void> {
    try {
      const response = await fetch(
        resolveStaticAssetUrl(BASEMAP_METADATA_PATH)
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.statusText}`);
      }

      availableBasemaps = await response.json();
    } catch (error) {
      logger.error('Failed to load basemap metadata', LogCategory.MAP, error);
      throw error;
    }
  }

  async function loadAttributesIntoDuckDB(): Promise<void> {
    if (!Duck || attributesLoaded) return;

    try {
      const response = await fetch(
        resolveStaticAssetUrl(BASEMAP_ATTRIBUTES_PATH)
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch attributes: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer]);
      const attributesFile = new File(
        [blob],
        'all-basemaps-attributes.parquet',
        {
          type: 'application/octet-stream'
        }
      );

      await Duck.register_files([attributesFile]);

      const fileId =
        (attributesFile as File & { id?: string }).id ||
        `${attributesFile.lastModified}-${attributesFile.name}`;

      const escapedFileId = escapeSqlString(fileId);

      const result = await Duck.query(
        `CREATE OR REPLACE TABLE basemap_attributes AS SELECT * FROM parquet_scan('${escapedFileId}')`
      );

      if (!result) {
        throw new Error('Failed to create basemap_attributes table');
      }

      attributesLoaded = true;
    } catch (error) {
      logger.error('Failed to load basemap attributes', LogCategory.MAP, error);
      throw error;
    }
  }

  async function loadProjectionPresets(): Promise<void> {
    try {
      const response = await fetch(
        resolveStaticAssetUrl(PROJECTION_PRESETS_PATH)
      );
      if (!response.ok) {
        logger.warn('Failed to fetch projection presets', LogCategory.MAP);
        return;
      }
      projectionPresetsData = await response.json();
    } catch (error) {
      logger.warn('Failed to load projection presets', LogCategory.MAP, error);
    }
  }

  async function loadStylePresets(): Promise<void> {
    try {
      const response = await fetch(resolveStaticAssetUrl(STYLE_PRESETS_PATH));
      if (!response.ok) {
        logger.warn('Failed to fetch style presets', LogCategory.MAP);
        return;
      }
      stylePresetsData = await response.json();
    } catch (error) {
      logger.warn('Failed to load style presets', LogCategory.MAP, error);
    }
  }

  async function loadGeometryFromParquet(
    filename: string,
    bbox?: [number, number, number, number]
  ): Promise<ArrowTable> {
    const url = getGeometryParquetUrl(filename);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch geometry ${filename}: ${response.statusText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return readGeoParquetDirect(arrayBuffer, bbox);
  }

  async function doesDuckTableExist(tableName: string): Promise<boolean> {
    if (!Duck) {
      return false;
    }

    const escapedTableName = escapeSqlString(tableName);
    const tableExists = (await Duck.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_name = '${escapedTableName}'`,
      { format: 'array' }
    )) as Array<{ table_name: string }>;

    return tableExists.length > 0;
  }

  async function loadGeometryFromDuckTable(
    tableName: string,
    projectColumns?: readonly string[] | null,
    geometryTypeOverride?: string
  ): Promise<ArrowTable> {
    if (!Duck) {
      throw new Error('DuckDB not initialized');
    }

    const { table: rawTable, geomColumn } = await fetchArrowTableWithGeometry(
      tableName,
      Duck,
      null,
      null,
      projectColumns
    );
    return addGeoArrowMetadataFromDuckDB(
      rawTable,
      tableName,
      Duck,
      undefined,
      geomColumn,
      geometryTypeOverride ? { geometryType: geometryTypeOverride } : undefined
    );
  }

  async function resolveCustomBasemapGeometryProjectColumns(
    tableName: string
  ): Promise<string[]> {
    if (!Duck) {
      throw new Error('DuckDB not initialized');
    }

    const columns = await Duck.analyse(tableName);
    return getCustomBasemapGeometryProjectColumns(columns);
  }

  function getLoadableMetadataLayers(
    metadata: BasemapMetadata,
    layerTypes?: readonly BasemapLayerType[]
  ): BasemapMetadata['layers'] {
    const requestedTypes = layerTypes ? new Set(layerTypes) : null;
    return metadata.layers.filter(
      (layer) =>
        !!layer.file && (!requestedTypes || requestedTypes.has(layer.type))
    );
  }

  async function loadBasemapLayerTable(
    metadata: BasemapMetadata,
    layerFile: string
  ): Promise<ArrowTable> {
    const shouldReadFromDuck =
      metadata.isCustom && (await doesDuckTableExist(layerFile));
    const customLayerType = shouldReadFromDuck
      ? metadata.layers.find((layer) => layer.file === layerFile)?.type
      : null;
    const projectColumns = shouldReadFromDuck
      ? await resolveCustomBasemapGeometryProjectColumns(layerFile)
      : null;
    return shouldReadFromDuck
      ? loadGeometryFromDuckTable(
          layerFile,
          projectColumns,
          getCustomBasemapLayerGeometryTypeOverride(customLayerType)
        )
      : loadGeometryFromParquet(layerFile);
  }

  function updateProjectionFromTable(geometryTable: ArrowTable): void {
    if (projectionStore.referenceBbox !== null) {
      return;
    }

    const geoMetadata = geometryTable.schema.metadata?.get('geo');
    if (geoMetadata) {
      projectionStore.setReferenceBboxFromMetadata(geoMetadata);
    }
  }

  async function loadBasemapInternal(
    basemapId: string
  ): Promise<LoadedBasemap | null> {
    if (!isInitialized) {
      await initialize();
    }

    const resolvedBasemapId = getPreferredBasemapFile(
      availableBasemaps,
      basemapId
    );
    const metadata = availableBasemaps.find(
      (basemap) => basemap.file === resolvedBasemapId
    );

    if (!metadata) {
      logger.warn(`Basemap not found: ${basemapId}`, LogCategory.MAP);
      return null;
    }

    loadingStore.start();
    try {
      const geometryTable = metadata.isCustom
        ? await loadCustomBasemapGeometry(metadata)
        : await loadGeometryFromParquet(metadata.file, metadata.bbox);

      currentBasemap = createLoadedBasemapVariant(
        metadata,
        geometryTable,
        new Map()
      );

      basemapCache.set(resolvedBasemapId, currentBasemap);
      updateProjectionFromTable(geometryTable);

      return currentBasemap;
    } catch (error) {
      logger.error(
        `Failed to load basemap: ${basemapId}`,
        LogCategory.MAP,
        error
      );
      return null;
    } finally {
      loadingStore.stop();
    }
  }

  async function loadCustomBasemapGeometry(
    metadata: BasemapMetadata
  ): Promise<ArrowTable> {
    const customTableName = metadata.file;
    const tableExists = await doesDuckTableExist(customTableName);

    if (!tableExists) {
      throw new Error(`Custom basemap table not found: ${customTableName}`);
    }

    const projectColumns =
      await resolveCustomBasemapGeometryProjectColumns(customTableName);
    return loadGeometryFromDuckTable(customTableName, projectColumns);
  }

  async function loadGeometryIntoDuckDB(basemapId: string): Promise<string> {
    const normalizedBasemapId =
      typeof basemapId === 'string' ? basemapId.trim() : '';
    if (!normalizedBasemapId) {
      throw new Error('Invalid basemap id for geometry loading');
    }

    const resolvedBasemapId = getPreferredBasemapFile(
      availableBasemaps,
      normalizedBasemapId
    );

    const isCustomBasemap = /^custom_basemap_/i.test(resolvedBasemapId);
    const tableName = isCustomBasemap
      ? resolvedBasemapId
      : `basemap_geom_${resolvedBasemapId.replace(/[^a-zA-Z0-9_]/g, '_')}`;

    if (geometryTablesInDuckDB.has(tableName)) {
      return tableName;
    }

    if (!Duck) {
      throw new Error('DuckDB not initialized');
    }

    if (isCustomBasemap) {
      const escapedBasemapId = escapeSqlString(resolvedBasemapId);
      const existingTable = (await Duck.query(
        `SELECT table_name FROM information_schema.tables WHERE table_name = '${escapedBasemapId}'`,
        { format: 'array' }
      )) as Array<{ table_name: string }>;

      if (existingTable?.length) {
        geometryTablesInDuckDB.add(tableName);
        return tableName;
      }
    }

    try {
      const url = getGeometryParquetUrl(resolvedBasemapId);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch geometry: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const escapedTableName = escapeIdentifier(tableName);
      const tempTableName = `tmp_${tableName}_${Date.now()}`;
      const escapedTempTableName = escapeIdentifier(tempTableName);
      const catalogGeometryKind = getCatalogGeometryKind(
        availableBasemaps,
        resolvedBasemapId
      );

      try {
        await materializeCatalogParquetWithSTRead(
          resolvedBasemapId,
          arrayBuffer,
          tempTableName
        );
      } catch (error) {
        logger.warn(
          'Catalog GeoParquet ST_Read failed, using DuckDB read_parquet materialization',
          LogCategory.MAP,
          {
            basemapId: normalizedBasemapId,
            resolvedBasemapId,
            error
          }
        );
        await Duck.query(`DROP TABLE IF EXISTS "${escapedTempTableName}"`);
        await materializeCatalogParquetWithReadParquet(
          resolvedBasemapId,
          arrayBuffer,
          tempTableName,
          catalogGeometryKind
        );
      }

      try {
        const columns = (await Duck.query(
          `SELECT column_name, data_type FROM information_schema.columns
           WHERE table_name = '${escapeSqlString(tempTableName)}'`,
          { format: 'array' }
        )) as DuckTableColumnInfo[];
        const geometryColumn = columns.find(isGeometryColumnCandidate);

        if (!geometryColumn) {
          throw new Error(
            `No geometry column found in basemap table: ${resolvedBasemapId}`
          );
        }

        const geometryColumnName = escapeIdentifier(geometryColumn.column_name);
        const canonicalGeometrySelect =
          geometryColumn.column_name === INTERNAL_COLUMN.GEOM
            ? '*'
            : `* EXCLUDE ("${geometryColumnName}"), "${geometryColumnName}" AS ${INTERNAL_COLUMN.GEOM}`;

        await Duck.query(
          `CREATE OR REPLACE TABLE "${escapedTableName}" AS SELECT ${canonicalGeometrySelect} FROM "${escapedTempTableName}"`
        );

        geometryTablesInDuckDB.add(tableName);
      } finally {
        await Duck.query(`DROP TABLE IF EXISTS "${escapedTempTableName}"`);
      }

      return tableName;
    } catch (error) {
      logger.error(
        'Failed to load basemap geometry into DuckDB',
        LogCategory.MAP,
        {
          basemapId: normalizedBasemapId,
          resolvedBasemapId,
          error
        }
      );
      throw error;
    }
  }

  function getCachedBasemap(basemapId: string): LoadedBasemap | null {
    const resolvedBasemapId = getPreferredBasemapFile(
      availableBasemaps,
      basemapId
    );
    return basemapCache.get(resolvedBasemapId) ?? null;
  }

  function getCachedGeometryTable(basemapId: string): ArrowTable | null {
    const cached = getCachedBasemap(basemapId);
    if (!cached) return null;
    return getResolvedGeometryTable(cached) ?? cached.geometryTable ?? null;
  }

  async function loadBasemap(basemapId: string): Promise<LoadedBasemap | null> {
    const resolvedBasemapId = getPreferredBasemapFile(
      availableBasemaps,
      basemapId
    );

    if (basemapCache.has(resolvedBasemapId)) {
      currentBasemap = basemapCache.get(resolvedBasemapId)!;
      const baseLevel = getBasemapSimplificationLevel(currentBasemap.metadata);
      if (currentBasemap.activeSimplificationLevel !== baseLevel) {
        currentBasemap.activeSimplificationLevel = baseLevel;
        simplificationVersion += 1;
      }
      updateProjectionFromTable(
        getResolvedGeometryTable(currentBasemap) ?? currentBasemap.geometryTable
      );
      return currentBasemap;
    }

    const existing = loadingBasemaps.get(resolvedBasemapId);
    if (existing) {
      return existing;
    }

    const promise = loadBasemapInternal(resolvedBasemapId);
    loadingBasemaps.set(resolvedBasemapId, promise);

    try {
      return await promise;
    } finally {
      loadingBasemaps.delete(resolvedBasemapId);
    }
  }

  async function loadDefaultBasemap(): Promise<LoadedBasemap | null> {
    return loadBasemap(DEFAULT_BASEMAP_ID);
  }

  function upsertCustomBasemapMetadata(metadata: BasemapMetadata): void {
    const idx = availableBasemaps.findIndex(
      (basemap) => basemap.file === metadata.file
    );
    if (idx === -1) {
      availableBasemaps.push(metadata);
    } else {
      availableBasemaps[idx] = metadata;
    }
  }

  function registerCustomBasemapMetadata(metadata: BasemapMetadata): void {
    upsertCustomBasemapMetadata(metadata);
  }

  async function registerCustomBasemap(
    metadata: BasemapMetadata,
    geometryTable: ArrowTable
  ): Promise<void> {
    upsertCustomBasemapMetadata(metadata);
    const loaded: LoadedBasemap = createLoadedBasemapVariant(
      metadata,
      geometryTable,
      new Map()
    );
    basemapCache.set(metadata.file, loaded);
    currentBasemap = loaded;

    logger.info('Custom basemap registered', LogCategory.MAP, {
      basemapId: metadata.file,
      rows: geometryTable.numRows,
      metadataLayerCount: metadata.layers.length
    });
  }

  async function refreshCustomBasemap(
    basemapId: string
  ): Promise<ArrowTable | null> {
    const loadedBasemap = basemapCache.get(basemapId);
    if (!loadedBasemap?.metadata.isCustom) {
      return null;
    }

    const geometryTable = await loadCustomBasemapGeometry(
      loadedBasemap.metadata
    );
    const layerTables = new Map<string, ArrowTable>();

    for (const layer of getLoadableMetadataLayers(loadedBasemap.metadata)) {
      const layerFile = layer.file;
      if (!layerFile || !(await doesDuckTableExist(layerFile))) {
        continue;
      }

      layerTables.set(layerFile, await loadGeometryFromDuckTable(layerFile));
    }

    loadedBasemap.geometryTable = geometryTable;
    loadedBasemap.layerTables = layerTables;
    loadedBasemap.activeSimplificationLevel = null;
    loadedBasemap.simplifiedVariants?.clear();

    if (currentBasemap?.metadata.file === basemapId) {
      currentBasemap = loadedBasemap;
      updateProjectionFromTable(geometryTable);
    }

    return geometryTable;
  }

  function getResolvedLayerTables(
    loadedBasemap: LoadedBasemap | null
  ): Map<string, ArrowTable> {
    return getResolvedBasemapVariant(loadedBasemap)?.layerTables ?? new Map();
  }

  function getResolvedGeometryTable(
    loadedBasemap: LoadedBasemap | null
  ): ArrowTable | null {
    return getResolvedBasemapVariant(loadedBasemap)?.geometryTable ?? null;
  }

  function getResolvedMetadata(
    loadedBasemap: LoadedBasemap | null
  ): BasemapMetadata | null {
    return getResolvedBasemapVariant(loadedBasemap)?.metadata ?? null;
  }

  function getResolvedVariantData(
    basemapId: string,
    level?: SimplificationLevel
  ): LoadedBasemapVariantData | null {
    return getResolvedBasemapVariant(
      basemapCache.get(basemapId) ?? null,
      level
    );
  }

  async function getBasemapGeometryArrow(
    basemapId: string
  ): Promise<ArrowTable | null> {
    if (!isInitialized) {
      await initialize();
    }
    const resolvedBasemapId = getPreferredBasemapFile(
      availableBasemaps,
      basemapId
    );
    const cached = basemapCache.get(resolvedBasemapId);
    if (cached) {
      const variant = getResolvedBasemapVariant(cached);
      const geometryTable = variant?.geometryTable ?? cached.geometryTable;
      if (geometryTable) {
        currentBasemap = cached;
        updateProjectionFromTable(geometryTable);
        return geometryTable;
      }
    }
    const loaded = await loadBasemapInternal(basemapId);
    if (!loaded) return null;
    const variant = getResolvedBasemapVariant(loaded);
    return variant?.geometryTable ?? loaded.geometryTable ?? null;
  }

  async function loadVariant(
    basemapId: string,
    variantFile: string,
    level: SimplificationLevel
  ): Promise<ArrowTable | null> {
    const loadedBasemap = basemapCache.get(basemapId);
    if (!loadedBasemap) {
      throw new Error(`Basemap not loaded: ${basemapId}`);
    }

    if (!loadedBasemap.simplifiedVariants) {
      loadedBasemap.simplifiedVariants = new Map();
    }

    const baseLevel = getBasemapSimplificationLevel(loadedBasemap.metadata);
    const previousLevel = loadedBasemap.activeSimplificationLevel ?? baseLevel;
    if (variantFile === loadedBasemap.metadata.file || level === baseLevel) {
      loadedBasemap.activeSimplificationLevel = level;
      if (previousLevel !== level) {
        simplificationVersion += 1;
      }
      return loadedBasemap.geometryTable;
    }

    if (loadedBasemap.simplifiedVariants.has(level)) {
      loadedBasemap.activeSimplificationLevel = level;
      if (previousLevel !== level) {
        simplificationVersion += 1;
      }
      return loadedBasemap.simplifiedVariants.get(level)?.geometryTable ?? null;
    }

    const variantMetadata = findBasemapMetadataByFile(
      availableBasemaps,
      variantFile
    );

    if (!variantMetadata) {
      logger.warn('Basemap variant metadata not available', LogCategory.MAP, {
        basemapId,
        variantFile,
        level
      });
      return null;
    }

    const geometryTable = await loadGeometryFromParquet(
      variantMetadata.file,
      variantMetadata.bbox
    );
    const variant = createLoadedBasemapVariant(
      variantMetadata,
      geometryTable,
      new Map()
    );

    loadedBasemap.simplifiedVariants.set(level, variant);
    loadedBasemap.activeSimplificationLevel = level;
    if (previousLevel !== level) {
      simplificationVersion += 1;
    }
    updateProjectionFromTable(geometryTable);

    return geometryTable;
  }

  async function ensureVariantLayersLoaded(
    variant: LoadedBasemapVariantState,
    layerTypes?: readonly BasemapLayerType[]
  ): Promise<boolean> {
    const loadableLayers = getLoadableMetadataLayers(
      variant.metadata,
      layerTypes
    );
    if (loadableLayers.length === 0) {
      return false;
    }

    let startedNewLoad = false;
    const pendingLoads: Promise<ArrowTable | null>[] = [];

    for (const layer of loadableLayers) {
      const layerFile = layer.file;
      if (!layerFile) {
        continue;
      }

      if (
        variant.layerTables.has(layerFile) ||
        variant.failedLayerFiles.has(layerFile)
      ) {
        continue;
      }

      let loadPromise = variant.loadingLayerTables.get(layerFile);
      if (!loadPromise) {
        startedNewLoad = true;
        loadPromise = loadBasemapLayerTable(variant.metadata, layerFile)
          .then((table) => {
            variant.layerTables.set(layerFile, table);
            variant.failedLayerFiles.delete(layerFile);
            return table;
          })
          .catch((error) => {
            variant.failedLayerFiles.add(layerFile);
            logger.warn('Failed to load basemap layer', LogCategory.MAP, {
              basemapId: variant.metadata.file,
              layerFile,
              error
            });
            return null;
          })
          .finally(() => {
            variant.loadingLayerTables.delete(layerFile);
          });
        variant.loadingLayerTables.set(layerFile, loadPromise);
      }

      pendingLoads.push(loadPromise);
    }

    if (!startedNewLoad) {
      return false;
    }

    await Promise.all(pendingLoads);
    return true;
  }

  async function ensureCurrentLayersLoaded(
    layerTypes?: readonly BasemapLayerType[]
  ): Promise<boolean> {
    if (!currentBasemap) {
      return false;
    }

    const resolvedVariant = getResolvedBasemapVariantState(currentBasemap);
    if (!resolvedVariant) {
      return false;
    }

    return ensureVariantLayersLoaded(resolvedVariant, layerTypes);
  }

  async function ensureBasemapLayersLoaded(
    basemapId: string,
    layerTypes?: readonly BasemapLayerType[]
  ): Promise<boolean> {
    const loadedBasemap = await loadBasemap(basemapId);
    if (!loadedBasemap) {
      return false;
    }

    const resolvedVariant = getResolvedBasemapVariantState(loadedBasemap);
    if (!resolvedVariant) {
      return false;
    }

    return ensureVariantLayersLoaded(resolvedVariant, layerTypes);
  }

  async function ensureAttributesLoaded(): Promise<void> {
    if (!Duck || attributesLoaded) {
      return;
    }

    if (!isInitialized) {
      await initialize();
    }

    await loadAttributesIntoDuckDB();
  }

  function getLayerTableByType(layerType: BasemapLayerType): ArrowTable | null {
    if (!currentBasemap) {
      return null;
    }

    const metadata = getResolvedMetadata(currentBasemap);
    if (!metadata) {
      return null;
    }

    const layer = metadata.layers.find(
      (candidate) => candidate.type === layerType
    );

    if (!layer) {
      return null;
    }

    if (!layer.file) {
      return getResolvedGeometryTable(currentBasemap);
    }

    return getResolvedLayerTables(currentBasemap).get(layer.file) ?? null;
  }

  function getBasemapLayerTableByType(
    basemapId: string,
    layerType: BasemapLayerType
  ): ArrowTable | null {
    const resolvedBasemapId = getPreferredBasemapFile(
      availableBasemaps,
      basemapId
    );
    const loadedBasemap = basemapCache.get(resolvedBasemapId) ?? null;
    if (!loadedBasemap) {
      return null;
    }

    const metadata = getResolvedMetadata(loadedBasemap);
    if (!metadata) {
      return null;
    }

    const layer = findBasemapLayerByType(metadata, layerType);
    if (!layer) {
      return null;
    }

    if (!layer.file) {
      return getResolvedGeometryTable(loadedBasemap);
    }

    return getResolvedLayerTables(loadedBasemap).get(layer.file) ?? null;
  }

  interface ResolvedMetadataLayer {
    table: ArrowTable;
    style: string | null;
    type: BasemapLayerType;
    file: string;
  }

  function getLayersByType(
    layerType: BasemapLayerType
  ): ResolvedMetadataLayer[] {
    if (!currentBasemap) return [];

    const results: ResolvedMetadataLayer[] = [];
    const metadata = getResolvedMetadata(currentBasemap);
    if (!metadata) return results;
    const layerTables = getResolvedLayerTables(currentBasemap);

    for (const layer of metadata.layers) {
      if (layer.type !== layerType || !layer.file) continue;
      const table = layerTables.get(layer.file);
      if (!table) continue;
      results.push({
        table,
        style: layer.style ?? null,
        type: layer.type,
        file: layer.file
      });
    }

    return results;
  }

  function clearSimplificationCache(basemapId?: string): void {
    if (basemapId) {
      const loadedBasemap = basemapCache.get(basemapId);
      if (loadedBasemap) {
        loadedBasemap.simplifiedVariants?.clear();
        loadedBasemap.activeSimplificationLevel = null;
      }
    } else {
      for (const [_id, basemap] of basemapCache) {
        basemap.simplifiedVariants?.clear();
        basemap.activeSimplificationLevel = null;
      }
    }
  }

  function reset(): void {
    currentBasemap = null;
    geometryTablesInDuckDB.clear();
  }

  function clearCache(): void {
    basemapCache.clear();
    geometryTablesInDuckDB.clear();
  }

  async function initialize(): Promise<void> {
    if (isInitialized) {
      return;
    }

    if (initializePromise) {
      await initializePromise;
      return;
    }

    initializePromise = (async () => {
      try {
        await Promise.all([
          loadMetadata(),
          loadProjectionPresets(),
          loadStylePresets()
        ]);

        isInitialized = true;
      } catch (error) {
        logger.error(
          'Failed to initialize basemap service',
          LogCategory.MAP,
          error
        );
      } finally {
        initializePromise = null;
      }
    })();

    await initializePromise;
  }

  return {
    initialize,
    loadGeometryIntoDuckDB,
    getBasemapGeometryArrow,
    getCachedBasemap,
    getCachedGeometryTable,
    loadBasemap,
    loadDefaultBasemap,
    registerCustomBasemapMetadata,
    registerCustomBasemap,
    get availableBasemaps(): BasemapMetadata[] {
      return availableBasemaps;
    },
    get currentBasemap(): LoadedBasemap | null {
      return currentBasemap;
    },
    get currentMetadata(): BasemapMetadata | null {
      return getResolvedMetadata(currentBasemap);
    },
    get currentGeometryTable(): ArrowTable | null {
      return getResolvedGeometryTable(currentBasemap);
    },
    get simplificationVersion(): number {
      return simplificationVersion;
    },
    get currentLayers(): Map<string, ArrowTable> {
      return getResolvedLayerTables(currentBasemap);
    },
    getResolvedVariantData,
    getLayerTableByType,
    getBasemapLayerTableByType,
    getLayersByType,
    ensureCurrentLayersLoaded,
    ensureBasemapLayersLoaded,
    ensureAttributesLoaded,
    get projectionPresets(): ProjectionPresets | null {
      return projectionPresetsData;
    },
    get stylePresets(): StylePresets | null {
      return stylePresetsData;
    },
    loadVariant,
    refreshCustomBasemap,
    clearSimplificationCache,
    reset,
    clearCache
  };
}

export const basemapService = createBasemapService();
