import path from 'node:path';
import { query, run, type TestDuckDB } from './duckdb-node-helper';

export const CSV_FIXTURES_DIR = path.resolve(
  __dirname,
  '../../tests-datasets/csv'
);

export const SIMPLE_TYPE = {
  NUMERIC: 'numeric',
  BOOLEAN: 'boolean',
  DATE: 'date',
  STRING: 'string'
} as const;

export interface ColumnSummary {
  name: string;
  type_simple: string;
  count: number;
  uniques: number;
  nulls: number;
  min?: number;
  max?: number;
  share_integers?: number;
  share_floats?: number;
  share_rank_interval?: number;
  extent_magnitude?: number;
  skewness?: number;
  categories?: string[];
  share_uniques?: number;
  share_nulls?: number;
}

export async function loadCsv(
  db: TestDuckDB,
  file: string,
  tableName: string,
  delimiter?: string,
  readOptions?: string
): Promise<void> {
  const escapedFile = path.join(CSV_FIXTURES_DIR, file).replace(/'/g, "''");
  const delimClause = delimiter ? `, delim = '${delimiter}'` : '';
  const extraClause = readOptions ? `, ${readOptions}` : '';
  await run(
    db,
    `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${escapedFile}'${delimClause}${extraClause}, header = true)`
  );
}

export async function listColumns(
  db: TestDuckDB,
  tableName: string
): Promise<string[]> {
  const rows = await query(
    db,
    `SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}' ORDER BY ordinal_position`
  );
  return rows.map((r) => String(r.column_name));
}

function classifyType(sqlType: string): string {
  const upper = sqlType.toUpperCase();
  if (
    upper.includes('INT') ||
    upper.includes('DOUBLE') ||
    upper.includes('FLOAT') ||
    upper.includes('DECIMAL') ||
    upper.includes('BIGINT') ||
    upper.includes('REAL') ||
    upper.includes('NUMERIC')
  )
    return SIMPLE_TYPE.NUMERIC;
  if (upper.includes('BOOL')) return SIMPLE_TYPE.BOOLEAN;
  if (upper.includes('DATE') || upper.includes('TIMESTAMP'))
    return SIMPLE_TYPE.DATE;
  return SIMPLE_TYPE.STRING;
}

export async function summarizeColumn(
  db: TestDuckDB,
  table: string,
  column: string
): Promise<ColumnSummary> {
  const escapedCol = column.replace(/"/g, '""');
  const typeRows = await query(
    db,
    `SELECT data_type FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column.replace(/'/g, "''")}'`
  );
  const sqlType = String(typeRows[0]?.data_type ?? 'VARCHAR');
  const rows = await query(
    db,
    `SELECT
       COUNT(*) AS total,
       COUNT(DISTINCT "${escapedCol}") AS uniques,
       COUNT(*) - COUNT("${escapedCol}") AS nulls
     FROM "${table}"`
  );
  const row = rows[0];
  const type_simple = classifyType(sqlType);
  const totalCount = Number(row.total ?? 0);
  const uniqueCount = Number(row.uniques ?? 0);
  const nullCount = Number(row.nulls ?? 0);

  const summary: ColumnSummary = {
    name: column,
    type_simple,
    count: totalCount,
    uniques: uniqueCount,
    nulls: nullCount,
    share_uniques: totalCount > 0 ? uniqueCount / totalCount : 0,
    share_nulls: totalCount > 0 ? nullCount / totalCount : 0
  };

  if (type_simple === SIMPLE_TYPE.NUMERIC) {
    const stats = await query(
      db,
      `SELECT
         MIN(TRY_CAST("${escapedCol}" AS DOUBLE)) AS min_v,
         MAX(TRY_CAST("${escapedCol}" AS DOUBLE)) AS max_v,
         AVG(CASE WHEN MOD(TRY_CAST("${escapedCol}" AS DOUBLE), 1) = 0 THEN 1.0 ELSE 0.0 END) AS share_ints,
         AVG(CASE WHEN MOD(TRY_CAST("${escapedCol}" AS DOUBLE), 1) <> 0 THEN 1.0 ELSE 0.0 END) AS share_floats,
         skewness(TRY_CAST("${escapedCol}" AS DOUBLE)) AS skew
       FROM "${table}"
       WHERE "${escapedCol}" IS NOT NULL`
    );
    const s = stats[0];
    summary.min = Number(s.min_v ?? 0);
    summary.max = Number(s.max_v ?? 0);
    summary.share_integers = Number(s.share_ints ?? 0);
    summary.share_floats = Number(s.share_floats ?? 0);
    summary.skewness = s.skew != null ? Number(s.skew) : undefined;
    summary.extent_magnitude =
      summary.max && summary.max > 0
        ? Math.log10(summary.max / Math.max(summary.min ?? 1, 1))
        : 0;

    const rankRows = await query(
      db,
      `WITH ordered_values AS (
         SELECT TRY_CAST("${escapedCol}" AS DOUBLE) AS v
         FROM "${table}"
         WHERE "${escapedCol}" IS NOT NULL
       ),
       diffs AS (
         SELECT v - LAG(v) OVER (ORDER BY v) AS diff FROM ordered_values
       )
       SELECT COALESCE(SUM(CASE WHEN diff = 1 THEN 1 ELSE 0 END) * 1.0 / NULLIF(COUNT(diff), 0), 0) AS share_rank
       FROM diffs WHERE diff IS NOT NULL`
    );
    summary.share_rank_interval = Number(rankRows[0]?.share_rank ?? 0);
  }

  if (
    type_simple === SIMPLE_TYPE.STRING &&
    uniqueCount > 0 &&
    uniqueCount <= 24
  ) {
    const catRows = await query(
      db,
      `SELECT DISTINCT "${escapedCol}" AS category FROM "${table}" WHERE "${escapedCol}" IS NOT NULL LIMIT 24`
    );
    summary.categories = catRows.map((r) => String(r.category));
  }

  return summary;
}
