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
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import {
  ArrowExtension,
  GeometryType
} from '$lib/features/map/constants/map.constants';
import {
  isProjectionSupported,
  reprojectPoint
} from '$lib/features/duckdb/io/reprojection';
import { tableFromArrays } from 'apache-arrow';
import { Field, Schema, Table, Type, tableFromIPC } from 'apache-arrow/Arrow';
import { DUCK_CONST, GEO_CONSTANTS } from '../constants';

let maximumInscribedCircleSupported = true;

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
  invalidateTableCache?(tableName: string): void;
  queryStreaming?(sql: string): Promise<Uint8Array>;
  describe_table(
    tableName: string
  ): Promise<{ name: string[]; type: string[] }>;
}

interface GeoArrowMetadataOverrides {
  geometryType?: string;
}

/** Column info returned by fetchArrowTableWithGeometry for downstream reuse. */
export interface GeomColumnInfo {
  column_name: string;
  column_type: string;
}

async function getTableColumns(
  tableName: string,
  Duck: DuckDBClientForArrow
): Promise<GeomColumnInfo[]> {
  const tableInfo = await Duck.describe_table(tableName);
  return tableInfo.name.map((name: string, index: number) => ({
    column_name: name,
    column_type: tableInfo.type[index]
  }));
}

function findGeometryColumn(
  columns: GeomColumnInfo[]
): GeomColumnInfo | undefined {
  return columns.find((column) => isGeometryColumnType(column.column_type));
}

async function resolveGeometryTypeForTable(
  tableName: string,
  geomColumnName: string,
  Duck: DuckDBClientForArrow
): Promise<string> {
  const escapedTable = escapeIdentifier(tableName);
  const escapedGeometryColumn = escapeIdentifier(geomColumnName);
  const geomTypeResult = (await Duck.query(
    `SELECT DISTINCT geom_type FROM (
       SELECT ST_GeometryType("${escapedGeometryColumn}") as geom_type
       FROM "${escapedTable}"
       WHERE "${escapedGeometryColumn}" IS NOT NULL
       LIMIT 1000
     )`,
    { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
  )) as Array<{ geom_type: string }>;

  const types = geomTypeResult.map((result) => result.geom_type);

  if (types.length === 0) {
    return GEOMETRY_COLUMN_TYPE;
  }

  if (types.length === 1) {
    return types[0];
  }

  const hasPoint = hasGeometryType(types, 'POINT');
  const hasMultiPoint = hasGeometryType(types, 'MULTI_POINT');
  const hasLineString = hasGeometryType(types, 'LINE_STRING');
  const hasMultiLineString = hasGeometryType(types, 'MULTI_LINE_STRING');
  const hasPolygon = hasGeometryType(types, 'POLYGON');
  const hasMultiPolygon = hasGeometryType(types, 'MULTI_POLYGON');

  let geometryType = GEOMETRY_COLUMN_TYPE;

  if (hasPolygon || hasMultiPolygon) {
    geometryType = GEOMETRY_WKT_TYPES.MULTI_POLYGON;
  } else if (hasLineString || hasMultiLineString) {
    geometryType = GEOMETRY_WKT_TYPES.MULTI_LINE_STRING;
  } else if (hasPoint || hasMultiPoint) {
    geometryType = GEOMETRY_WKT_TYPES.MULTI_POINT;
  }

  return geometryType;
}

function reprojectGeoJsonCoordinates(
  coordinates: unknown,
  sourceCrs: string,
  targetCrs: string
): void {
  if (!Array.isArray(coordinates)) {
    return;
  }

  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === 'number' &&
    typeof coordinates[1] === 'number'
  ) {
    const result = reprojectPoint(
      coordinates[0],
      coordinates[1],
      sourceCrs,
      targetCrs
    );

    if (result.success && result.coordinates) {
      coordinates[0] = result.coordinates[0];
      coordinates[1] = result.coordinates[1];
    }
    return;
  }

  for (const child of coordinates) {
    reprojectGeoJsonCoordinates(child, sourceCrs, targetCrs);
  }
}

function reprojectGeoJsonValue(
  value: unknown,
  sourceCrs: string,
  targetCrs: string
): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    const geometry = JSON.parse(value) as { coordinates?: unknown };
    reprojectGeoJsonCoordinates(geometry.coordinates, sourceCrs, targetCrs);
    return JSON.stringify(geometry);
  } catch {
    return value;
  }
}

async function reprojectArrowTableWithProj4(
  tableName: string,
  Duck: DuckDBClientForArrow,
  geomColumn: GeomColumnInfo,
  sourceCrs: string,
  targetCrs: string,
  geometryType: string
): Promise<Table> {
  const escapedTable = escapeIdentifier(tableName);
  const escapedGeometryColumn = escapeIdentifier(geomColumn.column_name);
  const rawResult = (await Duck.query(
    `SELECT * EXCLUDE ("${escapedGeometryColumn}"),
            ST_AsGeoJSON("${escapedGeometryColumn}") AS "${escapedGeometryColumn}"
     FROM "${escapedTable}"`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  )) as Uint8Array;

  const rawTable = tableFromIPC(rawResult);
  const columns = Object.fromEntries(
    rawTable.schema.fields.map((field) => [field.name, [] as unknown[]])
  );

  for (let rowIndex = 0; rowIndex < rawTable.numRows; rowIndex++) {
    for (const field of rawTable.schema.fields) {
      const vector = rawTable.getChild(field.name);
      const value = vector?.get(rowIndex) ?? null;
      columns[field.name].push(
        field.name === geomColumn.column_name
          ? reprojectGeoJsonValue(value, sourceCrs, targetCrs)
          : value
      );
    }
  }

  const reprojectedTable = tableFromArrays(columns);
  const targetGeoArrowCrs = buildGeoArrowCrs(targetCrs);
  const syntheticMetadata: GeoArrowMetadata = {
    version: '1.0.0',
    primary_column: geomColumn.column_name,
    columns: {
      [geomColumn.column_name]: {
        encoding: ArrowExtension.GEOJSON,
        geometry_types: [geometryType.replace('ST_', '')],
        ...(targetGeoArrowCrs ? { crs: targetGeoArrowCrs } : {}),
        bbox: [-180, -90, 180, 90]
      }
    }
  };

  return addGeoArrowMetadataFromDuckDB(
    reprojectedTable,
    tableName,
    Duck,
    syntheticMetadata
  );
}

async function executeArrowIpcQuery(
  Duck: DuckDBClientForArrow,
  query: string,
  _tableName: string,
  options?: { skipStreaming?: boolean }
): Promise<Table> {
  // Streaming uses DuckDB-WASM's useUnsafe binding, which holds connection
  // state separate from the main async connection. After a schema-mutating
  // DDL such as CREATE OR REPLACE TABLE, the streaming binding can return
  // stale rows where newly added columns surface as NULL even though the
  // table on the main connection is fully populated. Callers that read
  // dataset tables prone to mutation (joins, edits) must opt out of
  // streaming to avoid this race.
  let ipcBuffer: Uint8Array;

  if (Duck.queryStreaming && !options?.skipStreaming) {
    ipcBuffer = await Duck.queryStreaming(query);
    const streamTable = tableFromIPC(ipcBuffer);
    if (streamTable.numRows > 0) {
      const firstBatchEmpty =
        streamTable.batches.length > 0 && streamTable.batches[0].numRows === 0;
      if (!firstBatchEmpty) {
        return streamTable;
      }
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
  geometryType: string,
  options?: { simple?: boolean }
): string | null {
  const escapedGeometryColumn = `"${escapeIdentifier(geometryColumnName)}"`;

  switch (geometryType) {
    case GeometryType.POLYGON:
    case GeometryType.MULTIPOLYGON:
      if (options?.simple) {
        return `CASE
          WHEN ST_IsEmpty(${escapedGeometryColumn}) THEN NULL
          ELSE ST_PointOnSurface(${escapedGeometryColumn})
        END`;
      }
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

/**
 * Fetch an Arrow table from DuckDB, preserving native geometry export.
 * DuckDB WASM >= 1.33 can export GEOMETRY columns directly through Arrow IPC,
 * so we only rewrite the geometry column when a reprojection is requested.
 */
export async function fetchArrowTableWithGeometry(
  tableName: string,
  Duck: DuckDBClientForArrow,
  whereClause?: string | null,
  targetCrs?: string | null,
  projectColumns?: readonly string[] | null,
  options?: { skipStreaming?: boolean }
): Promise<{ table: Table; geomColumn: GeomColumnInfo | undefined }> {
  const tableInfo = await Duck.describe_table(tableName);
  const columns = tableInfo.name.map((name: string, index: number) => ({
    column_name: name,
    column_type: tableInfo.type[index]
  }));

  const geomColumn = columns.find((c: { column_type: string }) =>
    isGeometryColumnType(c.column_type)
  );
  const escapedTable = escapeIdentifier(tableName);
  const escapedGeomColumn = geomColumn
    ? escapeIdentifier(geomColumn.column_name)
    : null;

  const normalizedTargetCrs = normalizeCrsName(targetCrs);
  const geometrySourceCrs = geomColumn
    ? extractGeometryColumnCrs(geomColumn.column_type)
    : undefined;
  const projectedColumnNames = projectColumns
    ? projectColumns.filter((name) =>
        columns.some((c) => c.column_name === name)
      )
    : null;

  const geometryProjection =
    escapedGeomColumn && normalizedTargetCrs && geometrySourceCrs
      ? `ST_Transform("${escapedGeomColumn}", '${escapeSqlString(
          geometrySourceCrs
        )}', '${escapeSqlString(normalizedTargetCrs)}', true) AS "${escapedGeomColumn}"`
      : escapedGeomColumn && normalizedTargetCrs
        ? `ST_Transform("${escapedGeomColumn}", '${escapeSqlString(
            normalizedTargetCrs
          )}') AS "${escapedGeomColumn}"`
        : escapedGeomColumn
          ? `"${escapedGeomColumn}"`
          : null;

  let query: string;
  if (projectedColumnNames && projectedColumnNames.length > 0) {
    const columnExpressions = projectedColumnNames.map(
      (name) => `"${escapeIdentifier(name)}"`
    );
    if (geometryProjection) {
      columnExpressions.push(geometryProjection);
    }
    query = `SELECT ${columnExpressions.join(', ')} FROM "${escapedTable}"`;
  } else if (escapedGeomColumn && normalizedTargetCrs) {
    query = `SELECT * EXCLUDE ("${escapedGeomColumn}"), ${geometryProjection} FROM "${escapedTable}"`;
  } else {
    query = `SELECT * FROM "${escapedTable}"`;
  }

  if (whereClause) {
    query += ` WHERE ${whereClause}`;
  }

  const baseTable = await executeArrowIpcQuery(Duck, query, tableName, {
    skipStreaming: options?.skipStreaming
  });
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
    const escapedTable = escapeIdentifier(tableName);
    const query = whereClause
      ? `SELECT * FROM "${escapedTable}" WHERE ${whereClause}`
      : `SELECT * FROM "${escapedTable}"`;
    return {
      table: await executeArrowIpcQuery(Duck, query, tableName),
      geomColumn: undefined
    };
  }

  const useSimpleExpression = !maximumInscribedCircleSupported;
  const pointExpression = getRepresentativePointExpression(
    geomColumn.column_name,
    geometryType,
    { simple: useSimpleExpression }
  );
  const escapedTable = escapeIdentifier(tableName);
  const escapedGeomColumn = escapeIdentifier(geomColumn.column_name);

  if (!pointExpression) {
    return fetchArrowTableWithGeometry(tableName, Duck, whereClause);
  }

  const buildQuery = (expression: string): string => {
    let q = `SELECT * REPLACE (
      CASE
        WHEN "${escapedGeomColumn}" IS NULL THEN NULL
        ELSE ${expression}
      END AS "${escapedGeomColumn}"
    ) FROM "${escapedTable}"`;
    if (whereClause) {
      q += ` WHERE ${whereClause}`;
    }
    return q;
  };

  const geometryCrs = extractGeometryColumnCrs(geomColumn.column_type);
  const finalGeomColumn = {
    ...geomColumn,
    column_type: geometryCrs
      ? `${GEOMETRY_COLUMN_TYPE}('${geometryCrs}')`
      : GEOMETRY_COLUMN_TYPE
  };

  try {
    return {
      table: await executeArrowIpcQuery(
        Duck,
        buildQuery(pointExpression),
        tableName
      ),
      geomColumn: finalGeomColumn
    };
  } catch (error) {
    if (useSimpleExpression) {
      throw error;
    }
    const fallbackExpression = getRepresentativePointExpression(
      geomColumn.column_name,
      geometryType,
      { simple: true }
    );
    if (!fallbackExpression || fallbackExpression === pointExpression) {
      throw error;
    }
    maximumInscribedCircleSupported = false;
    return {
      table: await executeArrowIpcQuery(
        Duck,
        buildQuery(fallbackExpression),
        tableName
      ),
      geomColumn: finalGeomColumn
    };
  }
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
    } else {
      // Resolve geometry column: reuse pre-fetched info or call describe_table()
      if (prefetchedGeomColumn) {
        geomColumn = prefetchedGeomColumn;
      } else {
        geomColumn = findGeometryColumn(await getTableColumns(tableName, Duck));
      }

      if (!geomColumn) {
        return table;
      }

      geometryCrs = extractGeometryColumnCrs(geomColumn.column_type) ?? null;

      if (overrides?.geometryType) {
        geometryType = overrides.geometryType;
      } else {
        geometryType = await resolveGeometryTypeForTable(
          tableName,
          geomColumn.column_name,
          Duck
        );
      }
    }

    const geomColumnIndex = table.schema.fields.findIndex(
      (f) => f.name === geomColumn!.column_name
    );
    const isGeoJsonString =
      geomColumnIndex !== -1 &&
      table.schema.fields[geomColumnIndex].typeId === Type.Utf8;
    const cachedEncoding =
      cachedGeoArrowMetadata?.columns?.[geomColumn!.column_name]?.encoding;

    // Normalize DuckDB geometry export to geoarrow.wkb so the layer factory
    // always stays on the binary geoarrow-deck-stream path.
    const encoding =
      cachedEncoding ??
      (isGeoJsonString ? ArrowExtension.GEOJSON : ArrowExtension.GEOARROW_WKB);
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
  setCache: (table: Table) => void
): Promise<Table> {
  const cached = getCachedTable();
  if (cached) {
    return cached;
  }

  const { table: baseTable, geomColumn } = await fetchArrowTableWithGeometry(
    tableName,
    Duck,
    undefined,
    undefined,
    undefined,
    { skipStreaming: true }
  );
  const tableWithMetadata = await addGeoArrowMetadataFromDuckDB(
    baseTable,
    tableName,
    Duck,
    undefined,
    geomColumn
  );

  setCache(tableWithMetadata);

  return tableWithMetadata;
}

export async function getArrowTableReprojected(
  tableName: string,
  Duck: DuckDBClientForArrow,
  targetCrs: string
): Promise<Table> {
  try {
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
  } catch (error) {
    const normalizedTargetCrs = normalizeCrsName(targetCrs);
    if (!normalizedTargetCrs) {
      throw error;
    }

    const geomColumn = findGeometryColumn(
      await getTableColumns(tableName, Duck)
    );
    const sourceCrs = geomColumn
      ? extractGeometryColumnCrs(geomColumn.column_type)
      : undefined;

    if (
      !geomColumn ||
      !sourceCrs ||
      !isProjectionSupported(sourceCrs) ||
      !isProjectionSupported(normalizedTargetCrs)
    ) {
      throw error;
    }

    const geometryType = await resolveGeometryTypeForTable(
      tableName,
      geomColumn.column_name,
      Duck
    );

    return reprojectArrowTableWithProj4(
      tableName,
      Duck,
      geomColumn,
      sourceCrs,
      normalizedTargetCrs,
      geometryType
    );
  }
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
