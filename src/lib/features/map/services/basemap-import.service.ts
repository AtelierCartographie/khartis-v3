import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import type {
  BasemapLayer,
  BasemapMetadata
} from '$lib/features/map/types/basemap.types';
import {
  buildTableInBackground,
  Duck,
  GEO_CONSTANTS,
  isGeometryColumnType
} from '$lib/features/duckdb';
import { generateCustomBasemapAttributes } from './generate-basemap-attributes.service';
import { resolveCustomBasemapGeometryProjectColumns } from './custom-basemap-columns.service';
import { createCustomBasemapGeometryTableFromDuck } from './custom-basemap-geometry.service';
import * as m from '$lib/paraglide/messages';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import {
  createFileFromExtracted,
  extractGeometryColumnCrs,
  extractZip,
  getShapefileFilesFromArchive,
  readFileIntoTable
} from '$lib/features/data-pipeline';
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
import { zipSync } from 'fflate';
import { FILE_EXTENSION_GROUPS } from '$lib/features/commons/constants/file-types.constants';
import { MIME } from '$lib/features/commons/constants/mime.constants';
import {
  groupShapefiles,
  isShapefileComponent
} from '$lib/features/commons/utils/file-import.utils';
import { getFileExtensionWithDot } from '$lib/features/commons/utils/file.utils';
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

export async function bundleBasemapImportFiles(files: File[]): Promise<File> {
  if (files.length === 1) return files[0];

  const groups = [...groupShapefiles(files)];
  if (groups.length !== 1 || !isShapefileComponent(files[0].name)) {
    throw new ParseError(
      m.basemap_import_error_single_source(),
      SHAPEFILE_FILE_TYPE,
      { fileNames: files.map((file) => file.name) }
    );
  }

  const [baseName, parts] = groups[0];
  const extensions = new Set(
    parts.map((part) => getFileExtensionWithDot(part.name))
  );
  const missingComponents = FILE_EXTENSION_GROUPS.SHAPEFILE_REQUIRED.filter(
    (extension) => !extensions.has(extension)
  );
  if (missingComponents.length > 0) {
    throw new ParseError(
      m.error_shapefile_missing_components({
        components: missingComponents.join(', ')
      }),
      SHAPEFILE_FILE_TYPE,
      { fileName: `${baseName}.shp`, missingComponents }
    );
  }

  const entries = await Promise.all(
    parts.map(
      async (part) =>
        [part.name, new Uint8Array(await part.arrayBuffer())] as const
    )
  );
  const archive = zipSync(Object.fromEntries(entries), { level: 0 });
  return new File([archive], `${baseName}.zip`, { type: MIME.ZIP });
}

export async function processBasemapImport(
  file: File,
  options: BasemapImportOptions = {}
): Promise<BasemapImportResult> {
  const tableName =
    options.tableName ?? `${CUSTOM_BASEMAP_TABLE_PREFIX}${Date.now()}`;
  try {
    return await importBasemapFile(file, tableName);
  } catch (error) {
    // Restore skips a basemap whose table exists, so a failed import must not
    // leave a partial one behind.
    await dropBasemapImportTables(tableName);
    if (error instanceof Error && error.message.includes('Out of Memory')) {
      throw new DuckDBError(m.basemap_import_error_out_of_memory(), undefined, {
        fileName: file.name,
        cause: error.message
      });
    }
    throw error;
  }
}

async function dropBasemapImportTables(tableName: string): Promise<void> {
  if (!Duck.db) return;
  try {
    const rows = (await Duck.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_name = '${escapeSqlString(tableName)}'
         OR starts_with(table_name, '${escapeSqlString(tableName)}__')`,
      { format: 'array' }
    )) as Array<{ table_name: string }>;
    for (const { table_name } of rows) {
      await Duck.query(
        `DROP TABLE IF EXISTS "${escapeIdentifier(String(table_name))}"`
      );
      Duck.invalidateTableCache(String(table_name));
    }
  } catch (error) {
    logger.warn(
      `Failed to drop the tables of the failed import ${tableName}`,
      LogCategory.MAP,
      error
    );
  }
}

async function importBasemapFile(
  file: File,
  tableName: string
): Promise<BasemapImportResult> {
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

  return readAndPrepareBasemap(file, tableName);
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

  return readAndPrepareBasemap(
    mainShpFile,
    tableName,
    shapefileFiles.filter((part) => part !== mainShpFile)
  );
}

// An imported basemap is read exactly like a dataset, then gets what only a
// basemap needs: a geometry column named `geom`, a feature id for the join and
// the derived layers shared with a dataset that carries its own geometry.
async function readAndPrepareBasemap(
  file: File,
  tableName: string,
  companionFiles?: File[]
): Promise<BasemapImportResult> {
  if (!Duck.db) {
    throw new DuckDBError(m.error_duckdb_not_initialized());
  }

  const duck = Duck;
  const read = await readFileIntoTable(file, { tableName, companionFiles });
  if (read.tableName !== tableName) {
    await duck.query(
      `ALTER TABLE "${escapeIdentifier(read.tableName)}" RENAME TO "${escapeIdentifier(tableName)}"`
    );
  }

  await normalizeGeometryColumnName(duck, tableName, file.name);
  const geometryColumn = INTERNAL_COLUMN.GEOM;
  const layerType = await queryGeometryType(duck, tableName, geometryColumn);

  await ensureFeatureIdColumn(duck, tableName);
  await refreshImportedBasemapHelperTables(duck, tableName, layerType);

  const basemap = await describeGeometryBasemap(duck, tableName, {
    title: file.name.replace(/\.[^/.]+$/, ''),
    geometryColumn,
    layerType
  });

  await generateCustomBasemapAttributes(tableName, basemap.file);
  const geometryTable = await createArrowTableFromDuckTable(duck, tableName);

  return { basemap, tableName, geometryTable };
}

// The derived-layer macros and the basemap renderer read a column named
// `geom`, while GeoParquet and some readers keep the source column name.
async function normalizeGeometryColumnName(
  duck: typeof Duck,
  tableName: string,
  fileName: string
): Promise<void> {
  const description = await duck.describe_table(tableName);
  const index = description.type.findIndex((type) =>
    isGeometryColumnType(type)
  );
  if (index === -1) {
    throw new DataValidationError(
      m.basemap_import_modal_error_invalid_geometry(),
      INTERNAL_COLUMN.GEOM,
      { fileName, tableName }
    );
  }

  const geometryColumn = description.name[index];
  if (geometryColumn === INTERNAL_COLUMN.GEOM) {
    return;
  }

  await duck.query(`
    CREATE OR REPLACE TABLE "${escapeIdentifier(tableName)}" AS
    SELECT * EXCLUDE ("${escapeIdentifier(geometryColumn)}"),
      "${escapeIdentifier(geometryColumn)}" AS "${escapeIdentifier(INTERNAL_COLUMN.GEOM)}"
    FROM "${escapeIdentifier(tableName)}"
  `);
  duck.invalidateTableCache(tableName);
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
  const escapedGeometryColumn = escapeIdentifier(geometryColumn);
  const projection = `* REPLACE (
      CASE
        WHEN "${escapedGeometryColumn}" IS NULL THEN NULL
        ELSE ${getRepresentativePointExpression(geometryColumn, layerType)}
      END AS "${escapedGeometryColumn}"
    )`;

  if (isPolygonBasemapLayerType(layerType)) {
    buildTableInBackground(duck, {
      sourceTable: tableName,
      targetTable: centroidsTableName,
      projection
    });
    return;
  }

  await duck.query(`
    CREATE OR REPLACE TABLE "${escapeIdentifier(centroidsTableName)}" AS
    SELECT ${projection}
    FROM "${escapeIdentifier(tableName)}"
  `);
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

  const basemap = await describeGeometryBasemap(duck, tableName, {
    title: options.title,
    geometryColumn,
    layerType,
    crs: options.crs,
    isDatasetGeometry: true
  });
  const geometryTable = await createArrowTableFromDuckTable(duck, tableName);

  return { basemap, tableName, geometryTable };
}

interface GeometryBasemapDescription {
  title: string;
  geometryColumn: string;
  layerType: BasemapLayerType;
  crs?: string;
  isDatasetGeometry?: boolean;
}

async function describeGeometryBasemap(
  duck: typeof Duck,
  tableName: string,
  description: GeometryBasemapDescription
): Promise<BasemapMetadata> {
  const { title, geometryColumn, layerType } = description;
  const bounds = await queryBasemapBounds(duck, tableName, geometryColumn);
  if (!bounds) {
    throw new DataValidationError(
      m.basemap_import_modal_error_invalid_geometry(),
      geometryColumn,
      { tableName }
    );
  }

  // Bounds and CRS must describe the same space, or the basemap projection is
  // fitted to the source units while the geometry is drawn in another.
  const sourceCrs =
    description.crs ??
    (await readGeometryColumnCrs(duck, tableName, geometryColumn)) ??
    GEO_CONSTANTS.WGS84_CRS;

  return {
    file: tableName,
    title_fr: title,
    title_en: title,
    source: m.basemap_custom_source(),
    date: new Date().getFullYear().toString(),
    bbox: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY],
    proj_source: sourceCrs,
    proj_to: { type: 'identity' },
    layers: buildBasemapLayers(tableName, layerType, {
      omitPrimaryLayer: description.isDatasetGeometry === true
    }),
    isCustom: true,
    ...(description.isDatasetGeometry ? { isDatasetGeometry: true } : {})
  };
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
