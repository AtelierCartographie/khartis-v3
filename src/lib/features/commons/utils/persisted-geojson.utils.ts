import {
  isGeoJSONFeatureCollection,
  type GeoJSONFeatureCollection,
  type JsonValue
} from '$lib/types/data';

const PERSISTED_GEOJSON_EXCLUDED_PROPERTIES = new Set(['OGC_FID']);

function sanitizeFeatureProperties(
  properties: Record<string, unknown> | null | undefined
): Record<string, JsonValue> {
  if (!properties) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(properties)
      .filter(([key]) => !PERSISTED_GEOJSON_EXCLUDED_PROPERTIES.has(key))
      .map(([key, value]) => [key, toJsonValue(value)])
  );
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toJsonValue(item)])
    );
  }

  return String(value);
}

export function sanitizePreparedGeoJSON(
  preparedGeoJSON: string | undefined
): string | undefined {
  if (!preparedGeoJSON) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(preparedGeoJSON);
    if (!isGeoJSONFeatureCollection(parsed)) {
      return preparedGeoJSON;
    }

    const sanitized: GeoJSONFeatureCollection = {
      ...parsed,
      features: parsed.features.map((feature) => ({
        ...feature,
        properties: sanitizeFeatureProperties(feature.properties)
      }))
    };

    return JSON.stringify(sanitized);
  } catch {
    return preparedGeoJSON;
  }
}
