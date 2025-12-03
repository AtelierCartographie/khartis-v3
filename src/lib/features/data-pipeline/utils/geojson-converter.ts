/**
 * Utility functions for converting GeoJSON to RawDataset format.
 * Used by the data pipeline for shapefile conversion.
 */

import type {
  GeoJSONFeature as SharedGeoJSONFeature,
  GeoJSONFeatureCollection as SharedGeoJSONFeatureCollection
} from '$lib/types/data';
import type { GeometryInfo } from '../models/geometry-info';
import type { RawColumn } from '../models/raw-column';
import type { RawDataset } from '../models/raw-dataset';

export type GeoJSONFeature = SharedGeoJSONFeature;
export type GeoJSONFeatureCollection = SharedGeoJSONFeatureCollection;

/**
 * Converts a GeoJSON FeatureCollection to a RawDataset with geometry metadata.
 */
export function convertGeoJSONToRawDataset(
  geojson: GeoJSONFeatureCollection
): RawDataset {
  const propertyKeys = new Set<string>();
  geojson.features.forEach((feature) => {
    if (feature.properties) {
      Object.keys(feature.properties).forEach((key) => propertyKeys.add(key));
    }
  });

  const headers = ['_id', 'geometry', ...Array.from(propertyKeys)];

  const rows: unknown[][] = geojson.features.map((feature, index) => {
    const row: unknown[] = [
      index,
      feature.geometry ? JSON.stringify(feature.geometry) : null
    ];

    propertyKeys.forEach((key) => {
      row.push(feature.properties?.[key] ?? null);
    });

    return row;
  });

  const columns: RawColumn[] = headers.map((name, colIndex) => ({
    name,
    values: rows.map((row) => row[colIndex])
  }));

  const geometryInfo = computeGeometryInfo(geojson);

  return {
    headers,
    rows,
    columns,
    geometry: geometryInfo,
    metadata: {
      featureCount: geojson.features.length,
      crs: geojson.crs?.properties?.name || 'EPSG:4326',
      fileType: 'geojson',
      rowCount: rows.length,
      columnCount: headers.length
    }
  };
}

function computeGeometryInfo(geojson: GeoJSONFeatureCollection): GeometryInfo {
  const geometryTypes = new Set<string>();
  geojson.features.forEach((feature) => {
    const geometryType = extractGeometryType(feature.geometry);
    if (geometryType) {
      geometryTypes.add(geometryType);
    }
  });

  const type =
    geometryTypes.size === 1 ? Array.from(geometryTypes)[0] : 'Mixed';

  return {
    type,
    bounds: [-180, -90, 180, 90],
    centroid: [0, 0],
    crs: geojson.crs?.properties?.name || 'EPSG:4326',
    featureCount: geojson.features.length
  };
}

function extractGeometryType(geometry: unknown): string | null {
  if (!geometry || typeof geometry !== 'object') {
    return null;
  }

  const geometryRecord = geometry as Record<string, unknown>;
  const typeValue = geometryRecord.type;
  return typeof typeValue === 'string' ? typeValue : null;
}
