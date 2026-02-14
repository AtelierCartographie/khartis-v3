import * as m from '$lib/paraglide/messages';
import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeometryCollection
} from 'geojson';
import { GEOJSON_TYPE } from '$lib/features/commons/constants';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isFeatureCollection(
  value: unknown
): value is FeatureCollection {
  return (
    isRecord(value) &&
    value.type === GEOJSON_TYPE.FEATURE_COLLECTION &&
    Array.isArray(value.features)
  );
}

export function isFeatureArray(value: unknown): value is Feature[] {
  return Array.isArray(value) && value.every(isFeature);
}

export function isFeature(value: unknown): value is Feature {
  return (
    isRecord(value) &&
    value.type === GEOJSON_TYPE.FEATURE &&
    (value.geometry === null || isRecord(value.geometry))
  );
}

export function isGeometryCollection(
  value: unknown
): value is GeometryCollection {
  return (
    isRecord(value) &&
    value.type === GEOJSON_TYPE.GEOMETRY_COLLECTION &&
    Array.isArray(value.geometries)
  );
}

export function isGeometry(value: unknown): value is Geometry {
  return (
    isRecord(value) && typeof value.type === 'string' && 'coordinates' in value
  );
}

export type GeoJSONLike =
  | FeatureCollection
  | Feature
  | GeometryCollection
  | Geometry
  | Feature[];

export function normalizeGeojsonInput(input: GeoJSONLike): FeatureCollection {
  if (isFeatureCollection(input)) {
    return input;
  }

  if (isFeatureArray(input)) {
    return { type: GEOJSON_TYPE.FEATURE_COLLECTION, features: input };
  }

  if (isFeature(input)) {
    return { type: GEOJSON_TYPE.FEATURE_COLLECTION, features: [input] };
  }

  if (isGeometryCollection(input)) {
    return {
      type: GEOJSON_TYPE.FEATURE_COLLECTION,
      features: input.geometries.map((geometry) => ({
        type: GEOJSON_TYPE.FEATURE,
        properties: {},
        geometry
      }))
    };
  }

  if (isGeometry(input)) {
    return {
      type: GEOJSON_TYPE.FEATURE_COLLECTION,
      features: [{ type: GEOJSON_TYPE.FEATURE, properties: {}, geometry: input }]
    };
  }

  throw new Error(m.pipeline_error_invalid_geojson());
}

export function describeGeojsonStructure(data: unknown): {
  type?: string;
  hasFeatures: boolean;
  isArray: boolean;
  keys: string[];
} {
  const record = isRecord(data) ? data : {};
  const typeValue = record.type;
  return {
    type: typeof typeValue === 'string' ? typeValue : undefined,
    hasFeatures: Array.isArray(record.features),
    isArray: Array.isArray(data),
    keys: Object.keys(record)
  };
}
