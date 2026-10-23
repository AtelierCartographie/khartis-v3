import { DataValidationError } from '$lib/features/commons/pipeline.errors';
import { isGeometryColumnType } from '$lib/features/duckdb';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import type {
  GeoParquetColumnMeta,
  GeoParquetCrsMetadata,
  GeoParquetMeta
} from '$lib/features/map/services/geo-parquet-metadata.service';
import * as m from '$lib/paraglide/messages';

interface DuckDBGeoParquetClient {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  describe_table(
    tableName: string
  ): Promise<{ name: string[]; type: string[] }>;
  invalidateTableCache?(tableName: string): void;
}

interface NativeGeometryEncoding {
  geoJsonType: string;
  listDepth: number;
}

const NATIVE_GEOMETRY_ENCODINGS: Record<string, NativeGeometryEncoding> = {
  point: { geoJsonType: 'Point', listDepth: 0 },
  multipoint: { geoJsonType: 'MultiPoint', listDepth: 1 },
  linestring: { geoJsonType: 'LineString', listDepth: 1 },
  multilinestring: { geoJsonType: 'MultiLineString', listDepth: 2 },
  polygon: { geoJsonType: 'Polygon', listDepth: 2 },
  multipolygon: { geoJsonType: 'MultiPolygon', listDepth: 3 }
};

function normalizeEncoding(encoding: string): string {
  return encoding.toLowerCase().replace(/^geoarrow\./, '');
}

function buildPointCoordinates(
  valueExpression: string,
  columnType: string
): string {
  return /\bSTRUCT\s*\(/i.test(columnType)
    ? `[${valueExpression}.x, ${valueExpression}.y]`
    : `[${valueExpression}[1], ${valueExpression}[2]]`;
}

function buildNativeCoordinates(
  valueExpression: string,
  columnType: string,
  listDepth: number,
  currentDepth = 0
): string {
  if (currentDepth === listDepth) {
    return buildPointCoordinates(valueExpression, columnType);
  }

  const itemName = `coordinate_${currentDepth}`;
  return `list_transform(${valueExpression}, ${itemName} -> ${buildNativeCoordinates(
    itemName,
    columnType,
    listDepth,
    currentDepth + 1
  )})`;
}

function resolveSourceCrs(
  crs: GeoParquetCrsMetadata | null | undefined
): string | null {
  if (!crs) {
    return null;
  }

  if (crs.id?.authority && crs.id.code !== undefined) {
    return `${crs.id.authority}:${crs.id.code}`;
  }

  if (crs.name && /^(?:EPSG|OGC):[^\s]+$/i.test(crs.name)) {
    return crs.name;
  }

  if (/^WGS\s*84$/i.test(crs.name ?? '')) {
    return 'EPSG:4326';
  }

  return null;
}

function isWgs84Crs(crs: string): boolean {
  return /^(?:EPSG:4326|OGC:CRS84)$/i.test(crs);
}

function applyCrsTransform(
  geometryExpression: string,
  columnMetadata: GeoParquetColumnMeta
): string {
  const sourceCrs = resolveSourceCrs(columnMetadata.crs);
  if (!sourceCrs || isWgs84Crs(sourceCrs)) {
    return geometryExpression;
  }

  return `ST_Transform(${geometryExpression}, '${escapeSqlString(sourceCrs)}', 'EPSG:4326', true)`;
}

function buildGeometryExpression(
  columnName: string,
  columnType: string,
  columnMetadata: GeoParquetColumnMeta
): string | null {
  const encoding = columnMetadata.encoding
    ? normalizeEncoding(columnMetadata.encoding)
    : '';
  const escapedColumn = `"${escapeIdentifier(columnName)}"`;

  if (encoding === 'wkb' || encoding === 'ogc.wkb') {
    return applyCrsTransform(
      `ST_GeomFromWKB(${escapedColumn})`,
      columnMetadata
    );
  }

  const nativeEncoding = NATIVE_GEOMETRY_ENCODINGS[encoding];
  if (!nativeEncoding) {
    return null;
  }

  const coordinates = buildNativeCoordinates(
    escapedColumn,
    columnType,
    nativeEncoding.listDepth
  );
  const geometryExpression = `ST_GeomFromGeoJSON(json_object('type', '${nativeEncoding.geoJsonType}', 'coordinates', ${coordinates}))`;
  return applyCrsTransform(geometryExpression, columnMetadata);
}

/** GeoParquet 1.1 bbox covering columns, declared in the `geo` metadata. */
function findCoveringColumns(
  metadata: GeoParquetMeta,
  tableColumns: string[]
): string[] {
  const columns = new Set<string>();
  for (const columnMetadata of Object.values(metadata.columns ?? {})) {
    for (const path of Object.values(columnMetadata.covering?.bbox ?? {})) {
      const column = path[0];
      if (column && tableColumns.includes(column)) columns.add(column);
    }
  }
  return [...columns];
}

export async function normalizeGeoParquetTable(
  tableName: string,
  metadata: GeoParquetMeta,
  Duck: DuckDBGeoParquetClient
): Promise<boolean> {
  const primaryColumn = metadata.primary_column;
  const columnMetadata = primaryColumn
    ? metadata.columns?.[primaryColumn]
    : undefined;
  if (!primaryColumn || !columnMetadata?.encoding) {
    return false;
  }

  const tableDescription = await Duck.describe_table(tableName);
  const columnIndex = tableDescription.name.indexOf(primaryColumn);
  if (columnIndex === -1) {
    throw new DataValidationError(
      m.pipeline_error_file_unreadable(),
      primaryColumn,
      {
        tableName,
        reason: 'GeoParquet primary geometry column is missing'
      }
    );
  }

  const columnType = tableDescription.type[columnIndex];
  const isDecoded = isGeometryColumnType(columnType);
  const geometryExpression = isDecoded
    ? null
    : buildGeometryExpression(primaryColumn, columnType, columnMetadata);
  if (!isDecoded && !geometryExpression) {
    throw new DataValidationError(m.pipeline_error_generic(), primaryColumn, {
      tableName,
      encoding: columnMetadata.encoding,
      reason: 'Unsupported GeoParquet geometry encoding'
    });
  }

  const coveringColumns = findCoveringColumns(
    metadata,
    tableDescription.name
  ).filter((column) => column !== primaryColumn);
  if (!geometryExpression && coveringColumns.length === 0) {
    return false;
  }

  const escapedTable = escapeIdentifier(tableName);
  const escapedColumn = escapeIdentifier(primaryColumn);
  const exclude = coveringColumns.length
    ? ` EXCLUDE (${coveringColumns
        .map((column) => `"${escapeIdentifier(column)}"`)
        .join(', ')})`
    : '';
  const replace = geometryExpression
    ? ` REPLACE (
      CASE
        WHEN "${escapedColumn}" IS NULL THEN NULL
        ELSE ${geometryExpression}
      END AS "${escapedColumn}"
    )`
    : '';
  await Duck.query(`
    CREATE OR REPLACE TABLE "${escapedTable}" AS
    SELECT *${exclude}${replace}
    FROM "${escapedTable}"
  `);
  Duck.invalidateTableCache?.(tableName);

  return true;
}
