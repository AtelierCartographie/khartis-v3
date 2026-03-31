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

  // Check if the field already has extension metadata from DuckDB.
  const existingExtension = geomColumn.metadata?.get(
    GeoArrowMetadataKey.EXTENSION_NAME
  );

  // Resolve encoding: use existing metadata, map from geoParquetEncoding,
  // or detect native GeoArrow struct type from the Arrow schema.
  let arrowExtension: string;
  let geometryTypes: string[];

  if (existingExtension) {
    arrowExtension = existingExtension;
    geometryTypes = getGeometryTypesForEncoding(
      existingExtension.replace('geoarrow.', '')
    );
  } else if (geoParquetEncoding) {
    const mapped =
      GEOPARQUET_ENCODING_TO_ARROW[geoParquetEncoding.toLowerCase()];
    if (mapped) {
      arrowExtension = mapped;
      geometryTypes = getGeometryTypesForEncoding(geoParquetEncoding);
    } else {
      arrowExtension = ArrowExtension.OGC_WKB;
      geometryTypes = [GEOJSON_TYPE.POLYGON, GEOJSON_TYPE.MULTI_POLYGON];
    }
  } else {
    // Try detecting native GeoArrow struct from Arrow type hierarchy
    const detected = detectNativeGeoArrowFromType(geomColumn);
    if (detected) {
      arrowExtension = detected;
      geometryTypes = getGeometryTypesForEncoding(
        detected.replace('geoarrow.', '')
      );
    } else {
      arrowExtension = ArrowExtension.OGC_WKB;
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
      if (!fieldMetadata.has(GeoArrowMetadataKey.EXTENSION_NAME)) {
        fieldMetadata.set(GeoArrowMetadataKey.EXTENSION_NAME, arrowExtension);
      }
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
  return new Table(newSchema, table.batches);
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

/**
 * Read a GeoParquet file via DuckDB and return an Arrow table with GeoArrow metadata.
 *
 * With DuckDB WASM >= 1.33, read_parquet() returns geometry as geoarrow.wkb natively.
 * geoarrow-deck-stream auto-detects and decodes WKB transparently.
 */
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
  // With DuckDB >= 1.33, geometry from read_parquet() is geoarrow.wkb which can be
  // cast to GEOMETRY for ST_Transform.
  if (geoInfo.isProjectedCRS && geoInfo.sourceCrs) {
    const geomCol = geoInfo.primaryColumn;
    const escapedGeomCol = escapeIdentifier(geomCol);
    const escapedSourceCrs = escapeSqlString(geoInfo.sourceCrs);
    logger.info(
      `Reprojecting parquet geometry from ${geoInfo.sourceCrs} to EPSG:4326`,
      LogCategory.MAP,
      { sourceCrs: geoInfo.sourceCrs, geomCol }
    );

    // Try DuckDB reprojection via ST_Transform
    try {
      const result = await Duck.query(
        `SELECT * EXCLUDE ("${escapedGeomCol}"),
                ST_AsWKB(ST_Transform("${escapedGeomCol}"::GEOMETRY, '${escapedSourceCrs}', 'EPSG:4326', true)) as "${escapedGeomCol}"
         FROM read_parquet('${escapedFileId}')`,
        { format: 'arrow-ipc' }
      );
      let table = tableFromIPC(result as Uint8Array);
      table = addGeoArrowMetadata(table, geoInfo.encoding, bbox);
      return table;
    } catch (err1) {
      logger.warn(
        'ST_Transform via read_parquet failed, trying ST_Read',
        LogCategory.MAP,
        { error: err1 }
      );
    }

    // Fallback: ST_Read path
    try {
      const result = await Duck.query(
        `SELECT * EXCLUDE ("${escapedGeomCol}"),
                ST_AsWKB(ST_Transform("${escapedGeomCol}", '${escapedSourceCrs}', 'EPSG:4326', true)) as "${escapedGeomCol}"
         FROM ST_Read('${escapedFileId}')`,
        { format: 'arrow-ipc' }
      );
      let table = tableFromIPC(result as Uint8Array);
      table = addGeoArrowMetadata(table, geoInfo.encoding, bbox);
      return table;
    } catch (err2) {
      logger.warn('ST_Transform via ST_Read also failed', LogCategory.MAP, {
        error: err2
      });
    }

    // Client-side proj4 fallback for unsupported CRS
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

  // Default path: read raw parquet (WGS84).
  // With enable_geoparquet_conversion=false (workaround for duckdb/duckdb-wasm#2199),
  // geometry stays as native GeoArrow structs which geoarrow-deck-stream handles.
  // Rename geom column to "geometry" for geoarrow-deck-stream compatibility.
  const geomColName = geoInfo.primaryColumn;
  const needsRename =
    geomColName !== 'geometry' && geomColName !== 'wkb_geometry';
  const sql = needsRename
    ? `SELECT * EXCLUDE ("${escapeIdentifier(geomColName)}"), "${escapeIdentifier(geomColName)}" AS geometry FROM read_parquet('${escapedFileId}')`
    : `SELECT * FROM read_parquet('${escapedFileId}')`;

  const result = await Duck.query(sql, { format: 'arrow-ipc' });

  let table = tableFromIPC(result as Uint8Array);

  table = addGeoArrowMetadata(table, geoInfo.encoding, bbox);

  return table;
}

/**
 * Simplified client-side reprojection fallback.
 * With DuckDB >= 1.33, geometry is geoarrow.wkb. We use ST_AsGeoJSON to extract
 * coordinates, reproject with proj4, and rebuild as GeoJSON strings.
 */
async function reprojectParquetWithProj4(
  escapedFileId: string,
  geomCol: string,
  sourceCrs: string,
  sanitizedName: string,
  bbox?: [number, number, number, number]
): Promise<ArrowTable> {
  const escapedGeomCol = escapeIdentifier(geomCol);

  // Read geometry as GeoJSON strings (DuckDB can convert geoarrow.wkb → GEOMETRY → GeoJSON)
  const rawResult = await Duck.query(
    `SELECT * EXCLUDE ("${escapedGeomCol}"),
            ST_AsGeoJSON("${escapedGeomCol}"::GEOMETRY) AS "${escapedGeomCol}"
     FROM read_parquet('${escapedFileId}')`,
    { format: 'arrow-ipc' }
  );
  const rawTable = tableFromIPC(rawResult as Uint8Array);
  const geomVector = rawTable.getChild(geomCol);
  if (!geomVector) throw new Error(`Geometry column '${geomCol}' not found`);

  // Reproject each GeoJSON geometry
  const geojsonStrings: string[] = [];
  for (let i = 0; i < rawTable.numRows; i++) {
    const gjStr = geomVector.get(i) as string;
    if (!gjStr) {
      geojsonStrings.push('null');
      continue;
    }
    const geojson = JSON.parse(gjStr);
    reprojectGeoJSONCoords(geojson.coordinates, sourceCrs);
    geojsonStrings.push(JSON.stringify(geojson));
  }

  // Rebuild via DuckDB temp table with VARCHAR geometry
  const tempTable = `__reproj_${sanitizedName}_${Date.now()}`;
  const escapedTempTable = escapeIdentifier(tempTable);

  const nonGeomCols = rawTable.schema.fields
    .filter((f) => f.name !== geomCol)
    .map((f) => f.name);

  const nonGeomExclude =
    nonGeomCols.length > 0
      ? `SELECT ${nonGeomCols.map((c) => `"${escapeIdentifier(c)}"`).join(', ')} FROM read_parquet('${escapedFileId}')`
      : `SELECT 1 as __dummy FROM read_parquet('${escapedFileId}')`;

  await Duck.query(
    `CREATE TEMP TABLE "${escapedTempTable}" AS ${nonGeomExclude}`,
    { format: 'arrow-ipc' }
  );

  await Duck.query(
    `ALTER TABLE "${escapedTempTable}" ADD COLUMN "${escapedGeomCol}" VARCHAR`,
    { format: 'arrow-ipc' }
  );

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

  const finalResult = await Duck.query(`SELECT * FROM "${escapedTempTable}"`, {
    format: 'arrow-ipc'
  });
  await Duck.query(`DROP TABLE IF EXISTS "${escapedTempTable}"`, {
    format: 'arrow-ipc'
  });

  let table = tableFromIPC(finalResult as Uint8Array);
  table = addGeoJsonMetadata(table, bbox);
  return table;
}

/**
 * Recursively reproject GeoJSON coordinates in-place using proj4.
 */
function reprojectGeoJSONCoords(coords: unknown, sourceCrs: string): void {
  if (!Array.isArray(coords)) return;

  // Check if this is a coordinate pair [x, y]
  if (
    coords.length >= 2 &&
    typeof coords[0] === 'number' &&
    typeof coords[1] === 'number'
  ) {
    const result = reprojectPoint(
      coords[0] as number,
      coords[1] as number,
      sourceCrs
    );
    if (result.success && result.coordinates) {
      coords[0] = result.coordinates[0];
      coords[1] = result.coordinates[1];
    }
    return;
  }

  // Otherwise recurse into nested arrays
  for (const child of coords) {
    reprojectGeoJSONCoords(child, sourceCrs);
  }
}
