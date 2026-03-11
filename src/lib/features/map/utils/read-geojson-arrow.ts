import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { Duck, GEO_CONSTANTS } from '$lib/features/duckdb';
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
  GeometryEncoding
} from '../constants';
import { GEOJSON_TYPE } from '$lib/features/commons/constants';

const GEO_METADATA_VERSION = '1.0.0';
const DEFAULT_CRS_NAME = GEO_CONSTANTS.WGS84_CRS;
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
  [ArrowExtension.GEOARROW_POINT]: [GEOJSON_TYPE.POINT],
  [ArrowExtension.GEOARROW_MULTIPOINT]: [
    GEOJSON_TYPE.POINT,
    GEOJSON_TYPE.MULTI_POINT
  ],
  [ArrowExtension.GEOARROW_LINESTRING]: [GEOJSON_TYPE.LINE_STRING],
  [ArrowExtension.GEOARROW_MULTILINESTRING]: [
    GEOJSON_TYPE.LINE_STRING,
    GEOJSON_TYPE.MULTI_LINE_STRING
  ],
  [ArrowExtension.GEOARROW_POLYGON]: [
    GEOJSON_TYPE.POLYGON,
    GEOJSON_TYPE.MULTI_POLYGON
  ],
  [ArrowExtension.GEOARROW_MULTIPOLYGON]: [
    GEOJSON_TYPE.POLYGON,
    GEOJSON_TYPE.MULTI_POLYGON
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
          GEOJSON_TYPE.POLYGON,
          GEOJSON_TYPE.MULTI_POLYGON
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
          GEOJSON_TYPE.POLYGON,
          GEOJSON_TYPE.MULTI_POLYGON
        ]
      };
    }
    if (extensionName === ArrowExtension.OGC_WKB) {
      return {
        arrowExtension: ArrowExtension.OGC_WKB,
        geometryTypes: [GEOJSON_TYPE.POLYGON, GEOJSON_TYPE.MULTI_POLYGON]
      };
    }
  }

  const detected = detectNativeGeoArrowFromType(geomField);
  if (detected) {
    return {
      arrowExtension: detected,
      geometryTypes: ARROW_EXTENSION_TO_GEOJSON_TYPES[detected] ?? [
        GEOJSON_TYPE.POLYGON,
        GEOJSON_TYPE.MULTI_POLYGON
      ]
    };
  }

  return {
    arrowExtension: ArrowExtension.OGC_WKB,
    geometryTypes: [GEOJSON_TYPE.POLYGON, GEOJSON_TYPE.MULTI_POLYGON]
  };
}

export function addGeoArrowMetadata(
  table: ArrowTable,
  geoParquetEncoding?: string
): ArrowTable {
  const geomColumn = table.schema.fields.find(
    (f) =>
      f.name === INTERNAL_COLUMN.GEOM || f.name === INTERNAL_COLUMN.GEOMETRY
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
    (f) =>
      f.name === INTERNAL_COLUMN.GEOM || f.name === INTERNAL_COLUMN.GEOMETRY
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
        geometry_types: [GEOJSON_TYPE.POLYGON, GEOJSON_TYPE.MULTI_POLYGON],
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

interface ParquetGeoInfo {
  encoding: string | undefined;
  sourceCrs: string | undefined;
  isProjectedCRS: boolean;
  primaryColumn: string;
}

async function readParquetGeoInfo(
  escapedFileId: string
): Promise<ParquetGeoInfo> {
  try {
    const result = (await Duck.query(
      `SELECT value FROM parquet_kv_metadata('${escapedFileId}') WHERE key = 'geo'`,
      { format: 'array', useProxy: false }
    )) as Array<{ value: string }>;

    if (result.length > 0 && result[0].value) {
      const geo = JSON.parse(result[0].value);
      const primaryCol: string = geo.primary_column ?? INTERNAL_COLUMN.GEOM;
      const colMeta = geo.columns?.[primaryCol];
      const encoding: string | undefined = colMeta?.encoding;
      const crs = colMeta?.crs;

      const isProjectedCRS = crs?.type === 'ProjectedCRS';
      let sourceCrs: string | undefined;
      if (isProjectedCRS && crs?.id?.authority && crs?.id?.code) {
        sourceCrs = `${crs.id.authority}:${crs.id.code}`;
      }

      return { encoding, sourceCrs, isProjectedCRS, primaryColumn: primaryCol };
    }
  } catch (error) {
    logger.warn('Failed to read GeoParquet metadata', LogCategory.MAP, error);
  }
  return {
    encoding: undefined,
    sourceCrs: undefined,
    isProjectedCRS: false,
    primaryColumn: INTERNAL_COLUMN.GEOM
  };
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

  // Read GeoParquet metadata (encoding + CRS info)
  const geoInfo = await readParquetGeoInfo(escapedFileId);

  // If the parquet uses a projected (non-WGS84) CRS, reproject geometry to WGS84.
  // Cast to ::GEOMETRY is required because read_parquet returns native GeoArrow types
  // (e.g. MULTIPOLYGON_2D) which ST_Transform does not accept directly.
  if (geoInfo.isProjectedCRS && geoInfo.sourceCrs) {
    const geomCol = geoInfo.primaryColumn;
    const escapedGeomCol = escapeIdentifier(geomCol);
    const escapedSourceCrs = escapeSqlString(geoInfo.sourceCrs);
    logger.info(
      `Reprojecting parquet geometry from ${geoInfo.sourceCrs} to EPSG:4326`,
      LogCategory.MAP,
      { sourceCrs: geoInfo.sourceCrs, geomCol }
    );
    // Attempt 1: read_parquet with explicit GEOMETRY cast
    try {
      const result = await Duck.query(
        `SELECT * EXCLUDE ("${escapedGeomCol}"), ST_AsGeoJSON(ST_Transform("${escapedGeomCol}"::GEOMETRY, '${escapedSourceCrs}', 'EPSG:4326', true)) as "${escapedGeomCol}" FROM read_parquet('${escapedFileId}')`,
        { format: 'arrow-ipc' }
      );
      let table = tableFromIPC(result as Uint8Array);
      table = addGeoJsonMetadata(table);
      logger.info('Reprojection via read_parquet succeeded', LogCategory.MAP);
      return table;
    } catch (err1) {
      logger.warn(
        'Reprojection via read_parquet failed, trying ST_Read',
        LogCategory.MAP,
        { error: err1 }
      );
    }
    // Attempt 2: ST_Read (GDAL) always returns GEOMETRY type
    try {
      const result = await Duck.query(
        `SELECT * EXCLUDE ("${escapedGeomCol}"), ST_AsGeoJSON(ST_Transform("${escapedGeomCol}", '${escapedSourceCrs}', 'EPSG:4326', true)) as "${escapedGeomCol}" FROM ST_Read('${escapedFileId}')`,
        { format: 'arrow-ipc' }
      );
      let table = tableFromIPC(result as Uint8Array);
      table = addGeoJsonMetadata(table);
      logger.info('Reprojection via ST_Read succeeded', LogCategory.MAP);
      return table;
    } catch (err2) {
      logger.warn(
        'Reprojection via ST_Read also failed, using raw coordinates',
        LogCategory.MAP,
        { error: err2 }
      );
    }
  }

  // Default path: read raw parquet (WGS84 assumed).
  // For WKB-encoded GeoParquet, DuckDB spatial auto-converts the binary column to its
  // internal GEOMETRY type on read, making the Arrow IPC bytes incompatible with the
  // standard WKB parser. Use ST_AsGeoJSON to return a consistently parseable result.
  const defaultGeomCol = geoInfo.primaryColumn;
  const escapedDefaultGeomCol = escapeIdentifier(defaultGeomCol);
  if (geoInfo.encoding?.toLowerCase() === 'wkb') {
    const wkbResult = await Duck.query(
      `SELECT * EXCLUDE ("${escapedDefaultGeomCol}"), ST_AsGeoJSON("${escapedDefaultGeomCol}") as "${escapedDefaultGeomCol}" FROM read_parquet('${escapedFileId}')`,
      { format: 'arrow-ipc' }
    );
    let wkbTable = tableFromIPC(wkbResult as Uint8Array);
    wkbTable = addGeoJsonMetadata(wkbTable);
    return wkbTable;
  }

  const result = await Duck.query(
    `SELECT * FROM read_parquet('${escapedFileId}')`,
    { format: 'arrow-ipc' }
  );

  let table = tableFromIPC(result as Uint8Array);

  if (!table.schema.metadata.has(GeoArrowMetadataKey.GEO)) {
    table = addGeoArrowMetadata(table, geoInfo.encoding);
  }

  return table;
}
