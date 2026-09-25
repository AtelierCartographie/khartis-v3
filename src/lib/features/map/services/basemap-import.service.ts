import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import type {
  BasemapLayer,
  BasemapMetadata
} from '$lib/features/map/types/basemap.types';
import { Duck, GEO_CONSTANTS } from '$lib/features/duckdb';
import { generateCustomBasemapAttributes } from './generate-basemap-attributes.service';
import { resolveCustomBasemapGeometryProjectColumns } from './custom-basemap-columns.service';
import { createCustomBasemapGeometryTableFromDuck } from './custom-basemap-geometry.service';
import {
  type GeoParquetColumnMeta,
  readGeoParquetMetadataFromDuck
} from './geo-parquet-metadata.service';
import * as m from '$lib/paraglide/messages';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import {
  createFileFromExtracted,
  extractGeometryColumnCrs,
  extractZip,
  getShapefileFilesFromArchive
} from '$lib/features/data-pipeline';
import { convertGeoPackageToGeoJsonFile } from '../utils/geopackage-browser-fallback.utils';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import {
  getDerivedInnerlinesTableName as getBasemapInnerlinesTableName,
  getDerivedLandTableName as getBasemapLandTableName,
  getDerivedOuterlinesTableName as getBasemapOuterlinesTableName,
  rebuildDerivedGeometryTables
} from '$lib/features/duckdb/operations/derived-geometry';

export {
  getBasemapInnerlinesTableName,
  getBasemapLandTableName,
  getBasemapOuterlinesTableName
};
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  DataValidationError,
  DuckDBError,
  ParseError,
  PipelineError
} from '$lib/features/commons/pipeline.errors';
import {
  FetchTimeoutError,
  fetchWithTimeout
} from '$lib/features/commons/utils/fetch-with-timeout';
import { BASEMAP_FETCH_TIMEOUT_MS } from '$lib/features/map/constants/basemap-fetch.constants';

export interface BasemapImportResult {
  basemap: BasemapMetadata;
  tableName: string;
  geometryTable: ArrowTable;
}

export interface BasemapBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const CUSTOM_BASEMAP_TABLE_PREFIX = 'custom_basemap_';
const RAW_TABLE_SUFFIX = '__raw';
const CENTROIDS_TABLE_SUFFIX = '__centroids';
const BASEMAP_URL_LOAD_ERROR_CODE = 'BASEMAP_URL_LOAD_ERROR';
const SHAPEFILE_FILE_TYPE = 'shapefile';

export function getBasemapRawTableName(tableName: string): string {
  return `${tableName}${RAW_TABLE_SUFFIX}`;
}

export function getBasemapCentroidsTableName(tableName: string): string {
  return `${tableName}${CENTROIDS_TABLE_SUFFIX}`;
}

interface BasemapImportOptions {
  tableName?: string;
}

export function isImportedCustomBasemap(metadata: BasemapMetadata): boolean {
  return (
    metadata.isCustom === true &&
    !metadata.isDatasetGeometry &&
    metadata.file.startsWith(CUSTOM_BASEMAP_TABLE_PREFIX)
  );
}

export async function processBasemapImport(
  file: File,
  options: BasemapImportOptions = {}
): Promise<BasemapImportResult> {
  const tableName =
    options.tableName ?? `${CUSTOM_BASEMAP_TABLE_PREFIX}${Date.now()}`;
  const isZip = file.name.toLowerCase().endsWith('.zip');
  if (isZip) {
    return processZipShapefileImport(file, tableName);
  }

  const isShapefile = file.name.toLowerCase().endsWith('.shp');
  if (isShapefile) {
    throw new ParseError(
      m.error_shapefile_missing_components({ components: '.shx, .dbf' }),
      SHAPEFILE_FILE_TYPE,
      {
        fileName: file.name,
        missingComponents: ['.shx', '.dbf']
      }
    );
  }

  if (!Duck.db) {
    throw new DuckDBError(m.error_duckdb_not_initialized());
  }

  const duck = Duck;
  await duck.register_files([file]);

  const lowerFileName = file.name.toLowerCase();
  const isParquet =
    lowerFileName.endsWith('.parquet') ||
    lowerFileName.endsWith('.geoparquet') ||
    lowerFileName.endsWith('.gpq');

  if (isParquet) {
    return processParquetBasemapImport(duck, file, tableName);
  }

  if (lowerFileName.endsWith('.gpkg')) {
    try {
      return await processGeofileBasemapImport(duck, file, tableName);
    } catch (error) {
      logger.error(
        'Failed to import GeoPackage directly, trying browser fallback',
        LogCategory.MAP,
        error
      );
      await duck.query(
        `DROP TABLE IF EXISTS "${escapeIdentifier(tableName)}"`,
        {
          format: 'arrow-ipc'
        }
      );

      const fallbackGeoJsonFile = await convertGeoPackageToGeoJsonFile(file);
      return processGeofileBasemapImport(duck, fallbackGeoJsonFile, tableName);
    }
  }

  return processGeofileBasemapImport(duck, file, tableName);
}

async function processZipShapefileImport(
  zipFile: File,
  tableName: string
): Promise<BasemapImportResult> {
  const extraction = await extractZip(zipFile);
  if (!extraction.isShapefileArchive || !extraction.shapefileBaseName) {
    throw new ParseError(
      m.error_shapefile_missing_components({
        components: '.shp, .shx, .dbf'
      }),
      SHAPEFILE_FILE_TYPE,
      {
        fileName: zipFile.name,
        missingComponents: ['.shp', '.shx', '.dbf']
      }
    );
  }

  const shapefileParts = getShapefileFilesFromArchive(
    extraction.files,
    extraction.shapefileBaseName
  );
  const shapefileFiles = shapefileParts.map((part) =>
    createFileFromExtracted(part)
  );
  const mainShpFile = shapefileFiles.find((part) =>
    part.name.toLowerCase().endsWith('.shp')
  );

  if (!mainShpFile) {
    throw new ParseError(
      m.error_shapefile_no_shp_found(),
      SHAPEFILE_FILE_TYPE,
      {
        fileName: zipFile.name
      }
    );
  }

  if (!Duck.db) {
    throw new DuckDBError(m.error_duckdb_not_initialized());
  }

  const duck = Duck;
  await duck.register_files(shapefileFiles, { shapefile: true });

  return processGeofileBasemapImport(duck, mainShpFile, tableName, true);
}

async function processGeofileBasemapImport(
  duck: typeof Duck,
  file: File,
  tableName: string,
  shapefile = false
): Promise<BasemapImportResult> {
  await duck.read_geofile(file, {
    tablename: tableName,
    shapefile
  });

  let geometryColumn = INTERNAL_COLUMN.GEOM;
  const layerType = await queryGeometryType(duck, tableName, geometryColumn);

  if (isPolygonBasemapLayerType(layerType)) {
    await preparePolygonBasemapTables(duck, tableName, geometryColumn);
    geometryColumn = INTERNAL_COLUMN.GEOM;
  } else if (isLineBasemapLayerType(layerType)) {
    await prepareLineBasemapTables(duck, tableName, geometryColumn);
    geometryColumn = INTERNAL_COLUMN.GEOM;
  } else if (isPointBasemapLayerType(layerType)) {
    await preparePointBasemapTables(duck, tableName, geometryColumn);
  }

  const bounds = await queryBasemapBounds(duck, tableName, geometryColumn);

  if (!bounds) {
    throw new DataValidationError(
      m.basemap_import_modal_error_invalid_geometry(),
      INTERNAL_COLUMN.GEOM,
      {
        fileName: file.name,
        tableName
      }
    );
  }

  const layers = buildBasemapLayers(tableName, layerType);

  const customBasemap: BasemapMetadata = {
    file: tableName,
    title_fr: file.name.replace(/\.[^/.]+$/, ''),
    title_en: file.name.replace(/\.[^/.]+$/, ''),
    source: m.basemap_custom_source(),
    date: new Date().getFullYear().toString(),
    bbox: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY],
    proj_source: GEO_CONSTANTS.WGS84_CRS,
    proj_to: { type: 'identity' },
    layers,
    isCustom: true
  };

  await generateCustomBasemapAttributes(tableName, customBasemap.file);
  const geometryTable = await createArrowTableFromDuckTable(duck, tableName);

  return { basemap: customBasemap, tableName, geometryTable };
}

async function processParquetBasemapImport(
  duck: typeof Duck,
  file: File,
  tableName: string
): Promise<BasemapImportResult> {
  const fileWithId = file as File & { id?: string };
  const fileId = fileWithId.id ?? `${file.lastModified}-${file.name}`;
  const escapedFileId = escapeSqlString(fileId);

  await duck.query(
    `CREATE OR REPLACE TABLE "${tableName}" AS FROM read_parquet('${escapedFileId}')`,
    { format: 'arrow-ipc' }
  );

  const geoMeta = await readGeoParquetMetadataFromDuck(
    duck,
    escapedFileId,
    'Failed to read imported basemap GeoParquet metadata'
  );
  let geomColName = geoMeta?.primary_column ?? INTERNAL_COLUMN.GEOM;
  const colMeta = geoMeta?.columns?.[geomColName];
  let layerType = colMeta
    ? extractGeometryTypeFromMeta(colMeta)
    : await queryGeometryType(duck, tableName, geomColName);

  if (isPolygonBasemapLayerType(layerType)) {
    await preparePolygonBasemapTables(duck, tableName, geomColName);
    geomColName = INTERNAL_COLUMN.GEOM;
    layerType = BasemapLayerType.POLYGON;
  } else if (isLineBasemapLayerType(layerType)) {
    await prepareLineBasemapTables(duck, tableName, geomColName);
    geomColName = INTERNAL_COLUMN.GEOM;
    layerType = BasemapLayerType.LINE;
  } else if (isPointBasemapLayerType(layerType)) {
    await preparePointBasemapTables(duck, tableName, geomColName);
  }

  const bounds = await queryBasemapBounds(duck, tableName, geomColName);
  if (!bounds) {
    throw new DataValidationError(
      m.basemap_import_modal_error_invalid_geometry(),
      geomColName,
      {
        fileName: file.name,
        tableName
      }
    );
  }

  const layers = buildBasemapLayers(tableName, layerType);

  const customBasemap: BasemapMetadata = {
    file: tableName,
    title_fr: file.name.replace(/\.[^/.]+$/, ''),
    title_en: file.name.replace(/\.[^/.]+$/, ''),
    source: m.basemap_custom_source(),
    date: new Date().getFullYear().toString(),
    bbox: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY],
    proj_source: GEO_CONSTANTS.WGS84_CRS,
    proj_to: { type: 'identity' },
    layers,
    isCustom: true
  };

  await generateCustomBasemapAttributes(tableName, customBasemap.file);
  const geometryTable = await createArrowTableFromDuckTable(duck, tableName);

  return { basemap: customBasemap, tableName, geometryTable };
}

function extractGeometryTypeFromMeta(
  colMeta: GeoParquetColumnMeta | undefined
): BasemapLayerType {
  const geomTypes = (colMeta?.geometry_types ?? []).map((type) =>
    type.toLowerCase()
  );

  if (geomTypes.some((t) => t.includes('point'))) {
    return BasemapLayerType.POINT;
  }
  if (geomTypes.some((t) => t.includes('line'))) {
    return BasemapLayerType.LINE;
  }
  return BasemapLayerType.POLYGON;
}

function isPolygonBasemapLayerType(layerType: BasemapLayerType): boolean {
  return layerType === BasemapLayerType.POLYGON;
}

function isLineBasemapLayerType(layerType: BasemapLayerType): boolean {
  return layerType === BasemapLayerType.LINE;
}

function isPointBasemapLayerType(layerType: BasemapLayerType): boolean {
  return layerType === BasemapLayerType.POINT;
}

function shouldCreateCentroidLayer(layerType: BasemapLayerType): boolean {
  return (
    isPolygonBasemapLayerType(layerType) ||
    isLineBasemapLayerType(layerType) ||
    isPointBasemapLayerType(layerType)
  );
}

function buildCentroidLayer(tableName: string): BasemapLayer {
  return {
    title_fr: m.layer_title_centroids({}, { locale: 'fr' }),
    title_en: m.layer_title_centroids({}, { locale: 'en' }),
    type: BasemapLayerType.CENTROID,
    file: getBasemapCentroidsTableName(tableName),
    style: null
  };
}

// A polygon coverage is described the way the catalog describes one: a dissolved
// territory plus its outer and inner limits, each in its own table. No layer
// points at the source table, so the attributed geometry is drawn once, by the
// visualization that owns it.
function buildBasemapLayers(
  tableName: string,
  layerType: BasemapLayerType,
  options: { omitPrimaryLayer?: boolean } = {}
): BasemapLayer[] {
  if (isPolygonBasemapLayerType(layerType)) {
    return [
      {
        title_fr: m.layer_title_territory({}, { locale: 'fr' }),
        title_en: m.layer_title_territory({}, { locale: 'en' }),
        type: BasemapLayerType.LAND,
        file: getBasemapLandTableName(tableName),
        style: 'land'
      },
      {
        title_fr: m.layer_title_outer_limits({}, { locale: 'fr' }),
        title_en: m.layer_title_outer_limits({}, { locale: 'en' }),
        type: BasemapLayerType.LIMIT,
        file: getBasemapOuterlinesTableName(tableName),
        style: 'limit-outer'
      },
      {
        title_fr: m.layer_title_limits({}, { locale: 'fr' }),
        title_en: m.layer_title_limits({}, { locale: 'en' }),
        type: BasemapLayerType.LIMIT,
        file: getBasemapInnerlinesTableName(tableName),
        style: 'limit-level-0'
      },
      buildCentroidLayer(tableName)
    ];
  }

  // A dataset already draws its own points and lines through its
  // visualization; repeating them as a basemap layer only adds a row nobody
  // can style.
  const layers: BasemapLayer[] = options.omitPrimaryLayer
    ? []
    : [
        {
          title_fr: tableName,
          title_en: tableName,
          type: layerType,
          style: null
        }
      ];

  if (shouldCreateCentroidLayer(layerType)) {
    layers.push(buildCentroidLayer(tableName));
  }

  return layers;
}

export function resolveCustomBasemapLayerType(
  metadata: BasemapMetadata
): BasemapLayerType | undefined {
  const types = new Set(metadata.layers.map((layer) => layer.type));
  if (types.has(BasemapLayerType.LAND) || types.has(BasemapLayerType.LIMIT)) {
    return BasemapLayerType.POLYGON;
  }
  return metadata.layers.find(
    (layer) =>
      layer.type === BasemapLayerType.LINE ||
      layer.type === BasemapLayerType.POINT
  )?.type;
}

export async function createArrowTableFromDuckTable(
  duck: typeof Duck,
  tableName: string
): Promise<ArrowTable> {
  const projectColumns = await resolveCustomBasemapGeometryProjectColumns(
    duck,
    tableName
  );
  return createCustomBasemapGeometryTableFromDuck(duck, tableName, {
    projectColumns
  });
}

function getRepresentativePointExpression(
  geometryColumn: string,
  layerType: BasemapLayerType
): string {
  const escapedGeometryColumn = `"${escapeIdentifier(geometryColumn)}"`;

  if (isPolygonBasemapLayerType(layerType)) {
    return `CASE
      WHEN ST_IsEmpty(${escapedGeometryColumn}) THEN NULL
      WHEN NOT ST_IsValid(${escapedGeometryColumn}) THEN ST_PointOnSurface(${escapedGeometryColumn})
      ELSE COALESCE(
        ST_MaximumInscribedCircle(${escapedGeometryColumn}).center,
        ST_PointOnSurface(${escapedGeometryColumn})
      )
    END`;
  }

  return `CASE
    WHEN ST_IsEmpty(${escapedGeometryColumn}) THEN NULL
    ELSE ST_PointOnSurface(${escapedGeometryColumn})
  END`;
}

async function prepareRepresentativePointTable(
  duck: typeof Duck,
  tableName: string,
  geometryColumn: string,
  layerType: BasemapLayerType
): Promise<void> {
  const centroidsTableName = getBasemapCentroidsTableName(tableName);
  const escapedTable = escapeIdentifier(tableName);
  const escapedCentroidsTable = escapeIdentifier(centroidsTableName);
  const representativePointExpression = getRepresentativePointExpression(
    geometryColumn,
    layerType
  );

  await duck.query(`
    CREATE OR REPLACE TABLE "${escapedCentroidsTable}" AS
    SELECT * REPLACE (
      CASE
        WHEN "${escapeIdentifier(geometryColumn)}" IS NULL THEN NULL
        ELSE ${representativePointExpression}
      END AS "${escapeIdentifier(geometryColumn)}"
    )
    FROM "${escapedTable}"
  `);
}

function buildNormalizedGeometrySelect(
  sourceTableName: string,
  geometryColumn: string,
  geometryExpression: string
): string {
  const escapedSourceTable = escapeIdentifier(sourceTableName);
  const escapedGeometryColumn = escapeIdentifier(geometryColumn);
  const escapedDefaultGeom = escapeIdentifier(INTERNAL_COLUMN.GEOM);
  const defaultGeomExpression = `"${escapedDefaultGeom}"`;

  if (geometryColumn === INTERNAL_COLUMN.GEOM) {
    if (geometryExpression === defaultGeomExpression) {
      return `SELECT * FROM "${escapedSourceTable}"`;
    }

    return `SELECT * REPLACE (${geometryExpression} AS "${escapedDefaultGeom}") FROM "${escapedSourceTable}"`;
  }

  return `SELECT * EXCLUDE ("${escapedGeometryColumn}"), ${geometryExpression} AS "${escapedDefaultGeom}" FROM "${escapedSourceTable}"`;
}

async function rebuildPolygonDerivedTables(
  duck: typeof Duck,
  tableName: string
): Promise<void> {
  await rebuildDerivedGeometryTables(duck, tableName);

  await prepareRepresentativePointTable(
    duck,
    tableName,
    INTERNAL_COLUMN.GEOM,
    BasemapLayerType.POLYGON
  );
}

async function rebuildLineDerivedTables(
  duck: typeof Duck,
  tableName: string
): Promise<void> {
  await prepareRepresentativePointTable(
    duck,
    tableName,
    INTERNAL_COLUMN.GEOM,
    BasemapLayerType.LINE
  );
}

export async function refreshImportedBasemapHelperTables(
  duck: typeof Duck,
  tableName: string,
  layerType: BasemapLayerType
): Promise<void> {
  if (isPolygonBasemapLayerType(layerType)) {
    await rebuildPolygonDerivedTables(duck, tableName);
    return;
  }

  if (isLineBasemapLayerType(layerType)) {
    await rebuildLineDerivedTables(duck, tableName);
    return;
  }

  if (isPointBasemapLayerType(layerType)) {
    await prepareRepresentativePointTable(
      duck,
      tableName,
      INTERNAL_COLUMN.GEOM,
      BasemapLayerType.POINT
    );
  }
}

async function preparePolygonBasemapTables(
  duck: typeof Duck,
  tableName: string,
  geometryColumn: string
): Promise<void> {
  const rawTableName = getBasemapRawTableName(tableName);
  const escapedTable = escapeIdentifier(tableName);
  const escapedRawTable = escapeIdentifier(rawTableName);

  await duck.query(
    `CREATE OR REPLACE TABLE "${escapedRawTable}" AS SELECT * FROM "${escapedTable}"`
  );

  try {
    await duck.query(`
      CREATE OR REPLACE TABLE "${escapedTable}" AS
      FROM simplify_and_clean('${escapeSqlString(rawTableName)}', '${escapeSqlString(geometryColumn)}', 0.0)
    `);
  } catch (error) {
    logger.error(
      'Failed to normalize imported basemap polygon geometry with macro, using SQL fallback',
      LogCategory.MAP,
      error
    );
    await duck.query(`
      CREATE OR REPLACE TABLE "${escapedTable}" AS
      ${buildNormalizedGeometrySelect(
        rawTableName,
        geometryColumn,
        `"${escapeIdentifier(geometryColumn)}"`
      )}
    `);
  }

  await ensureFeatureIdColumn(duck, tableName);
  await rebuildPolygonDerivedTables(duck, tableName);
}

async function prepareLineBasemapTables(
  duck: typeof Duck,
  tableName: string,
  geometryColumn: string
): Promise<void> {
  const rawTableName = getBasemapRawTableName(tableName);
  const escapedTable = escapeIdentifier(tableName);
  const escapedRawTable = escapeIdentifier(rawTableName);

  await duck.query(
    `CREATE OR REPLACE TABLE "${escapedRawTable}" AS SELECT * FROM "${escapedTable}"`
  );

  try {
    await duck.query(`
      CREATE OR REPLACE TABLE "${escapedTable}" AS
      FROM simplify_and_clean_linestring('${escapeSqlString(rawTableName)}', '${escapeSqlString(geometryColumn)}', 0.0)
    `);
  } catch (error) {
    logger.error(
      'Failed to normalize imported basemap line geometry with macro, using SQL fallback',
      LogCategory.MAP,
      error
    );
    await duck.query(`
      CREATE OR REPLACE TABLE "${escapedTable}" AS
      ${buildNormalizedGeometrySelect(
        rawTableName,
        geometryColumn,
        `"${escapeIdentifier(geometryColumn)}"`
      )}
    `);
  }

  await ensureFeatureIdColumn(duck, tableName);
  await rebuildLineDerivedTables(duck, tableName);
}

async function preparePointBasemapTables(
  duck: typeof Duck,
  tableName: string,
  geometryColumn: string
): Promise<void> {
  await prepareRepresentativePointTable(
    duck,
    tableName,
    geometryColumn,
    BasemapLayerType.POINT
  );
  await ensureFeatureIdColumn(duck, tableName);
}

async function ensureFeatureIdColumn(
  duck: typeof Duck,
  tableName: string
): Promise<void> {
  const escapedTable = escapeIdentifier(tableName);
  const escapedFeatureId = escapeIdentifier(INTERNAL_COLUMN.FEATURE_ID);

  await duck.query(`
    CREATE OR REPLACE TABLE "${escapedTable}" AS
    SELECT
      (ROW_NUMBER() OVER () - 1)::BIGINT AS "${escapedFeatureId}",
      *
    FROM "${escapedTable}"
  `);
}

export interface DatasetGeometryBasemapOptions {
  title: string;
  geometryColumn?: string;
  crs?: string;
}

async function readGeometryColumnCrs(
  duck: typeof Duck,
  tableName: string,
  geometryColumn: string
): Promise<string | undefined> {
  const description = await duck.describe_table(tableName);
  const index = description.name.indexOf(geometryColumn);
  return index === -1
    ? undefined
    : extractGeometryColumnCrs(description.type[index]);
}

/**
 * Derives the helper layers of an already-materialized geometry table and wraps
 * them in basemap metadata. Unlike the import flow it never rewrites the source
 * table, so a dataset keeps its own row ids and table name.
 */
export async function createBasemapFromGeometryTable(
  duck: typeof Duck,
  tableName: string,
  options: DatasetGeometryBasemapOptions
): Promise<BasemapImportResult> {
  const geometryColumn = options.geometryColumn ?? INTERNAL_COLUMN.GEOM;
  const layerType = await queryGeometryType(duck, tableName, geometryColumn);

  await refreshImportedBasemapHelperTables(duck, tableName, layerType);

  const bounds = await queryBasemapBounds(duck, tableName, geometryColumn);
  if (!bounds) {
    throw new DataValidationError(
      m.basemap_import_modal_error_invalid_geometry(),
      geometryColumn,
      { tableName }
    );
  }

  // Bounds and CRS must describe the same space, or the basemap projection is
  // fitted to the source units while the dataset is drawn in another.
  const sourceCrs =
    options.crs ??
    (await readGeometryColumnCrs(duck, tableName, geometryColumn)) ??
    GEO_CONSTANTS.WGS84_CRS;

  const basemap: BasemapMetadata = {
    file: tableName,
    title_fr: options.title,
    title_en: options.title,
    source: m.basemap_custom_source(),
    date: new Date().getFullYear().toString(),
    bbox: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY],
    proj_source: sourceCrs,
    proj_to: { type: 'identity' },
    layers: buildBasemapLayers(tableName, layerType, {
      omitPrimaryLayer: true
    }),
    isCustom: true,
    isDatasetGeometry: true
  };

  const geometryTable = await createArrowTableFromDuckTable(duck, tableName);

  return { basemap, tableName, geometryTable };
}

export async function loadBasemapFromUrl(url: string): Promise<File> {
  try {
    return await fetchWithTimeout(
      url,
      async (response) => {
        if (!response.ok) {
          throw new PipelineError(
            m.basemap_url_error_load({ status: response.status.toString() }),
            BASEMAP_URL_LOAD_ERROR_CODE,
            {
              url,
              status: response.status
            }
          );
        }

        const blob = await response.blob();
        const filename = url.split('/').pop() || 'basemap.geojson';
        return new File([blob], filename, {
          type: blob.type || 'application/geo+json'
        });
      },
      BASEMAP_FETCH_TIMEOUT_MS
    );
  } catch (error) {
    if (error instanceof FetchTimeoutError) {
      throw new PipelineError(
        m.error_download_timeout(),
        BASEMAP_URL_LOAD_ERROR_CODE,
        {
          url,
          timeoutMs: error.timeoutMs
        }
      );
    }

    throw error;
  }
}

export function createOSMBasemap(
  style: string = 'OpenStreetMap'
): BasemapMetadata {
  return {
    file: `osm_${style.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
    title_fr: m.basemap_osm({}, { locale: 'fr' }),
    title_en: m.basemap_osm({}, { locale: 'en' }),
    subtitle_fr: m.osm_basemap_description({}, { locale: 'fr' }),
    subtitle_en: m.osm_basemap_description({}, { locale: 'en' }),
    source: m.osm_basemap_source(),
    date: new Date().getFullYear().toString(),
    bbox: [-180, -90, 180, 90],
    proj_source: GEO_CONSTANTS.WEB_MERCATOR_CRS,
    proj_to: { type: 'identity' },
    layers: [
      {
        title_fr: m.layer_title_base({}, { locale: 'fr' }),
        title_en: m.layer_title_base({}, { locale: 'en' }),
        type: BasemapLayerType.POLYGON,
        style: null
      }
    ],
    isCustom: true
  };
}

async function queryBasemapBounds(
  duck: typeof Duck,
  tableName: string,
  geometryColumn: string
): Promise<BasemapBounds | null> {
  const escapedTable = escapeIdentifier(tableName);
  const escapedGeometryColumn = escapeIdentifier(geometryColumn);
  const bboxQuery = (await duck.query(
    `WITH agg AS (
      SELECT ST_Extent_Agg("${escapedGeometryColumn}") AS extent
      FROM "${escapedTable}"
    )
    SELECT
      ST_XMin(extent) as minX,
      ST_YMin(extent) as minY,
      ST_XMax(extent) as maxX,
      ST_YMax(extent) as maxY
    FROM agg`,
    { format: 'array', useProxy: false }
  )) as Array<{
    minX: number | null;
    minY: number | null;
    maxX: number | null;
    maxY: number | null;
  }>;

  const bounds = bboxQuery[0];
  if (
    !bounds ||
    bounds.minX === null ||
    bounds.minY === null ||
    bounds.maxX === null ||
    bounds.maxY === null
  ) {
    return null;
  }

  return {
    minX: bounds.minX,
    minY: bounds.minY,
    maxX: bounds.maxX,
    maxY: bounds.maxY
  };
}

async function queryGeometryType(
  duck: typeof Duck,
  tableName: string,
  geometryColumn: string
): Promise<BasemapLayerType> {
  const escapedTable = escapeIdentifier(tableName);
  const escapedGeometryColumn = escapeIdentifier(geometryColumn);
  const geomTypeQuery = (await duck.query(
    `SELECT DISTINCT ST_GeometryType("${escapedGeometryColumn}") as geom_type
     FROM "${escapedTable}"
     WHERE "${escapedGeometryColumn}" IS NOT NULL
     LIMIT 1`,
    { format: 'array', useProxy: false }
  )) as Array<{ geom_type?: string }>;

  const geomType = geomTypeQuery[0]?.geom_type?.toLowerCase() ?? 'polygon';

  if (geomType.includes('point')) {
    return BasemapLayerType.POINT;
  }
  if (geomType.includes('line')) {
    return BasemapLayerType.LINE;
  }
  return BasemapLayerType.POLYGON;
}
