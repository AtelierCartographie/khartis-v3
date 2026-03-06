import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import type {
  BasemapLayer,
  BasemapMetadata
} from '$lib/features/map/types/basemap.types';
import { Duck, GEO_CONSTANTS } from '$lib/features/duckdb';
import {
  addGeoArrowMetadataFromDuckDB,
  fetchArrowTableWithGeometry
} from '$lib/features/duckdb/orchestrator/arrow-ops';
import { generateCustomBasemapAttributes } from './generate-basemap-attributes';
import * as m from '$lib/paraglide/messages';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import {
  createFileFromExtracted,
  extractZip,
  getShapefileFilesFromArchive
} from '$lib/features/data-pipeline/utils/zip-handler';

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

interface GeoParquetColumnMeta {
  encoding?: string;
  geometry_types?: string[];
  bbox?: [number, number, number, number];
}

interface GeoParquetMeta {
  primary_column?: string;
  columns?: Record<string, GeoParquetColumnMeta>;
}

const RAW_TABLE_SUFFIX = '__raw';
const INNERLINES_TABLE_SUFFIX = '__innerlines';
const CENTROIDS_TABLE_SUFFIX = '__centroids';

export function getBasemapInnerlinesTableName(tableName: string): string {
  return `${tableName}${INNERLINES_TABLE_SUFFIX}`;
}

export function getBasemapCentroidsTableName(tableName: string): string {
  return `${tableName}${CENTROIDS_TABLE_SUFFIX}`;
}

export async function processBasemapImport(
  file: File
): Promise<BasemapImportResult> {
  const isZip = file.name.toLowerCase().endsWith('.zip');
  if (isZip) {
    return processZipShapefileImport(file);
  }

  const isShapefile = file.name.toLowerCase().endsWith('.shp');
  if (isShapefile) {
    throw new Error(
      m.error_shapefile_missing_components({ components: '.shx, .dbf' })
    );
  }

  const duck = Duck;
  if (!duck) {
    throw new Error('DuckDB not initialized');
  }

  await duck.register_files([file]);

  const tableName = `custom_basemap_${Date.now()}`;
  const lowerFileName = file.name.toLowerCase();
  const isParquet =
    lowerFileName.endsWith('.parquet') ||
    lowerFileName.endsWith('.geoparquet') ||
    lowerFileName.endsWith('.gpq');

  if (isParquet) {
    return processParquetBasemapImport(duck, file, tableName);
  }

  return processGeofileBasemapImport(duck, file, tableName);
}

async function processZipShapefileImport(
  zipFile: File
): Promise<BasemapImportResult> {
  const extraction = await extractZip(zipFile);
  if (!extraction.isShapefileArchive || !extraction.shapefileBaseName) {
    throw new Error(
      m.error_shapefile_missing_components({
        components: '.shp, .shx, .dbf'
      })
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
    throw new Error(m.error_shapefile_no_shp_found());
  }

  const duck = Duck;
  if (!duck) {
    throw new Error('DuckDB not initialized');
  }

  await duck.register_files(shapefileFiles, { shapefile: true });

  const tableName = `custom_basemap_${Date.now()}`;
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
  }

  const analysis = await duck.analyse(tableName);
  const bounds = await queryBasemapBounds(duck, tableName, geometryColumn);

  if (!bounds) {
    throw new Error(m.basemap_import_modal_error_invalid_geometry());
  }

  const rowCount =
    Number(analysis.find((col) => col.name === geometryColumn)?.count) || 0;
  const layers = buildBasemapLayers(
    tableName,
    geometryColumn,
    layerType,
    rowCount
  );

  const customBasemap: BasemapMetadata = {
    file: tableName,
    title: file.name.replace(/\.[^/.]+$/, ''),
    description: m.basemap_custom_description(),
    source: m.basemap_custom_source(),
    date: new Date().getFullYear().toString(),
    bbox: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY],
    projection: GEO_CONSTANTS.WGS84_CRS,
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

  const geoMeta = await readGeoParquetMetadata(duck, escapedFileId);
  let geomColName = geoMeta?.primary_column ?? INTERNAL_COLUMN.GEOM;
  const colMeta = geoMeta?.columns?.[geomColName];
  let layerType = colMeta
    ? extractGeometryTypeFromMeta(colMeta)
    : await queryGeometryType(duck, tableName, geomColName);

  if (isPolygonBasemapLayerType(layerType)) {
    await preparePolygonBasemapTables(duck, tableName, geomColName);
    geomColName = INTERNAL_COLUMN.GEOM;
    layerType = BasemapLayerType.POLYGON;
  }

  const bounds = await queryBasemapBounds(duck, tableName, geomColName);
  if (!bounds) {
    throw new Error(m.basemap_import_modal_error_invalid_geometry());
  }

  const analysis = await duck.analyse(tableName);
  const rowCount =
    Number(analysis.find((col) => col.name === geomColName)?.count) || 0;
  const layers = buildBasemapLayers(
    tableName,
    geomColName,
    layerType,
    rowCount
  );

  const customBasemap: BasemapMetadata = {
    file: tableName,
    title: file.name.replace(/\.[^/.]+$/, ''),
    description: m.basemap_custom_description(),
    source: m.basemap_custom_source(),
    date: new Date().getFullYear().toString(),
    bbox: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY],
    projection: GEO_CONSTANTS.WGS84_CRS,
    layers,
    isCustom: true
  };

  await generateCustomBasemapAttributes(tableName, customBasemap.file);
  const geometryTable = await createArrowTableFromDuckTable(duck, tableName);

  return { basemap: customBasemap, tableName, geometryTable };
}

async function readGeoParquetMetadata(
  duck: typeof Duck,
  escapedFileId: string
): Promise<GeoParquetMeta | null> {
  try {
    const result = (await duck.query(
      `SELECT value FROM parquet_kv_metadata('${escapedFileId}') WHERE key = 'geo'`,
      { format: 'array', useProxy: false }
    )) as Array<{ value: string }>;

    if (result.length > 0 && result[0].value) {
      return JSON.parse(result[0].value) as GeoParquetMeta;
    }
  } catch (error) {
    logger.warn('Failed to read GeoParquet metadata', LogCategory.MAP, error);
  }
  return null;
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

function buildBasemapLayers(
  tableName: string,
  geometryColumn: string,
  layerType: BasemapLayerType,
  rowCount: number
): BasemapLayer[] {
  const layers: BasemapLayer[] = [
    {
      name: geometryColumn,
      type: layerType,
      count: rowCount
    }
  ];

  if (!isPolygonBasemapLayerType(layerType)) {
    return layers;
  }

  layers.push(
    {
      name: INTERNAL_COLUMN.GEOM,
      type: BasemapLayerType.LIMIT,
      file: getBasemapInnerlinesTableName(tableName)
    },
    {
      name: INTERNAL_COLUMN.GEOM,
      type: BasemapLayerType.CENTROID,
      file: getBasemapCentroidsTableName(tableName),
      count: rowCount
    }
  );

  return layers;
}

async function createArrowTableFromDuckTable(
  duck: typeof Duck,
  tableName: string
): Promise<ArrowTable> {
  const rawTable = await fetchArrowTableWithGeometry(tableName, duck);
  return addGeoArrowMetadataFromDuckDB(rawTable, tableName, duck);
}

async function preparePolygonBasemapTables(
  duck: typeof Duck,
  tableName: string,
  geometryColumn: string
): Promise<void> {
  const rawTableName = `${tableName}${RAW_TABLE_SUFFIX}`;
  const innerlinesTableName = getBasemapInnerlinesTableName(tableName);
  const centroidsTableName = getBasemapCentroidsTableName(tableName);
  const escapedTable = escapeIdentifier(tableName);
  const escapedRawTable = escapeIdentifier(rawTableName);
  const escapedInnerlinesTable = escapeIdentifier(innerlinesTableName);
  const escapedCentroidsTable = escapeIdentifier(centroidsTableName);

  await duck.query(
    `CREATE OR REPLACE TABLE "${escapedRawTable}" AS SELECT * FROM "${escapedTable}"`
  );

  try {
    await duck.query(`
      CREATE OR REPLACE TABLE "${escapedTable}" AS
      FROM simplify_and_clean('${escapeSqlString(rawTableName)}', '${escapeSqlString(geometryColumn)}', 0.0)
    `);

    await duck.query(`
      CREATE OR REPLACE TABLE "${escapedInnerlinesTable}" AS
      FROM extract_innerlines('${escapeSqlString(tableName)}')
    `);

    await duck.query(`
      CREATE OR REPLACE TABLE "${escapedCentroidsTable}" AS
      SELECT * REPLACE (
        ST_MaximumInscribedCircle("${INTERNAL_COLUMN.GEOM}").center AS "${INTERNAL_COLUMN.GEOM}"
      )
      FROM "${escapedTable}"
      WHERE "${INTERNAL_COLUMN.GEOM}" IS NOT NULL
    `);
  } finally {
    await duck.query(`DROP TABLE IF EXISTS "${escapedRawTable}"`);
  }
}

export async function loadBasemapFromUrl(url: string): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      m.basemap_url_error_load({ status: response.status.toString() })
    );
  }

  const blob = await response.blob();
  const filename = url.split('/').pop() || 'basemap.geojson';
  return new File([blob], filename, {
    type: blob.type || 'application/geo+json'
  });
}

export function createOSMBasemap(
  style: string = 'OpenStreetMap'
): BasemapMetadata {
  return {
    file: `osm_${style.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
    title: m.basemap_osm(),
    description: m.osm_basemap_description(),
    source: m.osm_basemap_source(),
    date: new Date().getFullYear().toString(),
    bbox: [-180, -90, 180, 90],
    projection: GEO_CONSTANTS.WEB_MERCATOR_CRS,
    layers: [{ name: 'base', type: BasemapLayerType.POLYGON }],
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
    `SELECT
      ST_XMin(ST_Extent("${escapedGeometryColumn}")) as minX,
      ST_YMin(ST_Extent("${escapedGeometryColumn}")) as minY,
      ST_XMax(ST_Extent("${escapedGeometryColumn}")) as maxX,
      ST_YMax(ST_Extent("${escapedGeometryColumn}")) as maxY
    FROM "${escapedTable}"`,
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
