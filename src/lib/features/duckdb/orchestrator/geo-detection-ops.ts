import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import type { ArrowTableLike } from '../types';

export const CATALOG_ATTRIBUTES_TABLE = 'basemap_attributes';

const MAX_MATCHED_BASEMAPS = 6;

export interface CatalogColumnMatch {
  column: string;
  distinctValues: number;
  matchedValues: number;
  /** Catalog basemaps sharing the most values with the column, best first. */
  basemaps: string[];
}

export interface DuckDBClientForGeoDetection {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (
    value &&
    typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function'
  ) {
    return Array.from(value as Iterable<unknown>, String);
  }
  return [];
}

/**
 * Counts, per column, the distinct normalized values that also appear in the
 * catalog attributes index, with the same normalization as the basemap join.
 */
export async function matchColumnsAgainstCatalog(
  tableName: string,
  columns: string[],
  Duck: DuckDBClientForGeoDetection,
  attributesTable: string = CATALOG_ATTRIBUTES_TABLE
): Promise<CatalogColumnMatch[]> {
  if (columns.length === 0) return [];

  const table = escapeIdentifier(tableName);
  const attributes = escapeIdentifier(attributesTable);
  const values = columns
    .map((column) => {
      const identifier = escapeIdentifier(column);
      return `SELECT '${escapeSqlString(column)}' AS col, normalize_text_join("${identifier}") AS n FROM "${table}" WHERE "${identifier}" IS NOT NULL`;
    })
    .join(' UNION ALL ');

  const result = (await Duck.query(
    `WITH distinct_values AS (
       SELECT DISTINCT col, n FROM (${values}) WHERE n <> ''
     ),
     hits AS (
       SELECT d.col, a.basemap, count(DISTINCT d.n) AS hit_count
       FROM distinct_values d
       JOIN "${attributes}" a ON a.normalized = d.n
       GROUP BY d.col, a.basemap
     ),
     matched AS (
       SELECT col, count(*) AS matched_values
       FROM distinct_values d
       WHERE EXISTS (SELECT 1 FROM "${attributes}" a WHERE a.normalized = d.n)
       GROUP BY col
     ),
     top_basemaps AS (
       SELECT col, list(basemap ORDER BY hit_count DESC, basemap)[1:${MAX_MATCHED_BASEMAPS}] AS basemaps
       FROM hits
       GROUP BY col
     )
     SELECT t.col, t.distinct_values, coalesce(m.matched_values, 0) AS matched_values, coalesce(b.basemaps, []) AS basemaps
     FROM (SELECT col, count(*) AS distinct_values FROM distinct_values GROUP BY col) t
     LEFT JOIN matched m USING (col)
     LEFT JOIN top_basemaps b USING (col)`
  )) as ArrowTableLike;

  const byColumn = new Map<string, CatalogColumnMatch>();
  for (let index = 0; index < result.numRows; index += 1) {
    const row = result.get(index) as Record<string, unknown>;
    const column = String(row.col);
    byColumn.set(column, {
      column,
      distinctValues: Number(row.distinct_values) || 0,
      matchedValues: Number(row.matched_values) || 0,
      basemaps: toStringList(row.basemaps)
    });
  }

  return columns.map(
    (column) =>
      byColumn.get(column) ?? {
        column,
        distinctValues: 0,
        matchedValues: 0,
        basemaps: []
      }
  );
}
