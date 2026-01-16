import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import { Duck } from '$lib/features/duckdb';
import { generateCustomBasemapAttributes } from './generate-basemap-attributes';
import * as m from '$lib/paraglide/messages';

export interface BasemapImportResult {
  basemap: BasemapMetadata;
  tableName: string;
}

export interface BasemapBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export async function processBasemapImport(
  file: File
): Promise<BasemapImportResult> {
  const duck = Duck;
  if (!duck) {
    throw new Error('DuckDB not initialized');
  }

  await duck.register_files([file]);

  const tableNameResult = await duck.read_geofile(file, {
    tablename: `custom_basemap_${Date.now()}`
  });
  const tableName =
    typeof tableNameResult === 'string'
      ? tableNameResult
      : (tableNameResult?.name ?? `custom_basemap_${Date.now().toString(36)}`);

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

  return { basemap: customBasemap, tableName };
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
