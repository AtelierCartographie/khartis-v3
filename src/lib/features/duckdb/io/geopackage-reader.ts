import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { DataValidationError } from '$lib/features/commons/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import * as m from '$lib/paraglide/messages';
import { DUCK_CONST, EXTENSIONS } from '../constants';
import { executeQuery } from '../core/query';
import type { DuckDBContext } from '../types';
import { dropRegisteredFile, registerSqliteSidecars } from './file-registry';

/*
 * GDAL's GeoPackage driver streams features from a worker thread unless
 * `gpkg_ogr_contents` holds the feature count and fids run from 1 to N. DuckDB
 * WASM has no threads, so `ST_Read` fails on most GeoPackages not written by
 * GDAL, or with deleted features. The file is read as the SQLite database it
 * is, and the GeoPackage geometry decoded in SQL.
 */

const GEOMETRY_HEX_COLUMN = '__khartis_gpkg_geometry';
const GEOMETRY_KEY_COLUMN = '__khartis_gpkg_key';

interface GeoPackageGeometryColumn {
  table_name: string;
  column_name: string;
  organization: string | null;
  organization_coordsys_id: number | bigint | null;
}

let attachCounter = 0;

function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/**
 * A GeoPackage geometry is an 8-byte header, an envelope whose size the flags
 * byte encodes (none, xy, xyz, xym or xyzm), then standard WKB.
 */
function buildGeoPackageGeometryExpression(blobColumn: string): string {
  const flags = `('0x' || hex(${blobColumn}[4:4]))::INTEGER`;
  const envelopeBytes = `[0, 32, 48, 48, 64][((${flags} >> 1) & 7) + 1]`;
  return `ST_GeomFromWKB(${blobColumn}[9 + ${envelopeBytes}:])`;
}

function resolveEpsgCrs(column: GeoPackageGeometryColumn): string | null {
  const code = Number(column.organization_coordsys_id ?? 0);
  return column.organization?.toUpperCase() === 'EPSG' && code > 0
    ? `EPSG:${code}`
    : null;
}

async function ensureSqliteExtension(ctx: DuckDBContext): Promise<void> {
  try {
    await executeQuery(ctx.connection, `LOAD ${EXTENSIONS.SQLITE};`, {
      format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
    });
  } catch {
    await executeQuery(
      ctx.connection,
      `INSTALL ${EXTENSIONS.SQLITE}; LOAD ${EXTENSIONS.SQLITE};`,
      { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
    );
  }
}

async function queryGeometryColumn(
  ctx: DuckDBContext,
  alias: string,
  layer: string | null
): Promise<GeoPackageGeometryColumn | undefined> {
  const layerFilter = layer
    ? `WHERE lower(g.table_name) = lower('${escapeSqlString(layer)}')`
    : '';
  const rows = (await executeQuery(
    ctx.connection,
    `SELECT g.table_name, g.column_name, s.organization, s.organization_coordsys_id
     FROM "${alias}".gpkg_geometry_columns g
     LEFT JOIN "${alias}".gpkg_spatial_ref_sys s ON s.srs_id = g.srs_id
     ${layerFilter}
     ORDER BY g.table_name
     LIMIT 1`,
    { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
  )) as GeoPackageGeometryColumn[];
  return rows[0];
}

async function queryPrimaryKey(
  ctx: DuckDBContext,
  alias: string,
  geometry: GeoPackageGeometryColumn
): Promise<string | null> {
  const pragma = `SELECT name FROM pragma_table_info('${geometry.table_name.replaceAll("'", "''")}') WHERE pk > 0`;
  const rows = (await executeQuery(
    ctx.connection,
    `FROM sqlite_query('${alias}', '${escapeSqlString(pragma)}')`,
    { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
  )) as Array<{ name: string }>;
  return rows.length === 1 ? rows[0].name : null;
}

async function queryAttributeColumns(
  ctx: DuckDBContext,
  alias: string,
  geometry: GeoPackageGeometryColumn
): Promise<string[]> {
  const rows = (await executeQuery(
    ctx.connection,
    `SELECT column_name
     FROM duckdb_columns()
     WHERE database_name = '${alias}'
       AND table_name = '${escapeSqlString(geometry.table_name)}'
     ORDER BY column_index`,
    { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
  )) as Array<{ column_name: string }>;
  return rows
    .map((row) => row.column_name)
    .filter((column) => column !== geometry.column_name);
}

function buildGeometryColumnSql(geometry: GeoPackageGeometryColumn): string {
  const crs = resolveEpsgCrs(geometry);
  const geometryType = crs ? `GEOMETRY('${crs}')` : 'GEOMETRY';
  return `${buildGeoPackageGeometryExpression(GEOMETRY_HEX_COLUMN)}::${geometryType} AS "${INTERNAL_COLUMN.GEOM}"`;
}

/**
 * `sqlite_query` returns every column as text, while scanning the attached
 * table keeps the declared types but cannot read a geometry blob declared as
 * MULTIPOLYGON. Attributes come from the scan, geometry from `sqlite_query`,
 * joined on the primary key every GeoPackage feature table carries.
 */
function buildTypedReadQuery(
  finalTablename: string,
  alias: string,
  geometry: GeoPackageGeometryColumn,
  primaryKey: string
): string {
  const table = quoteSqliteIdentifier(geometry.table_name);
  const key = quoteSqliteIdentifier(primaryKey);
  const sqliteQuery = `SELECT ${key} AS ${GEOMETRY_KEY_COLUMN}, hex(${quoteSqliteIdentifier(geometry.column_name)}) AS ${GEOMETRY_HEX_COLUMN} FROM ${table}`;
  const duckKey = `"${escapeIdentifier(primaryKey)}"`;

  return `CREATE OR REPLACE TABLE "${escapeIdentifier(finalTablename)}" AS
    WITH geometry AS (
      SELECT ${GEOMETRY_KEY_COLUMN}::BIGINT AS ${GEOMETRY_KEY_COLUMN},
        unhex(${GEOMETRY_HEX_COLUMN}) AS ${GEOMETRY_HEX_COLUMN}
      FROM sqlite_query('${alias}', '${escapeSqlString(sqliteQuery)}')
    )
    SELECT a.* EXCLUDE ("${escapeIdentifier(geometry.column_name)}"),
      ${buildGeometryColumnSql(geometry)}
    FROM "${alias}"."${escapeIdentifier(geometry.table_name)}" a
    JOIN geometry g ON g.${GEOMETRY_KEY_COLUMN} = a.${duckKey}
    ORDER BY a.${duckKey}`;
}

/** A layer without a single primary key (a view) is read as text. */
function buildTextReadQuery(
  finalTablename: string,
  alias: string,
  geometry: GeoPackageGeometryColumn,
  attributeColumns: string[]
): string {
  const sqliteSelect = [
    ...attributeColumns.map(quoteSqliteIdentifier),
    `hex(${quoteSqliteIdentifier(geometry.column_name)}) AS ${GEOMETRY_HEX_COLUMN}`
  ].join(', ');
  const sqliteQuery = `SELECT ${sqliteSelect} FROM ${quoteSqliteIdentifier(geometry.table_name)}`;

  return `CREATE OR REPLACE TABLE "${escapeIdentifier(finalTablename)}" AS
    WITH source AS (
      SELECT * EXCLUDE (${GEOMETRY_HEX_COLUMN}),
        unhex(${GEOMETRY_HEX_COLUMN}) AS ${GEOMETRY_HEX_COLUMN}
      FROM sqlite_query('${alias}', '${escapeSqlString(sqliteQuery)}')
    )
    SELECT * EXCLUDE (${GEOMETRY_HEX_COLUMN}), ${buildGeometryColumnSql(geometry)}
    FROM source`;
}

async function runReadQuery(
  ctx: DuckDBContext,
  readQuery: string
): Promise<void> {
  try {
    await executeQuery(ctx.connection, readQuery, {
      format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
    });
  } catch (error) {
    // SQLite types are only declarations: a value of another type in a column
    // stops the typed scan, and the text fallback reads every attribute.
    if (!(error instanceof Error) || !/mismatch type/i.test(error.message)) {
      throw error;
    }
    logger.warn(
      'GeoPackage attributes do not match their declared types, reading them as text',
      LogCategory.DUCKDB,
      error
    );
    await executeQuery(ctx.connection, 'SET sqlite_all_varchar = true;', {
      format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
    });
    try {
      await executeQuery(ctx.connection, readQuery, {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      });
    } finally {
      await executeQuery(ctx.connection, 'RESET sqlite_all_varchar;', {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      });
    }
  }
}

/**
 * Reads one layer of a registered GeoPackage into `finalTablename`, the
 * geometry in a `geom` column tagged with the layer's EPSG code.
 */
export async function readGeoPackageLayer(
  ctx: DuckDBContext,
  fileId: string,
  finalTablename: string,
  layer: string | null
): Promise<void> {
  await ensureSqliteExtension(ctx);
  const sidecarIds = await registerSqliteSidecars(
    ctx.db,
    ctx.registered_files,
    fileId
  );
  const alias = `khartis_gpkg_${++attachCounter}`;

  try {
    await executeQuery(
      ctx.connection,
      `ATTACH '${escapeSqlString(fileId)}' AS "${alias}" (TYPE sqlite, READ_ONLY);`,
      { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
    );
    try {
      const geometry = await queryGeometryColumn(ctx, alias, layer);
      if (!geometry) {
        throw new DataValidationError(
          m.pipeline_error_file_unreadable(),
          INTERNAL_COLUMN.GEOM,
          { fileId, layer, reason: 'GeoPackage layer has no geometry column' }
        );
      }
      const primaryKey = await queryPrimaryKey(ctx, alias, geometry);
      const readQuery = primaryKey
        ? buildTypedReadQuery(finalTablename, alias, geometry, primaryKey)
        : buildTextReadQuery(
            finalTablename,
            alias,
            geometry,
            await queryAttributeColumns(ctx, alias, geometry)
          );
      await runReadQuery(ctx, readQuery);
    } finally {
      await executeQuery(ctx.connection, `DETACH "${alias}";`, {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      });
    }
  } finally {
    for (const sidecarId of sidecarIds) {
      await dropRegisteredFile(ctx.db, ctx.registered_files, sidecarId);
    }
  }
}
