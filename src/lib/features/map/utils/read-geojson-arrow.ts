import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { Duck, GEO_CONSTANTS } from '$lib/features/duckdb';
import {
  isProjectionSupported,
  reprojectPoint
} from '$lib/features/duckdb/io/reprojection';
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
  const { arrowExtension, geometryTypes } = resolveGeometryEncoding(
    geomColumn,
    geoParquetEncoding
  );

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
  tableName: string,
  bbox?: [number, number, number, number]
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

  table = addGeoJsonMetadata(table, bbox);

  return table;
}

function addGeoJsonMetadata(
  table: ArrowTable,
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
        bbox: bbox ?? WORLD_BOUNDS
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
      // parquet_kv_metadata returns BLOB type — convert to string if needed
      const rawValue =
        (result[0].value as unknown) instanceof Uint8Array
          ? new TextDecoder().decode(result[0].value as unknown as Uint8Array)
          : result[0].value;
      const geo = JSON.parse(rawValue);
      const primaryCol: string = geo.primary_column ?? INTERNAL_COLUMN.GEOM;
      const colMeta = geo.columns?.[primaryCol];
      const encoding: string | undefined = colMeta?.encoding;
      const crs = colMeta?.crs;

      const isProjectedCRS = crs?.type === 'ProjectedCRS';
      let sourceCrs: string | undefined;
      if (isProjectedCRS) {
        // Try direct id (e.g., EPSG:2154 on the ProjectedCRS itself)
        if (crs?.id?.authority && crs?.id?.code) {
          sourceCrs = `${crs.id.authority}:${crs.id.code}`;
        }
        // Fallback: detect from CRS name (e.g., "RGF93 v1 / Lambert-93")
        if (!sourceCrs && crs?.name) {
          if (/Lambert[\s-]*93/i.test(crs.name)) sourceCrs = 'EPSG:2154';
          else if (/Lambert[\s-]*II/i.test(crs.name)) sourceCrs = 'EPSG:27572';
          else if (/ETRS89.*LAEA/i.test(crs.name)) sourceCrs = 'EPSG:3035';
          else if (/UTM.*zone\s*31/i.test(crs.name)) sourceCrs = 'EPSG:32631';
          else if (/UTM.*zone\s*32/i.test(crs.name)) sourceCrs = 'EPSG:32632';
        }
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

// Encoding name → GeoJSON geometry type mapping
const ENCODING_TO_GEOJSON_TYPE: Record<string, string> = {
  point: 'Point',
  multipoint: 'MultiPoint',
  linestring: 'LineString',
  multilinestring: 'MultiLineString',
  polygon: 'Polygon',
  multipolygon: 'MultiPolygon'
};

/**
 * Extract GeoJSON from a native GeoArrow struct value (nested arrays of {x, y}).
 * Works without DuckDB's ::GEOMETRY cast.
 */
function nativeGeoArrowToGeoJSON(
  value: unknown,
  encoding: string,
  sourceCrs: string
): string {
  const geojsonType =
    ENCODING_TO_GEOJSON_TYPE[encoding.toLowerCase()] ?? 'MultiPolygon';
  const coordinates = extractAndReprojectCoords(value, sourceCrs);
  return JSON.stringify({ type: geojsonType, coordinates });
}

function extractAndReprojectCoords(value: unknown, sourceCrs: string): unknown {
  if (value === null || value === undefined) return [];

  // Primitive number — not a coordinate pair, skip
  if (typeof value !== 'object') return [];

  // JS Array — recurse into each element
  if (Array.isArray(value)) {
    return value.map((child) => extractAndReprojectCoords(child, sourceCrs));
  }

  // At this point, value is a non-null object. It's either:
  // - An Arrow Vector (list) — has .length, .get(index), .toJSON() → returns Array
  // - An Arrow StructRowProxy (point) — has .toJSON() → returns {x, y}
  // Both have .toJSON() and .get(), so we distinguish by checking what toJSON() returns:
  // Vectors return an Array, StructRowProxy returns a plain object.
  const obj = value as Record<string, unknown>;

  if (typeof obj.toJSON === 'function') {
    const plain = (obj.toJSON as () => unknown)();

    // Arrow Vector: toJSON() returns an array → recurse into it
    if (Array.isArray(plain)) {
      return plain.map((child: unknown) =>
        extractAndReprojectCoords(child, sourceCrs)
      );
    }

    // Arrow StructRowProxy: toJSON() returns a plain object {x, y}
    if (plain && typeof plain === 'object') {
      const pt = plain as Record<string, unknown>;
      const x = Number(pt.x ?? pt.X ?? 0);
      const y = Number(pt.y ?? pt.Y ?? 0);
      const result = reprojectPoint(x, y, sourceCrs);
      if (result.success && result.coordinates) {
        return [result.coordinates[0], result.coordinates[1]];
      }
      return [x, y];
    }
  }

  // Arrow Vector-like (list): has .get(index) and .length but no toJSON
  if ('length' in obj && typeof obj.get === 'function') {
    const vec = obj as unknown as {
      length: number;
      get: (i: number) => unknown;
    };
    const arr: unknown[] = [];
    for (let i = 0; i < vec.length; i++) {
      arr.push(extractAndReprojectCoords(vec.get(i), sourceCrs));
    }
    return arr;
  }

  // Plain object with x,y properties (fallback)
  if ('x' in obj && 'y' in obj) {
    const x = Number(obj.x ?? 0);
    const y = Number(obj.y ?? 0);
    const result = reprojectPoint(x, y, sourceCrs);
    if (result.success && result.coordinates) {
      return [result.coordinates[0], result.coordinates[1]];
    }
    return [x, y];
  }

  return [];
}

async function reprojectParquetWithProj4(
  escapedFileId: string,
  geomCol: string,
  sourceCrs: string,
  sanitizedName: string,
  encoding: string,
  bbox?: [number, number, number, number]
): Promise<ArrowTable> {
  const escapedGeomCol = escapeIdentifier(geomCol);

  // 1. Read raw parquet — native GeoArrow structs, no ::GEOMETRY cast
  const rawResult = await Duck.query(
    `SELECT * FROM read_parquet('${escapedFileId}')`,
    { format: 'arrow-ipc' }
  );
  const rawTable = tableFromIPC(rawResult as Uint8Array);
  const geomVector = rawTable.getChild(geomCol);
  if (!geomVector) throw new Error(`Geometry column '${geomCol}' not found`);

  // 2. Read non-geom columns as JSON for temp table reconstruction
  const nonGeomCols = rawTable.schema.fields
    .filter((f) => f.name !== geomCol)
    .map((f) => f.name);

  // 3. Extract + reproject each geometry from native GeoArrow structs
  const geojsonStrings: string[] = [];
  for (let i = 0; i < rawTable.numRows; i++) {
    const val = geomVector.get(i);
    const gjStr = nativeGeoArrowToGeoJSON(val, encoding, sourceCrs);
    if (i === 0) {
      logger.info('First reprojected GeoJSON sample', LogCategory.MAP, {
        length: gjStr.length,
        preview: gjStr.substring(0, 500)
      });
    }
    geojsonStrings.push(gjStr);
  }

  // 4. Rebuild via DuckDB temp table with VARCHAR geometry (GeoJSON strings)
  const tempTable = `__reproj_${sanitizedName}_${Date.now()}`;
  const escapedTempTable = escapeIdentifier(tempTable);

  // Read non-geom data as JSON
  const nonGeomExclude =
    nonGeomCols.length > 0
      ? `SELECT ${nonGeomCols.map((c) => `"${escapeIdentifier(c)}"`).join(', ')} FROM read_parquet('${escapedFileId}')`
      : `SELECT 1 as __dummy FROM read_parquet('${escapedFileId}')`;

  await Duck.query(
    `CREATE TEMP TABLE "${escapedTempTable}" AS ${nonGeomExclude}`,
    { format: 'arrow-ipc' }
  );

  // Add GeoJSON column
  await Duck.query(
    `ALTER TABLE "${escapedTempTable}" ADD COLUMN "${escapedGeomCol}" VARCHAR`,
    { format: 'arrow-ipc' }
  );

  // Update geometry column in batches using rowid
  const BATCH_SIZE = 500;
  for (let i = 0; i < geojsonStrings.length; i += BATCH_SIZE) {
    const cases = [];
    for (let j = i; j < Math.min(i + BATCH_SIZE, geojsonStrings.length); j++) {
      cases.push(`WHEN ${j} THEN '${escapeSqlString(geojsonStrings[j])}'`);
    }
    await Duck.query(
      `UPDATE "${escapedTempTable}" SET "${escapedGeomCol}" = CASE rowid ${cases.join(' ')} END WHERE rowid >= ${i} AND rowid < ${Math.min(i + BATCH_SIZE, geojsonStrings.length)}`,
      { format: 'arrow-ipc' }
    );
  }

  // 5. Read final table as Arrow IPC
  const result = await Duck.query(`SELECT * FROM "${escapedTempTable}"`, {
    format: 'arrow-ipc'
  });
  await Duck.query(`DROP TABLE IF EXISTS "${escapedTempTable}"`, {
    format: 'arrow-ipc'
  });

  let table = tableFromIPC(result as Uint8Array);
  table = addGeoJsonMetadata(table, bbox);
  return table;
}

export async function readGeoParquetViaDuckDB(
  arrayBuffer: ArrayBuffer,
  tableName: string,
  bbox?: [number, number, number, number]
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

    // Native GeoArrow encodings (point, polygon, etc.) use struct types that
    // DuckDB cannot cast to GEOMETRY. Skip DuckDB reprojection entirely
    // and go straight to client-side proj4 — saves ~200ms of failed queries.
    const isNativeGeoArrowEncoding =
      geoInfo.encoding &&
      geoInfo.encoding !== 'wkb' &&
      geoInfo.encoding !== 'WKB';

    if (!isNativeGeoArrowEncoding) {
      // WKB-encoded: try DuckDB reprojection (::GEOMETRY cast works for WKB)
      try {
        const result = await Duck.query(
          `SELECT * EXCLUDE ("${escapedGeomCol}"), ST_AsGeoJSON(ST_Transform("${escapedGeomCol}"::GEOMETRY, '${escapedSourceCrs}', 'EPSG:4326', true)) as "${escapedGeomCol}" FROM read_parquet('${escapedFileId}')`,
          { format: 'arrow-ipc' }
        );
        let table = tableFromIPC(result as Uint8Array);
        table = addGeoJsonMetadata(table, bbox);
        return table;
      } catch (err1) {
        logger.warn(
          'Reprojection via read_parquet failed, trying ST_Read',
          LogCategory.MAP,
          { error: err1 }
        );
      }
      try {
        const result = await Duck.query(
          `SELECT * EXCLUDE ("${escapedGeomCol}"), ST_AsGeoJSON(ST_Transform("${escapedGeomCol}", '${escapedSourceCrs}', 'EPSG:4326', true)) as "${escapedGeomCol}" FROM ST_Read('${escapedFileId}')`,
          { format: 'arrow-ipc' }
        );
        let table = tableFromIPC(result as Uint8Array);
        table = addGeoJsonMetadata(table, bbox);
        return table;
      } catch (err2) {
        logger.warn('Reprojection via ST_Read also failed', LogCategory.MAP, {
          error: err2
        });
      }
    }

    // Client-side reprojection with proj4.js
    // DuckDB WASM's spatial extension cannot reproject this CRS.
    // Read raw geometry as GeoJSON, reproject each coordinate with proj4, rebuild Arrow table.
    if (isProjectionSupported(geoInfo.sourceCrs)) {
      logger.info(
        `Falling back to client-side proj4 reprojection for ${geoInfo.sourceCrs}`,
        LogCategory.MAP
      );
      try {
        const reprojectedTable = await reprojectParquetWithProj4(
          escapedFileId,
          geomCol,
          geoInfo.sourceCrs,
          sanitizedName,
          geoInfo.encoding ?? 'multipolygon',
          bbox
        );
        logger.info(
          `Client-side proj4 reprojection succeeded (${reprojectedTable.numRows} features)`,
          LogCategory.MAP
        );
        return reprojectedTable;
      } catch (err3) {
        logger.warn(
          'Client-side proj4 reprojection failed, using raw coordinates',
          LogCategory.MAP,
          { error: err3 }
        );
      }
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
    wkbTable = addGeoJsonMetadata(wkbTable, bbox);
    return wkbTable;
  }

  const result = await Duck.query(
    `SELECT * FROM read_parquet('${escapedFileId}')`,
    { format: 'arrow-ipc' }
  );

  let table = tableFromIPC(result as Uint8Array);

  if (!table.schema.metadata.has(GeoArrowMetadataKey.GEO)) {
    table = addGeoArrowMetadata(table, geoInfo.encoding, bbox);
  }

  return table;
}
