import {
  GEOMETRY_COLUMN_TYPE,
  GEOMETRY_WKT_TYPES,
  hasGeometryType
} from '$lib/features/commons/constants/geometry.constants';
import type { GeoArrowMetadata } from '$lib/features/commons/types/geoarrow.types';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { ArrowExtension } from '$lib/features/map/constants/map.constants';
import { Field, Schema, Table, Type, tableFromIPC } from 'apache-arrow/Arrow';
import { SvelteMap } from 'svelte/reactivity';
import { DUCK_CONST, GEO_CONSTANTS } from '../constants';

/**
 * DuckDB >= 1.33 may return geometry column types like `GEOMETRY('EPSG:4326')`
 * instead of plain `GEOMETRY`. This helper matches both forms.
 */
function isGeometryColumnType(columnType: string): boolean {
  return (
    columnType === GEOMETRY_COLUMN_TYPE ||
    columnType.startsWith(GEOMETRY_COLUMN_TYPE + '(')
  );
}

export interface DuckDBClientForArrow {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  queryStreaming?(sql: string): Promise<Uint8Array>;
  describe_table(
    tableName: string
  ): Promise<{ name: string[]; type: string[] }>;
}

export interface YearFilterClause {
  column: string;
  value: number | string;
}

export function buildYearFilterWhereClause(
  filter: YearFilterClause | undefined
): string | null {
  if (!filter) return null;
  const value =
    typeof filter.value === 'number'
      ? filter.value
      : `'${String(filter.value).replace(/'/g, "''")}'`;
  return `"${filter.column}" = ${value}`;
}

/**
 * Fetch an Arrow table from DuckDB with geometry converted to WKB.
 * DuckDB WASM < 1.33 returns geometry as an opaque blob — ST_AsWKB() converts
 * it to standard WKB. When DuckDB >= 1.33 returns geoarrow.wkb natively,
 * the ST_AsWKB() call is a no-op.
 */
export async function fetchArrowTableWithGeometry(
  tableName: string,
  Duck: DuckDBClientForArrow,
  whereClause?: string | null
): Promise<Table> {
  const tableInfo = await Duck.describe_table(tableName);
  const columns = tableInfo.name.map((name: string, index: number) => ({
    column_name: name,
    column_type: tableInfo.type[index]
  }));

  const geomColumn = columns.find((c: { column_type: string }) =>
    isGeometryColumnType(c.column_type)
  );

  let query: string;
  if (geomColumn) {
    query = `SELECT * EXCLUDE ("${geomColumn.column_name}"), ST_AsWKB("${geomColumn.column_name}") AS "${geomColumn.column_name}" FROM "${tableName}"`;
  } else {
    query = `SELECT * FROM "${tableName}"`;
  }

  if (whereClause) {
    query += ` WHERE ${whereClause}`;
  }

  // Use streaming when available — reduces peak WASM memory for large tables.
  // Fallback to regular query() if streaming returns 0 rows (race condition
  // in DuckDB WASM's useUnsafe API under concurrent query load).
  let ipcBuffer: Uint8Array;

  if (Duck.queryStreaming) {
    ipcBuffer = await Duck.queryStreaming(query);
    const streamTable = tableFromIPC(ipcBuffer);
    if (streamTable.numRows > 0 || whereClause) {
      // Guard: DuckDB streaming may emit a 0-row schema header as the first batch.
      // geoarrow-deck-stream only reads data[0] — an empty first batch causes
      // children[0] to be undefined. Fall back to regular query which returns a
      // single contiguous batch.
      const firstBatchEmpty =
        streamTable.batches.length > 0 && streamTable.batches[0].numRows === 0;
      if (!firstBatchEmpty) {
        return streamTable;
      }
      logger.debug(
        'queryStreaming first batch is empty (schema header), retrying with regular query',
        LogCategory.DUCKDB,
        { tableName }
      );
    } else {
      // Streaming returned schema-only (0 rows) — retry with regular query
      logger.debug(
        'queryStreaming returned 0 rows, retrying with regular query',
        LogCategory.DUCKDB,
        { tableName, ipcBufferBytes: ipcBuffer.byteLength }
      );
    }
  }

  const buffer = (await Duck.query(query, {
    format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
  })) as ArrayBuffer | Uint8Array;
  ipcBuffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  return tableFromIPC(ipcBuffer);
}

export async function addGeoArrowMetadataFromDuckDB(
  table: Table,
  tableName: string,
  Duck: DuckDBClientForArrow,
  cachedGeoArrowMetadata?: GeoArrowMetadata
): Promise<Table> {
  try {
    let geomColumn: { column_name: string; column_type: string } | undefined;
    let geometryType: string;

    if (cachedGeoArrowMetadata) {
      const primaryColumn = cachedGeoArrowMetadata.primary_column;
      geomColumn = {
        column_name: primaryColumn,
        column_type: GEOMETRY_COLUMN_TYPE
      };
      const columnMeta = cachedGeoArrowMetadata.columns[primaryColumn];
      geometryType = columnMeta?.geometry_types?.[0] || GEOMETRY_COLUMN_TYPE;
      if (!geometryType.startsWith('ST_')) {
        geometryType = 'ST_' + geometryType;
      }

      logger.debug('Using cached geometry metadata', LogCategory.DUCKDB, {
        tableName,
        geometryType
      });
    } else {
      const tableInfo = await Duck.describe_table(tableName);
      const columns = tableInfo.name.map((name: string, index: number) => ({
        column_name: name,
        column_type: tableInfo.type[index]
      }));

      geomColumn = columns.find((c: { column_type: string }) =>
        isGeometryColumnType(c.column_type)
      );

      if (!geomColumn) {
        logger.warn(
          'No geometry column found in DuckDB table',
          LogCategory.DUCKDB,
          { tableName }
        );
        return table;
      }

      const geomTypeResult = (await Duck.query(
        `SELECT DISTINCT ST_GeometryType("${geomColumn.column_name}") as geom_type
         FROM "${tableName}"
         WHERE "${geomColumn.column_name}" IS NOT NULL`,
        { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
      )) as Array<{ geom_type: string }>;

      const types = geomTypeResult.map((r) => r.geom_type);

      if (types.length === 0) {
        geometryType = GEOMETRY_COLUMN_TYPE;
      } else if (types.length === 1) {
        geometryType = types[0];
      } else {
        const hasPoint = hasGeometryType(types, 'POINT');
        const hasMultiPoint = hasGeometryType(types, 'MULTI_POINT');
        const hasLineString = hasGeometryType(types, 'LINE_STRING');
        const hasMultiLineString = hasGeometryType(types, 'MULTI_LINE_STRING');
        const hasPolygon = hasGeometryType(types, 'POLYGON');
        const hasMultiPolygon = hasGeometryType(types, 'MULTI_POLYGON');

        if (hasPolygon || hasMultiPolygon) {
          geometryType = GEOMETRY_WKT_TYPES.MULTI_POLYGON;
        } else if (hasLineString || hasMultiLineString) {
          geometryType = GEOMETRY_WKT_TYPES.MULTI_LINE_STRING;
        } else if (hasPoint || hasMultiPoint) {
          geometryType = GEOMETRY_WKT_TYPES.MULTI_POINT;
        } else {
          geometryType = GEOMETRY_COLUMN_TYPE;
        }

        logger.info(
          'Mixed geometry types detected, normalized to Multi* variant',
          LogCategory.DUCKDB,
          {
            tableName,
            detectedTypes: types.join(', '),
            normalizedType: geometryType
          }
        );
      }
    }

    const geomColumnIndex = table.schema.fields.findIndex(
      (f) => f.name === geomColumn!.column_name
    );
    const isGeoJsonString =
      geomColumnIndex !== -1 &&
      table.schema.fields[geomColumnIndex].typeId === Type.Utf8;

    // Check if DuckDB already set a geoarrow extension on the field
    const existingExtension =
      geomColumnIndex !== -1
        ? table.schema.fields[geomColumnIndex].metadata?.get(
            'ARROW:extension:name'
          )
        : undefined;

    // ST_AsWKB() output is standard WKB binary — label it as geoarrow.wkb
    // so the layer factory routes it through geoarrow-deck-stream (binary GPU
    // path) instead of the slow GeoJSON fallback. The data is identical to
    // ogc.wkb; geoarrow.wkb is the modern GeoArrow spec name.
    const encoding = isGeoJsonString
      ? ArrowExtension.GEOJSON
      : ArrowExtension.GEOARROW_WKB;

    const geoMetadata = {
      version: '1.0.0',
      primary_column: geomColumn!.column_name,
      columns: {
        [geomColumn!.column_name]: {
          encoding,
          geometry_types: [geometryType.replace('ST_', '')],
          crs: {
            type: 'name',
            properties: {
              name: GEO_CONSTANTS.WGS84_CRS
            }
          },
          bbox: [-180, -90, 180, 90]
        }
      }
    };

    const schema = table.schema;
    if (!schema) {
      logger.warn(
        'Arrow table missing schema, cannot add GeoArrow metadata',
        LogCategory.DUCKDB,
        { tableName }
      );
      return table;
    }

    const newMetadata = schema.metadata
      ? new SvelteMap(schema.metadata)
      : new SvelteMap<string, string>();
    newMetadata.set('geo', JSON.stringify(geoMetadata));

    const updatedFields = (schema.fields ?? []).map((field) => {
      if (field.name !== geomColumn!.column_name) {
        return field;
      }
      const updatedMetadata = field.metadata
        ? new SvelteMap(field.metadata)
        : new SvelteMap<string, string>();
      updatedMetadata.set('ARROW:extension:name', encoding);
      updatedMetadata.set(
        'ARROW:extension:metadata',
        JSON.stringify({
          geometry_type: geometryType.replace('ST_', ''),
          crs: GEO_CONSTANTS.WGS84_CRS
        })
      );
      const fieldMetadataMap = new Map<string, string>(updatedMetadata);
      return new Field(
        field.name,
        field.type,
        field.nullable,
        fieldMetadataMap
      );
    });

    const metadataMap = new Map<string, string>(newMetadata);

    const newSchema = new Schema(updatedFields, metadataMap);

    const tableWithMetadata = new Table(newSchema, table.batches);

    logger.debug('Added GeoArrow metadata to Arrow table', LogCategory.DUCKDB, {
      tableName,
      geometryType,
      encoding,
      hasSchemaMetadata: !!tableWithMetadata.schema.metadata,
      geoFieldMetadata: updatedFields.find(
        (f) => f.name === geomColumn!.column_name
      )?.metadata
    });

    return tableWithMetadata;
  } catch (error) {
    logger.error(
      'Failed to add GeoArrow metadata from DuckDB',
      LogCategory.DUCKDB,
      error
    );
    return table;
  }
}

export async function createArrowTableWithMetadata(
  tableName: string,
  Duck: DuckDBClientForArrow,
  extractMetadata: (table: Table) => GeoArrowMetadata | null
): Promise<{
  arrowTableWithMetadata: Table;
  geoArrowMetadata: GeoArrowMetadata | null;
}> {
  const arrowTable = await fetchArrowTableWithGeometry(tableName, Duck);
  const arrowTableWithMetadata = await addGeoArrowMetadataFromDuckDB(
    arrowTable,
    tableName,
    Duck
  );
  const geoArrowMetadata = extractMetadata(arrowTableWithMetadata);
  if (!geoArrowMetadata) {
    logger.warn(
      'GeoArrow metadata missing after conversion',
      LogCategory.DUCKDB,
      {
        tableName
      }
    );
  }
  return { arrowTableWithMetadata, geoArrowMetadata };
}

export async function getArrowTableWithCache(
  tableName: string,
  Duck: DuckDBClientForArrow,
  extractMetadata: (table: Table) => GeoArrowMetadata | null,
  getCachedTable: () => Table | undefined,
  setCache: (table: Table, metadata: GeoArrowMetadata | null) => void
): Promise<Table> {
  const cached = getCachedTable();
  if (cached) {
    return cached;
  }

  const { arrowTableWithMetadata, geoArrowMetadata } =
    await createArrowTableWithMetadata(tableName, Duck, extractMetadata);

  setCache(arrowTableWithMetadata, geoArrowMetadata);

  return arrowTableWithMetadata;
}

export async function getArrowTableDirect(
  tableName: string,
  Duck: DuckDBClientForArrow,
  getCachedTable: () => Table | undefined,
  setCache: (table: Table) => void,
  whereClause?: string | null
): Promise<Table> {
  if (whereClause) {
    const baseTable = await fetchArrowTableWithGeometry(
      tableName,
      Duck,
      whereClause
    );
    const tableWithMetadata = await addGeoArrowMetadataFromDuckDB(
      baseTable,
      tableName,
      Duck
    );
    logger.info(
      'Created filtered Arrow table with metadata',
      LogCategory.DUCKDB,
      {
        tableName,
        whereClause
      }
    );
    return tableWithMetadata;
  }

  const cached = getCachedTable();
  if (cached) {
    logger.debug('Using cached Arrow table with metadata', LogCategory.DUCKDB, {
      tableName
    });
    return cached;
  }

  const baseTable = await fetchArrowTableWithGeometry(tableName, Duck);
  const tableWithMetadata = await addGeoArrowMetadataFromDuckDB(
    baseTable,
    tableName,
    Duck
  );

  setCache(tableWithMetadata);
  logger.info('Cached Arrow table with metadata', LogCategory.DUCKDB, {
    tableName
  });

  return tableWithMetadata;
}
