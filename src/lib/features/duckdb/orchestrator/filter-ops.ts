import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
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
    throw new DuckDBError(
      `Une valeur est nécessaire pour l'opérateur "${operator}"`
    );
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
      throw new DuckDBError('Veuillez préciser un nombre pour le filtre "top"');
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

    case 'between':
      if (filter.value === undefined || filter.secondaryValue === undefined) {
        throw new DuckDBError(
          'Deux valeurs sont nécessaires pour un filtre "compris entre"'
        );
      }
      return `${columnRef} BETWEEN ${value} AND ${secondValue}`;

    case 'top_asc':
      return buildTopFilter('ASC');

    case 'top_desc':
      return buildTopFilter('DESC');

    case 'empty':
      return `(${columnRef} IS NULL OR TRIM(${columnRef}::TEXT) = '')`;

    case 'not_empty':
      return `(${columnRef} IS NOT NULL AND TRIM(${columnRef}::TEXT) <> '')`;

    default:
      throw new DuckDBError(`Unsupported filter operator: ${filter.operator}`);
  }
}

export function describeFilter(filter: DataTableFilterInput): string {
  const column = filter.column;
  const value = filter.value ?? '';
  const valueLabel = typeof value === 'number' ? value : String(value).trim();
  const betweenLabel =
    filter.secondaryValue !== undefined
      ? `${valueLabel} et ${filter.secondaryValue}`
      : valueLabel;

  switch (filter.operator) {
    case 'gte':
      return `${column} ≥ ${valueLabel}`;

    case 'lte':
      return `${column} ≤ ${valueLabel}`;

    case 'contains':
      return `${column} contient "${valueLabel}"`;

    case 'equals':
      return `${column} = ${valueLabel}`;

    case 'not_equals':
      return `${column} ≠ ${valueLabel}`;

    case 'between':
      return `${column} entre ${betweenLabel}`;

    case 'top_asc':
      return `Top ${filter.limit ?? filter.value} valeurs les plus basses de ${column}`;

    case 'top_desc':
      return `Top ${filter.limit ?? filter.value} valeurs les plus hautes de ${column}`;

    case 'empty':
      return `${column} vide`;

    case 'not_empty':
      return `${column} non vide`;

    default:
      return `${column} (${filter.operator})`;
  }
}

export function createFilterRecord(
  tableName: string,
  input: DataTableFilterInput,
  filterId: string
): DataTableFilter {
  if (!input.column) {
    throw new DuckDBError('Column is required for filters');
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
