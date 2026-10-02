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

export type ParsedData =
  TabularData | GeoJSONFeature | GeoJSONFeatureCollection;
