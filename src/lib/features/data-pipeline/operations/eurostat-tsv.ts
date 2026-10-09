import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';

/**
 * Eurostat TSV layout: the first tab-separated field packs the dimensions
 * with commas and ends with `<dimension>\TIME_PERIOD`, the other fields are
 * periods whose values may carry a status flag (`32.9 u`) or `:` when missing.
 */
export interface EurostatTsvLayout {
  dimensions: string[];
  periods: string[];
}

interface DuckQueryClient {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  invalidateTableCache?(tableName: string): void;
}

interface DescribeRow {
  column_name?: string;
}

export function detectEurostatTsvLayout(
  headerLine: string
): EurostatTsvLayout | null {
  const fields = headerLine.split('\t').map((field) => field.trim());
  if (fields.length < 2) return null;

  const [packed, ...periods] = fields;
  const backslash = packed.lastIndexOf('\\');
  if (backslash === -1 || !packed.includes(',')) return null;

  const dimensions = packed.slice(0, backslash).split(',');
  if (dimensions.some((dimension) => dimension.trim() === '')) return null;
  if (periods.some((period) => period === '')) return null;

  return { dimensions: dimensions.map((d) => d.trim()), periods };
}

/** Splits the packed dimension column and cleans the period values of a table read with a tab delimiter. */
export async function restructureEurostatTable(
  tableName: string,
  layout: EurostatTsvLayout,
  duck: DuckQueryClient
): Promise<void> {
  const table = escapeIdentifier(tableName);
  const columns = (
    (await duck.query(`DESCRIBE "${table}"`, {
      format: 'array'
    })) as DescribeRow[]
  ).map((row) => String(row.column_name));

  if (columns.length !== layout.periods.length + 1) return;

  const [packedColumn, ...periodColumns] = columns;
  const packed = `"${escapeIdentifier(packedColumn)}"::VARCHAR`;

  const dimensionSelects = layout.dimensions.map(
    (dimension, index) =>
      `trim(string_split(${packed}, ',')[${index + 1}]) AS "${escapeIdentifier(dimension)}"`
  );
  const periodSelects = periodColumns.map((column, index) => {
    const value = `trim(regexp_replace("${escapeIdentifier(column)}"::VARCHAR, '\\s+[a-z]+$', ''))`;
    return `TRY_CAST(NULLIF(${value}, ':') AS DOUBLE) AS "${escapeIdentifier(layout.periods[index])}"`;
  });

  await duck.query(
    `CREATE OR REPLACE TABLE "${table}" AS
      SELECT ${[...dimensionSelects, ...periodSelects].join(', ')}
      FROM "${table}"`
  );
  duck.invalidateTableCache?.(tableName);
}
