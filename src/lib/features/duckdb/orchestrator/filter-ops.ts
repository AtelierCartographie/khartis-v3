import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { isTextLikeColumnType } from '$lib/features/commons/utils/html-like-text.utils';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import * as m from '$lib/paraglide/messages';
import { buildStripHtmlTextSqlExpression } from '../html-like-text';
import type {
  DataTableFilter,
  DataTableFilterInput,
  FilterOperator
} from '../types';
import { FilterOperatorEnum } from '../types';

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

function isNumericLiteral(formatted: string): boolean {
  return formatted !== 'NULL' && !formatted.startsWith("'");
}

function formatTextFilterValue(value: string | number | undefined): string {
  if (value === undefined || value === null) {
    return 'NULL';
  }

  const trimmed = String(value).trim();
  if (trimmed === '') {
    return `''`;
  }

  return `'${escapeSqlString(trimmed)}'`;
}

export function buildFilterSQL(
  tableName: string,
  filter: DataTableFilterInput
): string {
  const columnRef = `"${escapeIdentifier(filter.column)}"`;
  const textRef = buildStripHtmlTextSqlExpression(columnRef);
  const value = formatFilterValue(filter.value);
  const secondValue = formatFilterValue(filter.secondaryValue);
  const textValue = formatTextFilterValue(filter.value);

  const buildTopFilter = (direction: 'ASC' | 'DESC'): string => {
    const limit = Number(filter.limit ?? filter.value);
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new DuckDBError(m.filter_top_requires_number());
    }
    return `${INTERNAL_COLUMN.ID} IN (SELECT ${INTERNAL_COLUMN.ID} FROM "${tableName}" ORDER BY ${columnRef} ${direction} NULLS LAST LIMIT ${limit})`;
  };

  const isNumericValue = isNumericLiteral(value);
  const isNumericSecond = isNumericLiteral(secondValue);
  const numericRef = `TRY_CAST(${columnRef} AS DOUBLE)`;
  const usesTextProjection = isTextLikeColumnType(filter.columnType);

  switch (filter.operator) {
    case FilterOperatorEnum.GTE:
      assertFilterValue(filter.value, filter.operator);
      return isNumericValue
        ? `${numericRef} >= ${value}`
        : `${columnRef} >= ${value}`;

    case FilterOperatorEnum.LTE:
      assertFilterValue(filter.value, filter.operator);
      return isNumericValue
        ? `${numericRef} <= ${value}`
        : `${columnRef} <= ${value}`;

    case FilterOperatorEnum.CONTAINS:
      assertFilterValue(filter.value, filter.operator);
      return usesTextProjection
        ? `${textRef} ILIKE '%' || ${textValue} || '%'`
        : `${columnRef}::TEXT ILIKE '%' || ${textValue} || '%'`;

    case FilterOperatorEnum.EQUALS:
      assertFilterValue(filter.value, filter.operator);
      return usesTextProjection
        ? `${textRef} = ${textValue}`
        : `${columnRef} = ${value}`;

    case FilterOperatorEnum.NOT_EQUALS:
      assertFilterValue(filter.value, filter.operator);
      return usesTextProjection
        ? `${textRef} <> ${textValue}`
        : `${columnRef} <> ${value}`;

    case FilterOperatorEnum.BETWEEN: {
      if (filter.value === undefined || filter.secondaryValue === undefined) {
        throw new DuckDBError(m.filter_between_requires_two_values());
      }
      const numMin = Number(filter.value);
      const numMax = Number(filter.secondaryValue);
      const useNumericCast = isNumericValue && isNumericSecond;
      const ref = useNumericCast ? numericRef : columnRef;
      if (
        Number.isFinite(numMin) &&
        Number.isFinite(numMax) &&
        numMin > numMax
      ) {
        return `${ref} BETWEEN ${secondValue} AND ${value}`;
      }
      return `${ref} BETWEEN ${value} AND ${secondValue}`;
    }

    case FilterOperatorEnum.TOP_ASC:
      return buildTopFilter('ASC');

    case FilterOperatorEnum.TOP_DESC:
      return buildTopFilter('DESC');

    case FilterOperatorEnum.EMPTY:
      return usesTextProjection
        ? `(${columnRef} IS NULL OR ${textRef} = '')`
        : `(${columnRef} IS NULL OR TRIM(${columnRef}::TEXT) = '')`;

    case FilterOperatorEnum.NOT_EMPTY:
      return usesTextProjection
        ? `(${columnRef} IS NOT NULL AND ${textRef} <> '')`
        : `(${columnRef} IS NOT NULL AND TRIM(${columnRef}::TEXT) <> '')`;

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
    case FilterOperatorEnum.GTE:
      return `${column} ≥ ${valueLabel}`;

    case FilterOperatorEnum.LTE:
      return `${column} ≤ ${valueLabel}`;

    case FilterOperatorEnum.CONTAINS:
      return m.filter_label_contains({ column, value: valueLabel });

    case FilterOperatorEnum.EQUALS:
      return `${column} = ${valueLabel}`;

    case FilterOperatorEnum.NOT_EQUALS:
      return `${column} ≠ ${valueLabel}`;

    case FilterOperatorEnum.BETWEEN:
      return m.filter_label_between({ column, value: betweenLabel });

    case FilterOperatorEnum.TOP_ASC:
      return m.filter_label_top_asc({
        limit: String(filter.limit ?? filter.value ?? ''),
        column
      });

    case FilterOperatorEnum.TOP_DESC:
      return m.filter_label_top_desc({
        limit: String(filter.limit ?? filter.value ?? ''),
        column
      });

    case FilterOperatorEnum.EMPTY:
      return m.filter_label_empty({ column });

    case FilterOperatorEnum.NOT_EMPTY:
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
