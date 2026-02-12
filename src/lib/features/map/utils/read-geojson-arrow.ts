import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck } from '$lib/features/duckdb';
import {
  Field,
  Schema,
  Table,
  tableFromIPC,
  type Table as ArrowTable
} from 'apache-arrow/Arrow';
import {
  ArrowExtension,
  GeoArrowMetadataKey,
  GeoColumnName,
  GeoJsonGeometryType,
  GeometryEncoding
} from '../constants';

const GEO_METADATA_VERSION = '1.0.0';
const DEFAULT_CRS_NAME = 'EPSG:4326';
const WORLD_BOUNDS: [number, number, number, number] = [-180, -90, 180, 90];

const GEOPARQUET_ENCODING_TO_ARROW: Record<string, string> = {
  wkb: ArrowExtension.OGC_WKB,
  point: ArrowExtension.GEOARROW_POINT,
  multipoint: ArrowExtension.GEOARROW_MULTIPOINT,
  linestring: ArrowExtension.GEOARROW_LINESTRING,
  multilinestring: ArrowExtension.GEOARROW_MULTILINESTRING,
  polygon: ArrowExtension.GEOARROW_POLYGON,
  multipolygon: ArrowExtension.GEOARROW_MULTIPOLYGON
};

const ARROW_EXTENSION_TO_GEOJSON_TYPES: Record<string, string[]> = {
  [ArrowExtension.GEOARROW_POINT]: [GeoJsonGeometryType.Point],
  [ArrowExtension.GEOARROW_MULTIPOINT]: [
    GeoJsonGeometryType.Point,
    GeoJsonGeometryType.MultiPoint
  ],
  [ArrowExtension.GEOARROW_LINESTRING]: [GeoJsonGeometryType.LineString],
  [ArrowExtension.GEOARROW_MULTILINESTRING]: [
    GeoJsonGeometryType.LineString,
    GeoJsonGeometryType.MultiLineString
  ],
  [ArrowExtension.GEOARROW_POLYGON]: [
    GeoJsonGeometryType.Polygon,
    GeoJsonGeometryType.MultiPolygon
  ],
  [ArrowExtension.GEOARROW_MULTIPOLYGON]: [
    GeoJsonGeometryType.Polygon,
    GeoJsonGeometryType.MultiPolygon
  ]
};

function detectNativeGeoArrowFromType(geomField: Field): string | null {
  let type = geomField.type;
  let listDepth = 0;

  while (type.children && type.children.length === 1) {
    type = type.children[0].type;
    listDepth++;
  }

  if (!type.children || type.children.length < 2) {
    return null;
  }

  switch (listDepth) {
    case 0:
      return ArrowExtension.GEOARROW_POINT;
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

function resolveGeometryEncoding(
  geomField: Field,
  geoParquetEncoding?: string
): { arrowExtension: string; geometryTypes: string[] } {
  if (geoParquetEncoding) {
    const mapped =
      GEOPARQUET_ENCODING_TO_ARROW[geoParquetEncoding.toLowerCase()];
    if (mapped) {
      return {
        arrowExtension: mapped,
        geometryTypes: ARROW_EXTENSION_TO_GEOJSON_TYPES[mapped] ?? [
          GeoJsonGeometryType.Polygon,
          GeoJsonGeometryType.MultiPolygon
        ]
      };
    }
  }

  const extensionName = geomField.metadata?.get(
    GeoArrowMetadataKey.EXTENSION_NAME
  );
  if (extensionName) {
    if (extensionName.includes('geoarrow')) {
      return {
        arrowExtension: extensionName,
        geometryTypes: ARROW_EXTENSION_TO_GEOJSON_TYPES[extensionName] ?? [
          GeoJsonGeometryType.Polygon,
          GeoJsonGeometryType.MultiPolygon
        ]
      };
    }
    if (extensionName === ArrowExtension.OGC_WKB) {
      return {
        arrowExtension: ArrowExtension.OGC_WKB,
        geometryTypes: [
          GeoJsonGeometryType.Polygon,
          GeoJsonGeometryType.MultiPolygon
        ]
      };
    }
  }

  const detected = detectNativeGeoArrowFromType(geomField);
  if (detected) {
    return {
      arrowExtension: detected,
      geometryTypes: ARROW_EXTENSION_TO_GEOJSON_TYPES[detected] ?? [
        GeoJsonGeometryType.Polygon,
        GeoJsonGeometryType.MultiPolygon
      ]
    };
  }

  return {
    arrowExtension: ArrowExtension.OGC_WKB,
    geometryTypes: [
      GeoJsonGeometryType.Polygon,
      GeoJsonGeometryType.MultiPolygon
    ]
  };
}

export function addGeoArrowMetadata(
  table: ArrowTable,
  geoParquetEncoding?: string
): ArrowTable {
  const geomColumn = table.schema.fields.find(
    (f) => f.name === GeoColumnName.GEOM || f.name === GeoColumnName.GEOMETRY
  );

  if (!geomColumn) {
    return table;
  }

  const geoColumnName = geomColumn.name;
  const { arrowExtension, geometryTypes } = resolveGeometryEncoding(
    geomColumn,
    geoParquetEncoding
  );

  const columnBounds: [number, number, number, number] = WORLD_BOUNDS;

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
        bbox: columnBounds
      }
    }
  };

  const newSchemaMetadata = new Map(table.schema.metadata);
  newSchemaMetadata.set(GeoArrowMetadataKey.GEO, JSON.stringify(geoMetadata));

  const newFields = table.schema.fields.map((field) => {
    if (field.name === geoColumnName) {
      const fieldMetadata = new Map(field.metadata || []);
      if (!fieldMetadata.has(GeoArrowMetadataKey.EXTENSION_NAME)) {
        fieldMetadata.set(GeoArrowMetadataKey.EXTENSION_NAME, arrowExtension);
      }
      return new Field(field.name, field.type, field.nullable, fieldMetadata);
    }
    return new Field(field.name, field.type, field.nullable, field.metadata);
  });

  const newSchema = new Schema(newFields, newSchemaMetadata);
  const newTable = new Table(newSchema, table.batches);

  return newTable;
}

export async function readGeoJSONAsArrow(
  geojsonText: string,
  tableName: string
): Promise<ArrowTable> {
  if (!Duck) {
    throw new Error('DuckDB not initialized');
  }

  const sanitizedName = tableName
    .replace(/dataset_/g, '')
    .replace(/-/g, '_')
    .replace('.geojson', '');

  const geojsonFile = new File([geojsonText], `${sanitizedName}.geojson`, {
    type: 'application/geo+json'
  });

  await Duck.register_files([geojsonFile]);

  const fileWithId = geojsonFile as File & { id?: string };
  const fileId =
    fileWithId.id || `${geojsonFile.lastModified}-${geojsonFile.name}`;

  const escapedFileId = escapeSqlString(fileId);

  const result = await Duck.query(
    `SELECT * EXCLUDE (geom), ST_AsGeoJSON(geom) as geom FROM ST_Read('${escapedFileId}')`,
    {
      format: 'arrow-ipc'
    }
  );

  let table = tableFromIPC(result as Uint8Array);

  table = addGeoJsonMetadata(table);

  return table;
}

function addGeoJsonMetadata(table: ArrowTable): ArrowTable {
  const geomColumn = table.schema.fields.find(
    (f) => f.name === GeoColumnName.GEOM || f.name === GeoColumnName.GEOMETRY
  );

  if (!geomColumn) {
    return table;
  }

  const geoColumnName = geomColumn.name;

  const geoMetadata = {
    version: GEO_METADATA_VERSION,
    primary_column: geoColumnName,
    columns: {
      [geoColumnName]: {
        encoding: GeometryEncoding.GEOJSON,
        geometry_types: [
          GeoJsonGeometryType.Polygon,
          GeoJsonGeometryType.MultiPolygon
        ],
        crs: {
          type: 'name',
          properties: {
            name: DEFAULT_CRS_NAME
          }
        },
        bbox: WORLD_BOUNDS
      }
    }
  };

  const newSchemaMetadata = new Map(table.schema.metadata);
  newSchemaMetadata.set(GeoArrowMetadataKey.GEO, JSON.stringify(geoMetadata));

  const newFields = table.schema.fields.map((field) => {
    if (field.name === geoColumnName) {
      const fieldMetadata = new Map(field.metadata || []);
      fieldMetadata.set(
        GeoArrowMetadataKey.EXTENSION_NAME,
        ArrowExtension.GEOJSON
      );
      return new Field(field.name, field.type, field.nullable, fieldMetadata);
    }
    return new Field(field.name, field.type, field.nullable, field.metadata);
  });

  const newSchema = new Schema(newFields, newSchemaMetadata);
  const newTable = new Table(newSchema, table.batches);

  return newTable;
}

async function readParquetGeoEncoding(
  escapedFileId: string
): Promise<string | undefined> {
  try {
    const result = (await Duck.query(
      `SELECT value FROM parquet_kv_metadata('${escapedFileId}') WHERE key = 'geo'`,
      { format: 'array', useProxy: false }
    )) as Array<{ value: string }>;

    if (result.length > 0 && result[0].value) {
      const geo = JSON.parse(result[0].value);
      const primaryCol = geo.primary_column ?? 'geom';
      return geo.columns?.[primaryCol]?.encoding;
    }
  } catch (error) {
    logger.warn(
      'Failed to read GeoParquet metadata for encoding',
      LogCategory.MAP,
      error
    );
  }
  return undefined;
}

export async function readGeoParquetViaDuckDB(
  arrayBuffer: ArrayBuffer,
  tableName: string
): Promise<ArrowTable> {
  if (!Duck) {
    throw new Error('DuckDB not initialized');
  }

  const sanitizedName = tableName
    .replace(/dataset_/g, '')
    .replace(/-/g, '_')
    .replace('.parquet', '');

  const parquetFile = new File([arrayBuffer], `${sanitizedName}.parquet`, {
    type: 'application/octet-stream'
  });

  await Duck.register_files([parquetFile]);

  const fileWithId = parquetFile as File & { id?: string };
  const fileId =
    fileWithId.id || `${parquetFile.lastModified}-${parquetFile.name}`;
  const escapedFileId = escapeSqlString(fileId);

  // Read GeoParquet encoding metadata before reading data
  const geoEncoding = await readParquetGeoEncoding(escapedFileId);

  const result = await Duck.query(
    `SELECT * FROM read_parquet('${escapedFileId}')`,
    { format: 'arrow-ipc' }
  );

  let table = tableFromIPC(result as Uint8Array);

  if (!table.schema.metadata.has(GeoArrowMetadataKey.GEO)) {
    table = addGeoArrowMetadata(table, geoEncoding);
  }

  return table;
}
