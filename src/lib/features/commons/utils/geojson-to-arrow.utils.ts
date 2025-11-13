import {
  tableFromArrays,
  Utf8,
  Float64,
  Int32,
  Bool,
  type Table,
  type DataType
} from 'apache-arrow';
import type { GeoJSONFeatureCollection, GeoJSONFeature } from '$lib/types/data';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
interface SchemaInfo {
  fields: Map<string, DataType>;
  hasGeometry: boolean;
}

type ColumnData = Record<string, any[]>;

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
  const startTime = performance.now();

  const features = geojson.features;

  if (!features || features.length === 0) {
    throw new Error(
      'GeoJSON must contain at least one feature for Arrow conversion'
    );
  }

  logger.debug('Operation', LogCategory.DUCKDB);

  // Step 1: Infer schema from all features
  const schemaStart = performance.now();
  const schemaInfo = inferGeoJSONSchema(features);
  logger.debug('Operation', LogCategory.DUCKDB);

  // Step 2: Extract columnar data
  const extractStart = performance.now();
  const columns = extractColumnarData(features, schemaInfo);
  logger.debug('Operation', LogCategory.DUCKDB);

  // Step 3: Create Arrow table
  const tableStart = performance.now();
  const table = tableFromArrays(columns);
  logger.debug('Operation', LogCategory.DUCKDB);

  const totalDuration = performance.now() - startTime;
  logger.debug('Operation', LogCategory.DUCKDB);

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

  // Scan all features to discover all properties and their types
  for (const feature of features) {
    if (feature.geometry) {
      hasGeometry = true;
    }

    if (feature.properties) {
      for (const [key, value] of Object.entries(feature.properties)) {
        if (!propertyTypes.has(key)) {
          propertyTypes.set(key, new Set());
        }

        // Track the type of this value
        if (value === null || value === undefined) {
          propertyTypes.get(key)!.add('null');
        } else {
          propertyTypes.get(key)!.add(typeof value);
        }
      }
    }
  }

  // Infer Arrow data types based on observed types
  const fields = new Map<string, DataType>();

  for (const [key, types] of propertyTypes) {
    // Remove 'null' from type set for inference
    types.delete('null');

    if (types.size === 0) {
      // All values were null - default to Utf8
      fields.set(key, new Utf8());
    } else if (types.size === 1) {
      // Homogeneous type
      const type = Array.from(types)[0];

      if (type === 'number') {
        // Check if all numbers are integers
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
        // string or other - default to Utf8
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

  // Initialize column arrays
  for (const [key] of schema.fields) {
    columns[key] = [];
  }

  // Add geometry column if present
  if (schema.hasGeometry) {
    columns['geom'] = [];
  }

  // Extract values row by row
  for (const feature of features) {
    // Extract property values
    for (const [key, dataType] of schema.fields) {
      const value = feature.properties?.[key];

      if (value === null || value === undefined) {
        columns[key].push(null);
      } else if (dataType instanceof Utf8) {
        // Convert to string
        columns[key].push(String(value));
      } else if (dataType instanceof Float64) {
        columns[key].push(Number(value));
      } else if (dataType instanceof Int32) {
        columns[key].push(Number(value));
      } else if (dataType instanceof Bool) {
        columns[key].push(Boolean(value));
      } else {
        // Fallback - convert to string
        columns[key].push(String(value));
      }
    }

    // Extract geometry as JSON string
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
