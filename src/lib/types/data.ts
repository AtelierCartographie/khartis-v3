import type { Geometry } from 'geojson';
import type { JsonValue } from './utility';

export type { JsonValue };

export type TabularData = Record<string, JsonValue>[];

export interface GeoJSONFeature {
  type: 'Feature';
  geometry?: Geometry | Record<string, unknown> | null;
  properties?: Record<string, JsonValue> | null;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
  crs?: {
    properties?: {
      name?: string;
    };
  };
}

export type GeoJSONData = GeoJSONFeature | GeoJSONFeatureCollection;

export type ParsedData = TabularData | GeoJSONData;

export function isTabularData(data: ParsedData): data is TabularData {
  return Array.isArray(data) && (data.length === 0 || !('type' in data[0]));
}

export function isGeoJSONFeatureCollection(
  data: ParsedData
): data is GeoJSONFeatureCollection {
  return (
    !Array.isArray(data) &&
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    data.type === 'FeatureCollection'
  );
}
