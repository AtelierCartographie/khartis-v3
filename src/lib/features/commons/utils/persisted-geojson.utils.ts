import {
  isGeoJSONFeatureCollection,
  type GeoJSONFeatureCollection
} from '$lib/types/data';

const PERSISTED_GEOJSON_EXCLUDED_PROPERTIES = new Set(['OGC_FID']);

function sanitizeFeatureProperties(
  properties: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!properties) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(properties).filter(
      ([key]) => !PERSISTED_GEOJSON_EXCLUDED_PROPERTIES.has(key)
    )
  );
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
