import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
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

function addGeoArrowMetadata(table: ArrowTable): ArrowTable {
  const geomColumn = table.schema.fields.find(
    (f) => f.name === GeoColumnName.GEOM || f.name === GeoColumnName.GEOMETRY
  );

  if (!geomColumn) {
    return table;
  }

  const geoColumnName = geomColumn.name;

  const extensionName = geomColumn.metadata?.get(
    GeoArrowMetadataKey.EXTENSION_NAME
  );
  let encoding: string = GeometryEncoding.WKB;
  let geometryTypes = [
    GeoJsonGeometryType.Polygon,
    GeoJsonGeometryType.MultiPolygon
  ];

  if (extensionName) {
    if (extensionName.includes('geoarrow')) {
      encoding = extensionName;
      if (extensionName.includes('point')) {
        geometryTypes = [
          GeoJsonGeometryType.Point,
          GeoJsonGeometryType.MultiPoint
        ];
      } else if (extensionName.includes('line')) {
        geometryTypes = [
          GeoJsonGeometryType.LineString,
          GeoJsonGeometryType.MultiLineString
        ];
      } else if (extensionName.includes('polygon')) {
        geometryTypes = [
          GeoJsonGeometryType.Polygon,
          GeoJsonGeometryType.MultiPolygon
        ];
      }
    } else if (extensionName === ArrowExtension.OGC_WKB) {
      encoding = GeometryEncoding.WKB;
    }
  }

  const columnBounds: [number, number, number, number] = [-180, -90, 180, 90];

  const geoMetadata = {
    version: '1.0.0',
    primary_column: geoColumnName,
    columns: {
      [geoColumnName]: {
        encoding,
        geometry_types: geometryTypes,
        crs: {
          type: 'name',
          properties: {
            name: 'EPSG:4326'
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
        fieldMetadata.set(
          GeoArrowMetadataKey.EXTENSION_NAME,
          ArrowExtension.OGC_WKB
        );
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
    version: '1.0.0',
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
            name: 'EPSG:4326'
          }
        },
        bbox: [-180, -90, 180, 90]
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

export async function readDuckDBTableAsArrow(
  tableName: string
): Promise<ArrowTable> {
  if (!Duck) {
    throw new Error('DuckDB not initialized');
  }

  const result = await Duck.query(`SELECT * FROM "${tableName}"`, {
    format: 'arrow-ipc'
  });

  const table = tableFromIPC(result as Uint8Array);
  return table;
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

  const result = await Duck.query(
    `SELECT * EXCLUDE (geom), ST_AsWKB(geom) as geom FROM read_parquet('${escapedFileId}')`,
    { format: 'arrow-ipc' }
  );

  let table = tableFromIPC(result as Uint8Array);

  if (!table.schema.metadata.has(GeoArrowMetadataKey.GEO)) {
    table = addGeoArrowMetadata(table);
  }

  return table;
}
