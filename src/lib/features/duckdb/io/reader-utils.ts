import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { DUCK_CONST } from '../constants';
import { executeQuery } from '../core/query';
import {
  sqlIdentifier,
  sqlString,
  sqlNamePart
} from '$lib/features/commons/utils/sql.utils';

let duckDBKeywordsCache: Set<string> | null = null;

async function getDuckDBKeywords(
  connection: AsyncDuckDBConnection
): Promise<Set<string>> {
  if (duckDBKeywordsCache) return duckDBKeywordsCache;
  const rows = (await executeQuery(
    connection,
    `SELECT lower(keyword_name) AS kw FROM duckdb_keywords();`,
    { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
  )) as Array<{ kw: string }>;
  duckDBKeywordsCache = new Set(rows.map((row) => row.kw));
  return duckDBKeywordsCache;
}

/**
 * `read_csv(..., normalize_names=true)` prefixes an underscore to any column
 * whose name is a DuckDB keyword (name, year, zone, level, type, group, order…)
 * or starts with a digit (year columns "2020" → "_2020"). These names are very
 * common in real data, so the prefix leaks an altered name into the whole UI.
 * Restore the original name when it is safe: only strip a single leading
 * underscore, only when the stripped name was actually a keyword/digit-led name
 * (i.e. something normalize_names would have prefixed), and never when it would
 * collide with an existing column. Internal columns (double underscore) are
 * left untouched.
 */
export async function restoreNormalizedColumnNames(
  connection: AsyncDuckDBConnection,
  table: string
): Promise<void> {
  const columns = (await executeQuery(
    connection,
    `SELECT column_name FROM information_schema.columns WHERE table_name = ${sqlString(table)};`,
    { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
  )) as Array<{ column_name: string }>;

  const existing = new Set(columns.map((column) => column.column_name));
  const keywords = await getDuckDBKeywords(connection);

  for (const { column_name: name } of columns) {
    if (!name.startsWith('_') || name.startsWith('__')) continue;
    const stripped = name.slice(1);
    if (!stripped) continue;
    const wasPrefixed =
      keywords.has(stripped.toLowerCase()) || /^[0-9]/.test(stripped);
    if (!wasPrefixed || existing.has(stripped)) continue;

    try {
      await executeQuery(
        connection,
        `ALTER TABLE ${sqlIdentifier(table)} RENAME COLUMN ${sqlIdentifier(name)} TO ${sqlIdentifier(stripped)};`,
        { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
      );
      existing.delete(name);
      existing.add(stripped);
    } catch {
      // Best-effort: keep the normalized name if the rename fails.
    }
  }
}

export function rowIdSequenceName(table: string): string {
  return `id_${sqlNamePart(table)}`;
}

export async function addRowId(
  connection: AsyncDuckDBConnection,
  table: string
): Promise<void> {
  const sequenceName = rowIdSequenceName(table);
  await executeQuery(
    connection,
    `CREATE OR REPLACE SEQUENCE ${sqlIdentifier(sequenceName)} START 1;`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );
  await executeQuery(
    connection,
    `ALTER TABLE ${sqlIdentifier(table)} ADD COLUMN IF NOT EXISTS ${INTERNAL_COLUMN.ID} INTEGER DEFAULT nextval('${sequenceName}');`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );
}

const GDAL_FID_COLUMN = 'OGC_FID';

/**
 * GDAL adds an `OGC_FID` column for drivers without a native feature id
 * (GeoJSON, KML). When it is only the 0..n-1 row sequence it carries nothing
 * `__id` does not, so it is dropped. Any other value set comes from the file
 * (a GeoJSON integer `Feature.id`) and is kept as data.
 */
export async function dropSyntheticFeatureIdColumn(
  connection: AsyncDuckDBConnection,
  table: string
): Promise<void> {
  const columns = (await executeQuery(
    connection,
    `SELECT column_name FROM information_schema.columns WHERE table_name = ${sqlString(table)} AND column_name = '${GDAL_FID_COLUMN}';`,
    { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
  )) as Array<{ column_name: string }>;
  if (columns.length === 0) return;

  const fid = `TRY_CAST("${GDAL_FID_COLUMN}" AS BIGINT)`;
  const [result] = (await executeQuery(
    connection,
    `SELECT (count(*) = 0 OR (
         min(${fid}) = 0
         AND max(${fid}) = count(*) - 1
         AND count(DISTINCT ${fid}) = count(*)
       )) AS synthetic
     FROM ${sqlIdentifier(table)};`,
    { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
  )) as Array<{ synthetic: boolean | null }>;
  if (result?.synthetic !== true) return;

  await executeQuery(
    connection,
    `ALTER TABLE ${sqlIdentifier(table)} DROP COLUMN "${GDAL_FID_COLUMN}";`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );
}
