import {
  GEOMETRY_COLUMN_TYPE,
  GEOMETRY_WKT_TYPES,
  hasGeometryType
} from '$lib/features/commons/constants/geometry.constants';
import {
  isGeometryColumnType,
  normalizeCrsName,
  extractGeometryColumnCrs
} from '$lib/features/data-pipeline/operations/geometry';
import type { GeoArrowMetadata } from '$lib/features/commons/types/geoarrow.types';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  ArrowExtension,
  GeometryType
} from '$lib/features/map/constants/map.constants';
import { Field, Schema, Table, Type, tableFromIPC } from 'apache-arrow/Arrow';
// Plain Map — metadata is non-reactive data processing (no need for SvelteMap proxy)
import { DUCK_CONST, GEO_CONSTANTS } from '../constants';

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function getGeoArrowCrsName(
  metadata: GeoArrowMetadata | null | undefined,
  primaryColumn: string
): string | null {
  const crs = metadata?.columns?.[primaryColumn]?.crs;
  if (!crs) {
    return null;
  }

  if (crs.id?.authority && typeof crs.id.code === 'number') {
    return `${crs.id.authority}:${crs.id.code}`;
  }

  return normalizeCrsName(crs.name) ?? null;
}

function buildGeoArrowCrs(
  crsName: string | null | undefined
): GeoArrowMetadata['columns'][string]['crs'] | undefined {
  const normalized = normalizeCrsName(crsName);
  if (!normalized) {
    return undefined;
  }

  const epsgMatch = normalized.match(/^EPSG:(\d+)$/i);
  if (epsgMatch) {
    return {
      name: normalized,
      id: { authority: 'EPSG', code: Number(epsgMatch[1]) }
    };
  }

  return { name: normalized };
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

interface GeoArrowMetadataOverrides {
  geometryType?: string;
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
 * Fetch an Arrow table from DuckDB, preserving native geometry export.
 * DuckDB WASM >= 1.33 can export GEOMETRY columns directly through Arrow IPC,
 * so we only rewrite the geometry column when a reprojection is requested.
 */
/** Column info returned by fetchArrowTableWithGeometry for downstream reuse. */
export interface GeomColumnInfo {
  column_name: string;
  column_type: string;
}

async function executeArrowIpcQuery(
  Duck: DuckDBClientForArrow,
  query: string,
  tableName: string
): Promise<Table> {
  // Use streaming when available — reduces peak WASM memory for large tables.
  // Fallback to regular query() if streaming returns 0 rows (race condition
  // in DuckDB WASM's useUnsafe API under concurrent query load).
  let ipcBuffer: Uint8Array;

  if (Duck.queryStreaming) {
    ipcBuffer = await Duck.queryStreaming(query);
    const streamTable = tableFromIPC(ipcBuffer);
    if (streamTable.numRows > 0) {
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

function getRepresentativePointExpression(
  geometryColumnName: string,
  geometryType: string
): string | null {
  const escapedGeometryColumn = `"${geometryColumnName}"`;

  switch (geometryType) {
    case GeometryType.POLYGON:
    case GeometryType.MULTIPOLYGON:
      return `CASE
        WHEN ST_IsEmpty(${escapedGeometryColumn}) THEN NULL
        WHEN NOT ST_IsValid(${escapedGeometryColumn}) THEN ST_PointOnSurface(${escapedGeometryColumn})
        ELSE COALESCE(
          ST_MaximumInscribedCircle(${escapedGeometryColumn}).center,
          ST_PointOnSurface(${escapedGeometryColumn})
        )
      END`;
    case GeometryType.LINESTRING:
    case GeometryType.MULTILINESTRING:
    case GeometryType.POINT:
    case GeometryType.MULTIPOINT:
      return `CASE
        WHEN ST_IsEmpty(${escapedGeometryColumn}) THEN NULL
        ELSE ST_PointOnSurface(${escapedGeometryColumn})
      END`;
    default:
      return null;
  }
}

export async function fetchArrowTableWithGeometry(
  tableName: string,
  Duck: DuckDBClientForArrow,
  whereClause?: string | null,
  targetCrs?: string | null,
  projectColumns?: readonly string[] | null
): Promise<{ table: Table; geomColumn: GeomColumnInfo | undefined }> {
  const tableInfo = await Duck.describe_table(tableName);
  const columns = tableInfo.name.map((name: string, index: number) => ({
    column_name: name,
    column_type: tableInfo.type[index]
  }));

  const geomColumn = columns.find((c: { column_type: string }) =>
    isGeometryColumnType(c.column_type)
  );

  const normalizedTargetCrs = normalizeCrsName(targetCrs);
  const projectedColumnNames = projectColumns
    ? projectColumns.filter((name) =>
        columns.some((c) => c.column_name === name)
      )
    : null;

  const geometryProjection =
    geomColumn && normalizedTargetCrs
      ? `ST_Transform("${geomColumn.column_name}", '${escapeSqlLiteral(
          normalizedTargetCrs
        )}') AS "${geomColumn.column_name}"`
      : geomColumn
        ? `"${geomColumn.column_name}"`
        : null;

  let query: string;
  if (projectedColumnNames && projectedColumnNames.length > 0) {
    const columnExpressions = projectedColumnNames.map((name) => `"${name}"`);
    if (geometryProjection) {
      columnExpressions.push(geometryProjection);
    }
    query = `SELECT ${columnExpressions.join(', ')} FROM "${tableName}"`;
  } else if (geomColumn && normalizedTargetCrs) {
    query = `SELECT * EXCLUDE ("${geomColumn.column_name}"), ${geometryProjection} FROM "${tableName}"`;
  } else {
    query = `SELECT * FROM "${tableName}"`;
  }

  if (whereClause) {
    query += ` WHERE ${whereClause}`;
  }

  const baseTable = await executeArrowIpcQuery(Duck, query, tableName);
  return {
    table: baseTable,
    geomColumn:
      normalizedTargetCrs && geomColumn
        ? {
            ...geomColumn,
            column_type: `${GEOMETRY_COLUMN_TYPE}('${normalizedTargetCrs}')`
          }
        : geomColumn
  };
}

export async function fetchArrowRepresentativePointTable(
  tableName: string,
  geometryType: string,
  Duck: DuckDBClientForArrow,
  whereClause?: string | null
): Promise<{ table: Table; geomColumn: GeomColumnInfo | undefined }> {
  const tableInfo = await Duck.describe_table(tableName);
  const columns = tableInfo.name.map((name: string, index: number) => ({
    column_name: name,
    column_type: tableInfo.type[index]
  }));

  const geomColumn = columns.find((c: { column_type: string }) =>
    isGeometryColumnType(c.column_type)
  );

  if (!geomColumn) {
    const query = whereClause
      ? `SELECT * FROM "${tableName}" WHERE ${whereClause}`
      : `SELECT * FROM "${tableName}"`;
    return {
      table: await executeArrowIpcQuery(Duck, query, tableName),
      geomColumn: undefined
    };
  }

  const pointExpression = getRepresentativePointExpression(
    geomColumn.column_name,
    geometryType
  );

  if (!pointExpression) {
    return fetchArrowTableWithGeometry(tableName, Duck, whereClause);
  }

  let query = `SELECT * REPLACE (
    CASE
      WHEN "${geomColumn.column_name}" IS NULL THEN NULL
      ELSE ${pointExpression}
    END AS "${geomColumn.column_name}"
  ) FROM "${tableName}"`;

  if (whereClause) {
    query += ` WHERE ${whereClause}`;
  }

  const geometryCrs = extractGeometryColumnCrs(geomColumn.column_type);
  return {
    table: await executeArrowIpcQuery(Duck, query, tableName),
    geomColumn: {
      ...geomColumn,
      column_type: geometryCrs
        ? `${GEOMETRY_COLUMN_TYPE}('${geometryCrs}')`
        : GEOMETRY_COLUMN_TYPE
    }
  };
}

export async function addGeoArrowMetadataFromDuckDB(
  table: Table,
  tableName: string,
  Duck: DuckDBClientForArrow,
  cachedGeoArrowMetadata?: GeoArrowMetadata,
  /** Pre-fetched geometry column info from fetchArrowTableWithGeometry — avoids redundant describe_table() call */
  prefetchedGeomColumn?: GeomColumnInfo,
  overrides?: GeoArrowMetadataOverrides
): Promise<Table> {
  try {
    let geomColumn: { column_name: string; column_type: string } | undefined;
    let geometryType: string;
    let geometryCrs: string | null = null;

    if (cachedGeoArrowMetadata) {
      const primaryColumn = cachedGeoArrowMetadata.primary_column;
      geomColumn = {
        column_name: primaryColumn,
        column_type: GEOMETRY_COLUMN_TYPE
      };
      const columnMeta = cachedGeoArrowMetadata.columns[primaryColumn];
      geometryType = columnMeta?.geometry_types?.[0] || GEOMETRY_COLUMN_TYPE;
      geometryCrs = getGeoArrowCrsName(cachedGeoArrowMetadata, primaryColumn);
      if (!geometryType.startsWith('ST_')) {
        geometryType = 'ST_' + geometryType;
      }

      logger.debug('Using cached geometry metadata', LogCategory.DUCKDB, {
        tableName,
        geometryType
      });
    } else {
      // Resolve geometry column: reuse pre-fetched info or call describe_table()
      if (prefetchedGeomColumn) {
        geomColumn = prefetchedGeomColumn;
      } else {
        const tableInfo = await Duck.describe_table(tableName);
        const columns = tableInfo.name.map((name: string, index: number) => ({
          column_name: name,
          column_type: tableInfo.type[index]
        }));

        geomColumn = columns.find((c: { column_type: string }) =>
          isGeometryColumnType(c.column_type)
        );
      }

      if (!geomColumn) {
        logger.warn(
          'No geometry column found in DuckDB table',
          LogCategory.DUCKDB,
          { tableName }
        );
        return table;
      }

      geometryCrs = extractGeometryColumnCrs(geomColumn.column_type) ?? null;

      if (overrides?.geometryType) {
        geometryType = overrides.geometryType;
      } else {
        // Sample geometry types from first 1000 non-null rows instead of full table scan.
        // DISTINCT on the full table is O(n) and expensive for large datasets.
        // 1000 rows is sufficient to detect mixed types (Point + MultiPoint, etc.).
        const geomTypeResult = (await Duck.query(
          `SELECT DISTINCT geom_type FROM (
             SELECT ST_GeometryType("${geomColumn.column_name}") as geom_type
             FROM "${tableName}"
             WHERE "${geomColumn.column_name}" IS NOT NULL
             LIMIT 1000
           )`,
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
          const hasMultiLineString = hasGeometryType(
            types,
            'MULTI_LINE_STRING'
          );
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
    }

    const geomColumnIndex = table.schema.fields.findIndex(
      (f) => f.name === geomColumn!.column_name
    );
    const isGeoJsonString =
      geomColumnIndex !== -1 &&
      table.schema.fields[geomColumnIndex].typeId === Type.Utf8;

    // Normalize DuckDB geometry export to geoarrow.wkb so the layer factory
    // always stays on the binary geoarrow-deck-stream path.
    const encoding = isGeoJsonString
      ? ArrowExtension.GEOJSON
      : ArrowExtension.GEOARROW_WKB;
    const resolvedGeometryCrs =
      geometryCrs ?? normalizeCrsName(GEO_CONSTANTS.WGS84_CRS);
    const geoArrowCrs = buildGeoArrowCrs(resolvedGeometryCrs);

    const geoMetadata = {
      version: '1.0.0',
      primary_column: geomColumn!.column_name,
      columns: {
        [geomColumn!.column_name]: {
          encoding,
          geometry_types: [geometryType.replace('ST_', '')],
          ...(geoArrowCrs ? { crs: geoArrowCrs } : {}),
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
      ? new Map(schema.metadata)
      : new Map<string, string>();
    newMetadata.set('geo', JSON.stringify(geoMetadata));

    const updatedFields = (schema.fields ?? []).map((field) => {
      if (field.name !== geomColumn!.column_name) {
        return field;
      }
      const updatedMetadata = field.metadata
        ? new Map(field.metadata)
        : new Map<string, string>();
      updatedMetadata.set('ARROW:extension:name', encoding);
      updatedMetadata.set(
        'ARROW:extension:metadata',
        JSON.stringify({
          geometry_type: geometryType.replace('ST_', ''),
          crs: resolvedGeometryCrs
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
  const { table: arrowTable, geomColumn } = await fetchArrowTableWithGeometry(
    tableName,
    Duck
  );
  const arrowTableWithMetadata = await addGeoArrowMetadataFromDuckDB(
    arrowTable,
    tableName,
    Duck,
    undefined,
    geomColumn
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
    const { table: baseTable, geomColumn } = await fetchArrowTableWithGeometry(
      tableName,
      Duck,
      whereClause
    );
    const tableWithMetadata = await addGeoArrowMetadataFromDuckDB(
      baseTable,
      tableName,
      Duck,
      undefined,
      geomColumn
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

  const { table: baseTable, geomColumn } = await fetchArrowTableWithGeometry(
    tableName,
    Duck
  );
  const tableWithMetadata = await addGeoArrowMetadataFromDuckDB(
    baseTable,
    tableName,
    Duck,
    undefined,
    geomColumn
  );

  setCache(tableWithMetadata);
  logger.info('Cached Arrow table with metadata', LogCategory.DUCKDB, {
    tableName
  });

  return tableWithMetadata;
}

export async function getArrowTableReprojected(
  tableName: string,
  Duck: DuckDBClientForArrow,
  targetCrs: string
): Promise<Table> {
  const { table: baseTable, geomColumn } = await fetchArrowTableWithGeometry(
    tableName,
    Duck,
    null,
    targetCrs
  );

  return addGeoArrowMetadataFromDuckDB(
    baseTable,
    tableName,
    Duck,
    undefined,
    geomColumn
  );
}

export async function getRepresentativePointArrowTable(
  tableName: string,
  geometryType: string,
  Duck: DuckDBClientForArrow,
  whereClause?: string | null
): Promise<Table> {
  const { table: baseTable, geomColumn } =
    await fetchArrowRepresentativePointTable(
      tableName,
      geometryType,
      Duck,
      whereClause
    );

  return addGeoArrowMetadataFromDuckDB(
    baseTable,
    tableName,
    Duck,
    undefined,
    geomColumn,
    { geometryType: GEOMETRY_WKT_TYPES.POINT }
  );
}
