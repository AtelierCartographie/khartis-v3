import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { GEO_CONSTANTS } from '$lib/features/duckdb';
import {
  Field,
  RecordBatch,
  Schema,
  Table,
  Type,
  tableFromIPC,
  type Table as ArrowTable
} from 'apache-arrow/Arrow';
import type * as ParquetWasm from 'parquet-wasm';
import { ArrowExtension, GeoArrowMetadataKey } from '../constants';
import { GEOJSON_TYPE } from '$lib/features/commons/constants';

const GEO_METADATA_VERSION = '1.0.0';
const DEFAULT_CRS_NAME = GEO_CONSTANTS.WGS84_CRS;
const WORLD_BOUNDS: [number, number, number, number] = [-180, -90, 180, 90];

let parquetWasmReady: Promise<typeof ParquetWasm> | null = null;

async function getParquetWasm(): Promise<typeof ParquetWasm> {
  if (!parquetWasmReady) {
    parquetWasmReady = (async () => {
      const mod = await import('parquet-wasm');
      await mod.default();
      return mod;
    })();
  }
  return parquetWasmReady;
}

const GEOPARQUET_ENCODING_TO_ARROW: Record<string, string> = {
  wkb: ArrowExtension.GEOARROW_WKB,
  point: ArrowExtension.GEOARROW_POINT,
  multipoint: ArrowExtension.GEOARROW_MULTIPOINT,
  linestring: ArrowExtension.GEOARROW_LINESTRING,
  multilinestring: ArrowExtension.GEOARROW_MULTILINESTRING,
  polygon: ArrowExtension.GEOARROW_POLYGON,
  multipolygon: ArrowExtension.GEOARROW_MULTIPOLYGON
};

function normalizeArrowExtension(extension: string): string {
  return extension === ArrowExtension.OGC_WKB
    ? ArrowExtension.GEOARROW_WKB
    : extension;
}

function getBinaryFallbackExtension(geomField: Field): string {
  return geomField.type.typeId === Type.Binary ||
    geomField.type.typeId === Type.FixedSizeBinary ||
    geomField.type.typeId === Type.LargeBinary
    ? ArrowExtension.GEOARROW_WKB
    : ArrowExtension.OGC_WKB;
}

function detectNativeGeoArrowFromType(geomField: Field): string | null {
  if (geomField.type.typeId === Type.FixedSizeList) {
    return ArrowExtension.GEOARROW_POINT;
  }

  if (
    geomField.type.typeId === Type.List &&
    geomField.type.children.length === 1
  ) {
    const childField = geomField.type.children[0];

    switch (childField.name) {
      case 'lines':
        return ArrowExtension.GEOARROW_MULTILINESTRING;
      case 'rings':
        return ArrowExtension.GEOARROW_POLYGON;
      case 'polygons':
        return ArrowExtension.GEOARROW_MULTIPOLYGON;
      case 'vertices':
        if (childField.type.typeId === Type.FixedSizeList) {
          return ArrowExtension.GEOARROW_MULTIPOINT;
        }
        break;
      default:
        break;
    }
  }

  let type = geomField.type;
  let listDepth = 0;

  while (type.typeId === Type.List && type.children.length === 1) {
    type = type.children[0].type;
    listDepth++;
  }

  if (type.typeId !== Type.FixedSizeList) {
    return null;
  }

  switch (listDepth) {
    case 1:
      return ArrowExtension.GEOARROW_MULTIPOINT;
    case 2:
      return ArrowExtension.GEOARROW_POLYGON;
    case 3:
      return ArrowExtension.GEOARROW_MULTIPOLYGON;
    default:
      return null;
  }
}

export function addGeoArrowMetadata(
  table: ArrowTable,
  geoParquetEncoding?: string,
  bbox?: [number, number, number, number]
): ArrowTable {
  const geomColumn = table.schema.fields.find(
    (f) =>
      f.name === INTERNAL_COLUMN.GEOM || f.name === INTERNAL_COLUMN.GEOMETRY
  );

  if (!geomColumn) {
    return table;
  }

  const geoColumnName = geomColumn.name;
  const isBinaryGeometryField =
    geomColumn.type.typeId === Type.Binary ||
    geomColumn.type.typeId === Type.FixedSizeBinary ||
    geomColumn.type.typeId === Type.LargeBinary;

  const existingExtension = geomColumn.metadata?.get(
    GeoArrowMetadataKey.EXTENSION_NAME
  );

  let arrowExtension: string;
  let geometryTypes: string[];
  const detectedNativeExtension = detectNativeGeoArrowFromType(geomColumn);

  if (
    detectedNativeExtension &&
    (!existingExtension ||
      existingExtension === ArrowExtension.OGC_WKB ||
      existingExtension === ArrowExtension.GEOARROW_WKB)
  ) {
    arrowExtension = detectedNativeExtension;
    geometryTypes = getGeometryTypesForEncoding(
      detectedNativeExtension.replace('geoarrow.', '')
    );
  } else if (existingExtension) {
    arrowExtension = normalizeArrowExtension(existingExtension);
    geometryTypes = getGeometryTypesForEncoding(
      arrowExtension.replace('geoarrow.', '')
    );
  } else if (isBinaryGeometryField) {
    arrowExtension = getBinaryFallbackExtension(geomColumn);
    geometryTypes = geoParquetEncoding
      ? getGeometryTypesForEncoding(geoParquetEncoding)
      : [GEOJSON_TYPE.POLYGON, GEOJSON_TYPE.MULTI_POLYGON];
  } else if (geoParquetEncoding) {
    const mapped =
      GEOPARQUET_ENCODING_TO_ARROW[geoParquetEncoding.toLowerCase()];
    if (mapped) {
      arrowExtension = mapped;
      geometryTypes = getGeometryTypesForEncoding(geoParquetEncoding);
    } else {
      arrowExtension = getBinaryFallbackExtension(geomColumn);
      geometryTypes = [GEOJSON_TYPE.POLYGON, GEOJSON_TYPE.MULTI_POLYGON];
    }
  } else {
    if (detectedNativeExtension) {
      arrowExtension = detectedNativeExtension;
      geometryTypes = getGeometryTypesForEncoding(
        detectedNativeExtension.replace('geoarrow.', '')
      );
    } else {
      arrowExtension = getBinaryFallbackExtension(geomColumn);
      geometryTypes = [GEOJSON_TYPE.POLYGON, GEOJSON_TYPE.MULTI_POLYGON];
    }
  }

  const geoMetadata = {
    version: GEO_METADATA_VERSION,
    primary_column: geoColumnName,
    columns: {
      [geoColumnName]: {
        encoding: arrowExtension,
        geometry_types: geometryTypes,
        crs: {
          type: 'name',
          properties: {
            name: DEFAULT_CRS_NAME
          }
        },
        bbox: bbox ?? WORLD_BOUNDS
      }
    }
  };

  const newSchemaMetadata = new Map(table.schema.metadata);
  newSchemaMetadata.set(GeoArrowMetadataKey.GEO, JSON.stringify(geoMetadata));

  const newFields = table.schema.fields.map((field) => {
    if (field.name === geoColumnName) {
      const fieldMetadata = new Map(field.metadata || []);
      if (
        !fieldMetadata.has(GeoArrowMetadataKey.EXTENSION_NAME) ||
        fieldMetadata.get(GeoArrowMetadataKey.EXTENSION_NAME) !== arrowExtension
      ) {
        fieldMetadata.set(GeoArrowMetadataKey.EXTENSION_NAME, arrowExtension);
      }
      fieldMetadata.set(
        'ARROW:extension:metadata',
        JSON.stringify({
          geometry_type: geometryTypes[0],
          crs: DEFAULT_CRS_NAME
        })
      );
      return new Field(field.name, field.type, field.nullable, fieldMetadata);
    }
    return new Field(field.name, field.type, field.nullable, field.metadata);
  });

  const newSchema = new Schema(newFields, newSchemaMetadata);
  return new Table(newSchema, table.batches);
}

function getGeometryTypesForEncoding(encoding: string): string[] {
  const ENCODING_TO_TYPES: Record<string, string[]> = {
    point: [GEOJSON_TYPE.POINT],
    multipoint: [GEOJSON_TYPE.POINT, GEOJSON_TYPE.MULTI_POINT],
    linestring: [GEOJSON_TYPE.LINE_STRING],
    multilinestring: [GEOJSON_TYPE.LINE_STRING, GEOJSON_TYPE.MULTI_LINE_STRING],
    polygon: [GEOJSON_TYPE.POLYGON, GEOJSON_TYPE.MULTI_POLYGON],
    multipolygon: [GEOJSON_TYPE.POLYGON, GEOJSON_TYPE.MULTI_POLYGON]
  };
  return (
    ENCODING_TO_TYPES[encoding.toLowerCase()] ?? [
      GEOJSON_TYPE.POLYGON,
      GEOJSON_TYPE.MULTI_POLYGON
    ]
  );
}

export async function readGeoParquetDirect(
  arrayBuffer: ArrayBuffer,
  bbox?: [number, number, number, number]
): Promise<ArrowTable> {
  const { readParquet } = await getParquetWasm();

  const wasmTable = readParquet(new Uint8Array(arrayBuffer));
  let table = tableFromIPC(wasmTable.intoIPCStream());

  const geoMetaStr = table.schema.metadata?.get('geo');
  let primaryColumn = INTERNAL_COLUMN.GEOMETRY;
  let encoding: string | undefined;

  if (geoMetaStr) {
    try {
      const geo = JSON.parse(geoMetaStr);
      primaryColumn = geo.primary_column ?? INTERNAL_COLUMN.GEOMETRY;
      const colMeta = geo.columns?.[primaryColumn];
      encoding = colMeta?.encoding;
    } catch (error) {
      logger.warn(
        'Failed to parse GeoParquet metadata; detecting geometry metadata from Arrow type',
        LogCategory.MAP,
        {
          error,
          flow: 'geo_parquet_direct_read',
          extra: {
            primaryColumn
          }
        }
      );
    }
  }

  if (
    primaryColumn !== INTERNAL_COLUMN.GEOMETRY &&
    primaryColumn !== INTERNAL_COLUMN.WKB_GEOMETRY &&
    table.schema.fields.some((f) => f.name === primaryColumn)
  ) {
    const newFields = table.schema.fields.map((field) => {
      if (field.name === primaryColumn) {
        return new Field(
          INTERNAL_COLUMN.GEOMETRY,
          field.type,
          field.nullable,
          field.metadata
        );
      }
      return field;
    });

    const newSchemaMetadata = new Map(table.schema.metadata);
    if (geoMetaStr) {
      try {
        const geo = JSON.parse(geoMetaStr);
        const colData = geo.columns?.[primaryColumn];
        if (colData) {
          delete geo.columns[primaryColumn];
          geo.columns[INTERNAL_COLUMN.GEOMETRY] = colData;
          geo.primary_column = INTERNAL_COLUMN.GEOMETRY;
        }
        newSchemaMetadata.set(GeoArrowMetadataKey.GEO, JSON.stringify(geo));
      } catch (error) {
        logger.warn(
          'Failed to rewrite GeoParquet metadata for renamed geometry column',
          LogCategory.MAP,
          {
            error,
            flow: 'geo_parquet_direct_read',
            extra: {
              primaryColumn,
              targetColumn: INTERNAL_COLUMN.GEOMETRY
            }
          }
        );
      }
    }

    const newSchema = new Schema(newFields, newSchemaMetadata);
    const newBatches = table.batches.map(
      (batch) => new RecordBatch(newSchema, batch.data)
    );
    table = new Table(newBatches);
  }

  table = addGeoArrowMetadata(table, encoding, bbox);

  return table;
}
