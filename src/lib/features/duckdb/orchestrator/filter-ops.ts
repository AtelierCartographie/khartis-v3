import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import * as m from '$lib/paraglide/messages';
import type {
  DataTableFilter,
  DataTableFilterInput,
  FilterOperator
} from '../types';

export function formatFilterValue(value: string | number | undefined): string {
  if (value === undefined || value === null) {
    return 'NULL';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return `''`;
  }

  const numericValue = Number(trimmed);
  if (!Number.isNaN(numericValue) && trimmed === String(numericValue)) {
    return trimmed;
  }

  return `'${escapeSqlString(trimmed)}'`;
}

export function assertFilterValue(
  value: string | number | undefined,
  operator: FilterOperator
): void {
  if (value === undefined || value === null || `${value}`.trim() === '') {
    throw new DuckDBError(m.filter_value_required({ operator }));
  }
}

export function buildFilterSQL(
  tableName: string,
  filter: DataTableFilterInput
): string {
  const columnRef = `"${escapeIdentifier(filter.column)}"`;
  const value = formatFilterValue(filter.value);
  const secondValue = formatFilterValue(filter.secondaryValue);

  const buildTopFilter = (direction: 'ASC' | 'DESC'): string => {
    const limit = Number(filter.limit ?? filter.value);
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new DuckDBError(m.filter_top_requires_number());
    }
    return `__id IN (SELECT __id FROM "${tableName}" ORDER BY ${columnRef} ${direction} NULLS LAST LIMIT ${limit})`;
  };

  switch (filter.operator) {
    case 'gte':
      assertFilterValue(filter.value, filter.operator);
      return `${columnRef} >= ${value}`;

    case 'lte':
      assertFilterValue(filter.value, filter.operator);
      return `${columnRef} <= ${value}`;

    case 'contains':
      assertFilterValue(filter.value, filter.operator);
      return `${columnRef}::TEXT ILIKE '%' || ${value} || '%'`;

    case 'equals':
      assertFilterValue(filter.value, filter.operator);
      return `${columnRef} = ${value}`;

    case 'not_equals':
      assertFilterValue(filter.value, filter.operator);
      return `${columnRef} <> ${value}`;

    case 'between': {
      if (filter.value === undefined || filter.secondaryValue === undefined) {
        throw new DuckDBError(m.filter_between_requires_two_values());
      }
      const numMin = Number(filter.value);
      const numMax = Number(filter.secondaryValue);
      if (
        Number.isFinite(numMin) &&
        Number.isFinite(numMax) &&
        numMin > numMax
      ) {
        return `${columnRef} BETWEEN ${secondValue} AND ${value}`;
      }
      return `${columnRef} BETWEEN ${value} AND ${secondValue}`;
    }

    case 'top_asc':
      return buildTopFilter('ASC');

    case 'top_desc':
      return buildTopFilter('DESC');

    case 'empty':
      return `(${columnRef} IS NULL OR TRIM(${columnRef}::TEXT) = '')`;

    case 'not_empty':
      return `(${columnRef} IS NOT NULL AND TRIM(${columnRef}::TEXT) <> '')`;

    default:
      throw new DuckDBError(
        m.filter_operator_unsupported({ operator: filter.operator })
      );
  }
}

export function describeFilter(filter: DataTableFilterInput): string {
  const column = filter.column;
  const value = filter.value ?? '';
  const valueLabel = typeof value === 'number' ? value : String(value).trim();
  const betweenLabel =
    filter.secondaryValue !== undefined
      ? m.filter_between_values({
          first: valueLabel,
          second: String(filter.secondaryValue)
        })
      : valueLabel;

  switch (filter.operator) {
    case 'gte':
      return `${column} ≥ ${valueLabel}`;

    case 'lte':
      return `${column} ≤ ${valueLabel}`;

    case 'contains':
      return m.filter_label_contains({ column, value: valueLabel });

    case 'equals':
      return `${column} = ${valueLabel}`;

    case 'not_equals':
      return `${column} ≠ ${valueLabel}`;

    case 'between':
      return m.filter_label_between({ column, value: betweenLabel });

    case 'top_asc':
      return m.filter_label_top_asc({
        limit: String(filter.limit ?? filter.value ?? ''),
        column
      });

    case 'top_desc':
      return m.filter_label_top_desc({
        limit: String(filter.limit ?? filter.value ?? ''),
        column
      });

    case 'empty':
      return m.filter_label_empty({ column });

    case 'not_empty':
      return m.filter_label_not_empty({ column });

    default:
      return m.filter_label_fallback({
        column,
        operator: filter.operator
      });
  }
}

export function createFilterRecord(
  tableName: string,
  input: DataTableFilterInput,
  filterId: string
): DataTableFilter {
  if (!input.column) {
    throw new DuckDBError(m.filter_column_required());
  }

  const sql = buildFilterSQL(tableName, input);
  const label = describeFilter(input);

  return {
    ...input,
    id: filterId,
    label,
    sql
  };
}

export function buildFilterWhereClause(
  filters: DataTableFilter[] | undefined
): string | null {
  if (!filters || filters.length === 0) {
    return null;
  }

  return filters.map((filter) => filter.sql).join(' AND ');
}
