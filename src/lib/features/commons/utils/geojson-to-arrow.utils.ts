import type { GeoJSONFeature, GeoJSONFeatureCollection } from '$lib/types/data';
import {
  Bool,
  Float64,
  Int32,
  tableFromArrays,
  Utf8,
  type DataType,
  type Table
} from 'apache-arrow';
interface SchemaInfo {
  fields: Map<string, DataType>;
  hasGeometry: boolean;
}

type ColumnData = Record<string, unknown[]>;

/**
 * Convert a GeoJSON FeatureCollection to an Apache Arrow Table
 * This eliminates the JSON.stringify bottleneck by building columnar data directly
 *
 * @param geojson - The GeoJSON FeatureCollection to convert
 * @returns Apache Arrow Table ready for DuckDB insertion
 */
export function convertGeoJSONToArrow(
  geojson: GeoJSONFeatureCollection
): Table {
  const features = geojson.features;

  if (!features || features.length === 0) {
    throw new Error(
      'GeoJSON must contain at least one feature for Arrow conversion'
    );
  }

  // Step 1: Infer schema from all features
  const schemaInfo = inferGeoJSONSchema(features);

  // Step 2: Extract columnar data
  const columns = extractColumnarData(features, schemaInfo);

  // Step 3: Create Arrow table
  const table = tableFromArrays(columns);

  return table;
}

/**
 * Infer Arrow schema from GeoJSON features
 * Scans all features to discover properties and their types
 *
 * @param features - Array of GeoJSON features
 * @returns Schema information with field types
 */
export function inferGeoJSONSchema(features: GeoJSONFeature[]): SchemaInfo {
  const propertyTypes = new Map<string, Set<string>>();
  let hasGeometry = false;

  for (const feature of features) {
    if (feature.geometry) {
      hasGeometry = true;
    }

    if (feature.properties) {
      for (const [key, value] of Object.entries(feature.properties)) {
        if (!propertyTypes.has(key)) {
          propertyTypes.set(key, new Set());
        }

        if (value === null || value === undefined) {
          propertyTypes.get(key)!.add('null');
        } else {
          propertyTypes.get(key)!.add(typeof value);
        }
      }
    }
  }

  const fields = new Map<string, DataType>();

  for (const [key, types] of propertyTypes) {
    // Remove 'null' from type set for inference
    types.delete('null');

    if (types.size === 0) {
      // All values were null - default to Utf8
      fields.set(key, new Utf8());
    } else if (types.size === 1) {
      const type = Array.from(types)[0];

      if (type === 'number') {
        const allIntegers = features.every((f) => {
          const val = f.properties?.[key];
          return (
            val === null ||
            val === undefined ||
            (typeof val === 'number' && Number.isInteger(val))
          );
        });
        fields.set(key, allIntegers ? new Int32() : new Float64());
      } else if (type === 'boolean') {
        fields.set(key, new Bool());
      } else {
        fields.set(key, new Utf8());
      }
    } else {
      // Mixed types - convert everything to string
      fields.set(key, new Utf8());
    }
  }

  return { fields, hasGeometry };
}

/**
 * Extract columnar data from GeoJSON features based on inferred schema
 *
 * @param features - Array of GeoJSON features
 * @param schema - Inferred schema information
 * @returns Column data ready for Arrow table creation
 */
export function extractColumnarData(
  features: GeoJSONFeature[],
  schema: SchemaInfo
): ColumnData {
  const columns: ColumnData = {};

  for (const [key] of schema.fields) {
    columns[key] = [];
  }

  if (schema.hasGeometry) {
    columns['geom'] = [];
  }

  for (const feature of features) {
    for (const [key, dataType] of schema.fields) {
      const value = feature.properties?.[key];

      if (value === null || value === undefined) {
        columns[key].push(null);
      } else if (dataType instanceof Utf8) {
        columns[key].push(String(value));
      } else if (dataType instanceof Float64) {
        columns[key].push(Number(value));
      } else if (dataType instanceof Int32) {
        columns[key].push(Number(value));
      } else if (dataType instanceof Bool) {
        columns[key].push(Boolean(value));
      } else {
        columns[key].push(String(value));
      }
    }

    if (schema.hasGeometry) {
      if (feature.geometry) {
        columns['geom'].push(JSON.stringify(feature.geometry));
      } else {
        columns['geom'].push(null);
      }
    }
  }

  return columns;
}
