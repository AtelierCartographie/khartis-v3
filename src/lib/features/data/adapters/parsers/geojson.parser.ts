import type { IParser } from '../../contracts/parser';
import { ParserError } from '../../contracts/parser';
import type { RawDataset } from '../../models/raw-dataset';
import type { RawColumn } from '../../models/raw-column';
import type { GeometryInfo } from '../../models/geometry-info';
import type {
  GeoJSONFeature as SharedGeoJSONFeature,
  GeoJSONFeatureCollection as SharedGeoJSONFeatureCollection
} from '$lib/types/data';

export type GeoJSONFeature = SharedGeoJSONFeature;
export type GeoJSONFeatureCollection = SharedGeoJSONFeatureCollection;

/**
 * GeoJSON Parser - Parses GeoJSON FeatureCollections
 *
 * Extracts:
 * - Feature properties as tabular data
 * - Geometry as special column
 * - Bounds and centroid
 *
 * @example
 * ```typescript
 * const parser = new GeoJSONParser();
 * const dataset = await parser.parse(geojsonFile);
 * ```
 */
export class GeoJSONParser implements IParser {
  readonly supportedExtensions = ['.geojson', '.json'];

  readonly mimeTypes = ['application/geo+json', 'application/json'];

  canParse(file: File): boolean {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    return this.supportedExtensions.includes(ext);
  }

  async parse(file: File): Promise<RawDataset> {
    try {
      const text = await file.text();
      const geojson: GeoJSONFeatureCollection = JSON.parse(text);

      if (geojson.type !== 'FeatureCollection') {
        throw new ParserError(
          'Invalid GeoJSON: must be a FeatureCollection',
          undefined,
          'geojson'
        );
      }

      if (!Array.isArray(geojson.features) || geojson.features.length === 0) {
        throw new ParserError(
          'Invalid GeoJSON: features array is empty or missing',
          undefined,
          'geojson'
        );
      }

      return convertGeoJSONToRawDataset(geojson);
    } catch (error) {
      if (error instanceof ParserError) {
        throw error;
      }

      if (error instanceof SyntaxError) {
        throw new ParserError('Invalid JSON syntax', error, 'geojson');
      }

      throw new ParserError(
        `Failed to parse GeoJSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error,
        'geojson'
      );
    }
  }
}

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
  const bounds = computeBounds(geojson);
  const centroid: [number, number] = [
    (bounds[0] + bounds[2]) / 2,
    (bounds[1] + bounds[3]) / 2
  ];

  return {
    type,
    bounds,
    centroid,
    crs: geojson.crs?.properties?.name || 'EPSG:4326',
    featureCount: geojson.features.length
  };
}

function computeBounds(
  geojson: GeoJSONFeatureCollection
): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const processCoords = (coords: unknown): void => {
    if (Array.isArray(coords)) {
      if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        minX = Math.min(minX, coords[0]);
        minY = Math.min(minY, coords[1]);
        maxX = Math.max(maxX, coords[0]);
        maxY = Math.max(maxY, coords[1]);
      } else {
        coords.forEach((c) => processCoords(c));
      }
    }
  };

  geojson.features.forEach((feature) => {
    processGeometryCoordinates(feature.geometry, processCoords);
  });

  if (!isFinite(minX)) {
    return [-180, -90, 180, 90];
  }

  return [minX, minY, maxX, maxY];
}

function extractGeometryType(geometry: unknown): string | null {
  if (!geometry || typeof geometry !== 'object') {
    return null;
  }

  const geometryRecord = geometry as Record<string, unknown>;
  const typeValue = geometryRecord.type;
  return typeof typeValue === 'string' ? typeValue : null;
}

function processGeometryCoordinates(
  geometry: GeoJSONFeature['geometry'],
  processCoords: (coords: unknown) => void
): void {
  if (!geometry || typeof geometry !== 'object') {
    return;
  }

  if ('coordinates' in geometry) {
    const coords = (geometry as { coordinates?: unknown }).coordinates;
    if (coords !== undefined) {
      processCoords(coords);
    }
    return;
  }

  if ('geometries' in geometry) {
    const geometries = (geometry as { geometries?: unknown }).geometries;
    if (Array.isArray(geometries)) {
      geometries.forEach((geom) =>
        processGeometryCoordinates(
          geom as GeoJSONFeature['geometry'],
          processCoords
        )
      );
    }
  }
}
