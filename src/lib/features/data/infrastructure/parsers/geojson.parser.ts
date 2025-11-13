import type { IParser } from '../../domain/interfaces/parser.interface';
import { ParserError } from '../../domain/interfaces/parser.interface';
import type { RawDataset } from '../../domain/entities/raw-dataset.entity';
import type { RawColumn } from '../../domain/entities/raw-column.entity';
import type { GeometryInfo } from '../../domain/value-objects/geometry-info.vo';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
  properties: Record<string, unknown> | null;
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
  crs?: {
    properties?: {
      name?: string;
    };
  };
}

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
 logger.debug('Operation', LogCategory.FILE);
 logger.debug('Operation', LogCategory.FILE);
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

      // Validate GeoJSON structure
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

      // Extract all property keys from all features
      const propertyKeys = new Set<string>();
      geojson.features.forEach((feature) => {
        if (feature.properties) {
          Object.keys(feature.properties).forEach((key) =>
            propertyKeys.add(key)
          );
        }
      });

      // Headers: _id, geometry, then all properties
      const headers = ['_id', 'geometry', ...Array.from(propertyKeys)];

      // Convert features to rows
      const rows: unknown[][] = geojson.features.map((feature, index) => {
        const row: unknown[] = [
          index, // _id
          feature.geometry ? JSON.stringify(feature.geometry) : null // geometry as JSON string
        ];

        // Add property values in order
        propertyKeys.forEach((key) => {
          row.push(feature.properties?.[key] ?? null);
        });

        return row;
      });

      // Convert to column-oriented format
      const columns: RawColumn[] = headers.map((name, colIndex) => ({
        name,
        values: rows.map((row) => row[colIndex])
      }));

      // Compute geometry info
      const geometryInfo = this.computeGeometryInfo(geojson);

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

  private computeGeometryInfo(geojson: GeoJSONFeatureCollection): GeometryInfo {
    // Detect geometry type(s)
    const geometryTypes = new Set<string>();
    geojson.features.forEach((feature) => {
      if (feature.geometry) {
        geometryTypes.add(feature.geometry.type);
      }
    });

    const type =
      geometryTypes.size === 1 ? Array.from(geometryTypes)[0] : 'Mixed';

    // Compute bounds
    const bounds = this.computeBounds(geojson);

    // Compute centroid from bounds
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

  private computeBounds(
    geojson: GeoJSONFeatureCollection
  ): [number, number, number, number] {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const processCoords = (coords: unknown): void => {
      if (Array.isArray(coords)) {
        if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
          // This is a [lon, lat] pair
          minX = Math.min(minX, coords[0]);
          minY = Math.min(minY, coords[1]);
          maxX = Math.max(maxX, coords[0]);
          maxY = Math.max(maxY, coords[1]);
        } else {
          // This is a nested array - recurse
          coords.forEach((c) => processCoords(c));
        }
      }
    };

    geojson.features.forEach((feature) => {
      if (feature.geometry?.coordinates) {
        processCoords(feature.geometry.coordinates);
      }
    });

    // If no valid coordinates found, return default bounds
    if (!isFinite(minX)) {
      return [-180, -90, 180, 90];
    }

    return [minX, minY, maxX, maxY];
  }
}
