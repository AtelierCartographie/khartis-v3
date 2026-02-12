import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import { Duck } from '$lib/features/duckdb';
import { generateCustomBasemapAttributes } from './generate-basemap-attributes';
import { addGeoArrowMetadata } from './read-geojson-arrow';
import * as m from '$lib/paraglide/messages';
import { tableFromIPC, type Table as ArrowTable } from 'apache-arrow/Arrow';

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

export async function processBasemapImport(
  file: File
): Promise<BasemapImportResult> {
  const duck = Duck;
  if (!duck) {
    throw new Error('DuckDB not initialized');
  }

  await duck.register_files([file]);

  const tableName = `custom_basemap_${Date.now()}`;
  const isParquet = file.name.toLowerCase().endsWith('.parquet');

  if (isParquet) {
    return processParquetBasemapImport(duck, file, tableName);
  }

  return processGeofileBasemapImport(duck, file, tableName);
}

async function processGeofileBasemapImport(
  duck: typeof Duck,
  file: File,
  tableName: string
): Promise<BasemapImportResult> {
  await duck.read_geofile(file, { tablename: tableName });

  const analysis = await duck.analyse(tableName);
  const bounds = await queryBasemapBounds(tableName);

  if (!bounds) {
    throw new Error(m.basemap_import_modal_error_invalid_geometry());
  }

  const layerType = await queryGeometryType(tableName);

  const customBasemap: BasemapMetadata = {
    file: tableName,
    title: file.name.replace(/\.[^/.]+$/, ''),
    description: m.basemap_custom_description(),
    source: m.basemap_custom_source(),
    date: new Date().getFullYear().toString(),
    bbox: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY],
    projection: 'EPSG:4326',
    layers: [
      {
        name: 'geom',
        type: layerType,
        count: Number(analysis.find((col) => col.name === 'geom')?.count) || 0
      }
    ],
    isCustom: true
  };

  await generateCustomBasemapAttributes(tableName, customBasemap.file);

  const arrowResult = await duck.query(
    `SELECT * EXCLUDE (geom), ST_AsWKB(geom) as geom FROM "${tableName}"`,
    { format: 'arrow-ipc' }
  );
  const geometryTable = addGeoArrowMetadata(
    tableFromIPC(arrowResult as Uint8Array)
  );

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
  const geomColName = geoMeta?.primary_column ?? 'geom';
  const colMeta = geoMeta?.columns?.[geomColName];

  const bounds = extractBoundsFromMeta(colMeta);
  if (!bounds) {
    throw new Error(m.basemap_import_modal_error_invalid_geometry());
  }

  const layerType = extractGeometryTypeFromMeta(colMeta);

  const analysis = await duck.analyse(tableName);
  const rowCount =
    Number(analysis.find((col) => col.name === geomColName)?.count) || 0;

  const customBasemap: BasemapMetadata = {
    file: tableName,
    title: file.name.replace(/\.[^/.]+$/, ''),
    description: m.basemap_custom_description(),
    source: m.basemap_custom_source(),
    date: new Date().getFullYear().toString(),
    bbox: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY],
    projection: 'EPSG:4326',
    layers: [
      {
        name: geomColName,
        type: layerType,
        count: rowCount
      }
    ],
    isCustom: true
  };

  await generateCustomBasemapAttributes(tableName, customBasemap.file);

  const arrowResult = await duck.query(`SELECT * FROM "${tableName}"`, {
    format: 'arrow-ipc'
  });
  const geometryTable = addGeoArrowMetadata(
    tableFromIPC(arrowResult as Uint8Array),
    colMeta?.encoding
  );

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

function extractBoundsFromMeta(
  colMeta: GeoParquetColumnMeta | undefined
): BasemapBounds | null {
  if (!colMeta?.bbox || colMeta.bbox.length < 4) {
    return null;
  }
  const [minX, minY, maxX, maxY] = colMeta.bbox;
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

function extractGeometryTypeFromMeta(
  colMeta: GeoParquetColumnMeta | undefined
): BasemapLayerType {
  const geomTypes = colMeta?.geometry_types ?? [];

  if (geomTypes.some((t) => t.includes('Point'))) {
    return BasemapLayerType.POINT;
  }
  if (geomTypes.some((t) => t.includes('Line'))) {
    return BasemapLayerType.LINE;
  }
  return BasemapLayerType.POLYGON;
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
    title: m.osm_basemap_title({ style }),
    description: m.osm_basemap_description(),
    source: m.osm_basemap_source(),
    date: new Date().getFullYear().toString(),
    bbox: [-180, -90, 180, 90],
    projection: 'EPSG:3857',
    layers: [{ name: 'base', type: BasemapLayerType.POLYGON }],
    isCustom: true
  };
}

async function queryBasemapBounds(
  tableName: string
): Promise<BasemapBounds | null> {
  const bboxQuery = (await Duck.query(
    `SELECT
      ST_XMin(ST_Extent(geom)) as minX,
      ST_YMin(ST_Extent(geom)) as minY,
      ST_XMax(ST_Extent(geom)) as maxX,
      ST_YMax(ST_Extent(geom)) as maxY
    FROM "${tableName}"`,
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

async function queryGeometryType(tableName: string): Promise<BasemapLayerType> {
  const geomTypeQuery = (await Duck.query(
    `SELECT DISTINCT ST_GeometryType(geom) as geom_type
     FROM "${tableName}"
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
