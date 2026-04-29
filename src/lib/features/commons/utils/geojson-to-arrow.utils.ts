import * as m from '$lib/paraglide/messages';
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
import { INTERNAL_COLUMN } from '../constants/data.constants';

const GEOMETRY_COLUMN_NAME = INTERNAL_COLUMN.GEOM;

interface SchemaInfo {
  fields: Map<string, DataType>;
  hasGeometry: boolean;
}

type ColumnData = Record<string, unknown[]>;

export function convertGeoJSONToArrow(
  geojson: GeoJSONFeatureCollection
): Table {
  const features = geojson.features;

  if (!features || features.length === 0) {
    throw new Error(m.error_geojson_conversion_failed());
  }

  const schemaInfo = inferGeoJSONSchema(features);
  const columns = extractColumnarData(features, schemaInfo);
  const table = tableFromArrays(columns);

  return table;
}

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
    types.delete('null');

    if (types.size === 0) {
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
      fields.set(key, new Utf8());
    }
  }

  return { fields, hasGeometry };
}

export function extractColumnarData(
  features: GeoJSONFeature[],
  schema: SchemaInfo
): ColumnData {
  const columns: ColumnData = {};

  for (const [key] of schema.fields) {
    columns[key] = [];
  }

  if (schema.hasGeometry) {
    columns[GEOMETRY_COLUMN_NAME] = [];
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
        // JSON.stringify is required: Arrow tableFromArrays() only accepts primitives.
        // DuckDB immediately converts back via ST_GeomFromGeoJSON() in geojson-processor.ts.
        columns[GEOMETRY_COLUMN_NAME].push(JSON.stringify(feature.geometry));
      } else {
        columns[GEOMETRY_COLUMN_NAME].push(null);
      }
    }
  }

  return columns;
}
