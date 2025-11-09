import type { JsonValue } from './utility';

export type { JsonValue };

export type TabularData = Record<string, JsonValue>[];

export interface GeoJSONFeature {
  type: 'Feature';
  geometry?: {
    type: string;
    coordinates: unknown;
  };
  properties?: Record<string, JsonValue>;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
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

export function isGeoJSONFeature(data: ParsedData): data is GeoJSONFeature {
  return (
    !Array.isArray(data) &&
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    data.type === 'Feature'
  );
}

export function isGeoJSONData(data: ParsedData): data is GeoJSONData {
  return isGeoJSONFeatureCollection(data) || isGeoJSONFeature(data);
}

export function getParsedDataLength(data: ParsedData | undefined): number {
  if (!data) return 0;
  if (isTabularData(data)) return data.length;
  if (isGeoJSONFeatureCollection(data)) return data.features.length;
  if (isGeoJSONFeature(data)) return 1;
  return 0;
}

export function getParsedDataSample(data: ParsedData | undefined): unknown {
  if (!data) return undefined;
  if (isTabularData(data)) return data[0];
  if (isGeoJSONFeatureCollection(data)) return data.features[0];
  if (isGeoJSONFeature(data)) return data;
  return undefined;
}
