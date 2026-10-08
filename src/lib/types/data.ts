import type { Geometry } from 'geojson';
import type { JsonValue } from './utility';

export type { JsonValue };

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
