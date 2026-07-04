import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { Table } from 'apache-arrow/Arrow';
import type {
  VizDataFilter,
  VizFilterOperator,
  PrimitiveFilter
} from '$lib/features/commons/stores/visualization.store.svelte';
import type { DataTableFilter } from '$lib/features/duckdb/types';
import { FilterOperatorEnum } from '$lib/features/duckdb/types';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

const dataFilterCache = new WeakMap<ArrowTable, Map<string, ArrowTable>>();

const tableFilterCache = new WeakMap<ArrowTable, Map<string, ArrowTable>>();

const warnedUnsupportedArrowOperators = new Set<string>();

interface ArrowRowFilter {
  id: string;
  column: string;
  operator: FilterOperator;
  value?: string;
  secondaryValue?: string;
  limit?: number;
}

function buildFilterCacheKey(
  filters: Array<{
    column: string;
    operator: string;
    value?: string | number;
    secondaryValue?: string | number;
    limit?: string | number;
    primitiveType?: string;
  }>
): string {
  const normalized = filters
    .map((filter) => ({
      column: filter.column,
      operator: filter.operator,
      value: filter.value ?? null,
      secondaryValue: filter.secondaryValue ?? null,
      limit: filter.limit ?? null,
      primitiveType: filter.primitiveType ?? null
    }))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right))
    );

  return JSON.stringify(normalized);
}

export function selectRowsByIndices(
  table: ArrowTable,
  indices: number[]
): ArrowTable {
  if (indices.length === 0) {
    return table.slice(0, 0) as ArrowTable;
  }

  const ranges: [number, number][] = [];
  let rangeStart = indices[0];
  let rangeEnd = indices[0] + 1;

  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === rangeEnd) {
      rangeEnd++;
    } else {
      ranges.push([rangeStart, rangeEnd]);
      rangeStart = indices[i];
      rangeEnd = indices[i] + 1;
    }
  }
  ranges.push([rangeStart, rangeEnd]);

  const allBatches: InstanceType<typeof Table>['batches'] = [];
  for (const [start, end] of ranges) {
    const sliced = table.slice(start, end);
    allBatches.push(...sliced.batches);
  }

  return new Table(table.schema, allBatches) as ArrowTable;
}

type FilterOperator = VizFilterOperator | string;

function toComparableNumber(value: unknown): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  const numericValue = Number(normalized);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isFilterIncomplete(filter: VizDataFilter): boolean {
  const op = filter.operator;
  if (op === 'empty' || op === 'not_empty') return false;
  if (op === 'top_asc' || op === 'top_desc') {
    const limit = filter.limit ?? Number(filter.value);
    return !Number.isFinite(limit) || limit <= 0;
  }
  const trimmed = String(filter.value ?? '').trim();
  if (trimmed === '') return true;
  if (op === 'between') {
    const trimmedSecondary = String(filter.secondaryValue ?? '').trim();
    if (trimmedSecondary === '') return true;
  }
  return false;
}

function warnUnsupportedArrowFilterOperator(operator: FilterOperator): void {
  const operatorKey = String(operator);
  if (warnedUnsupportedArrowOperators.has(operatorKey)) {
    return;
  }

  warnedUnsupportedArrowOperators.add(operatorKey);
  logger.warn('Unsupported Arrow filter operator', LogCategory.MAP, {
    operator: operatorKey
  });
}

function matchesOperator(
  cellValue: unknown,
  operator: FilterOperator,
  filterValue: string | undefined,
  secondaryValue?: string
): boolean {
  if (operator === 'empty' || operator === FilterOperatorEnum.EMPTY) {
    return (
      cellValue === null ||
      cellValue === undefined ||
      String(cellValue).trim() === ''
    );
  }
  if (operator === 'not_empty' || operator === FilterOperatorEnum.NOT_EMPTY) {
    return (
      cellValue !== null &&
      cellValue !== undefined &&
      String(cellValue).trim() !== ''
    );
  }

  if (cellValue === null || cellValue === undefined) return false;

  if (operator === 'contains' || operator === FilterOperatorEnum.CONTAINS) {
    return String(cellValue)
      .toLowerCase()
      .includes(String(filterValue ?? '').toLowerCase());
  }
  if (operator === 'equals') {
    return String(cellValue) === (filterValue ?? '');
  }
  if (operator === 'not_equals') {
    return String(cellValue) !== (filterValue ?? '');
  }

  const numCell = toComparableNumber(cellValue);
  const numFilter = toComparableNumber(filterValue);

  if (numCell === null || numFilter === null) {
    return false;
  }

  switch (operator) {
    case 'gte':
      return numCell >= numFilter;
    case 'lte':
      return numCell <= numFilter;
    case 'between': {
      const numSecondary = toComparableNumber(secondaryValue);
      if (numSecondary === null) return false;
      return numCell >= numFilter && numCell <= numSecondary;
    }
    default:
      warnUnsupportedArrowFilterOperator(operator);
      return false;
  }
}

function getTopFilterMatchSet(
  table: ArrowTable,
  columnIndex: number,
  limitValue: number | undefined,
  direction: 'ASC' | 'DESC'
): Set<number> {
  if (!Number.isFinite(limitValue) || !limitValue || limitValue <= 0) {
    return new Set();
  }

  const columnVector = table.getChildAt(columnIndex);
  if (!columnVector) {
    return new Set();
  }

  const rankedRows: Array<{ index: number; value: number }> = [];

  for (let rowIndex = 0; rowIndex < table.numRows; rowIndex++) {
    const comparableValue = toComparableNumber(columnVector.get(rowIndex));
    if (comparableValue === null) {
      continue;
    }

    rankedRows.push({ index: rowIndex, value: comparableValue });
  }

  rankedRows.sort((left, right) => {
    const delta =
      direction === 'ASC' ? left.value - right.value : right.value - left.value;

    if (delta !== 0) {
      return delta;
    }

    return left.index - right.index;
  });

  return new Set(
    rankedRows.slice(0, Math.floor(limitValue)).map((entry) => entry.index)
  );
}

function getCachedFilterResult(
  table: ArrowTable,
  cache: WeakMap<ArrowTable, Map<string, ArrowTable>>,
  cacheKey: string
): ArrowTable | null {
  return cache.get(table)?.get(cacheKey) ?? null;
}

function cacheFilterResult(
  table: ArrowTable,
  cache: WeakMap<ArrowTable, Map<string, ArrowTable>>,
  cacheKey: string,
  result: ArrowTable
): void {
  const existing = cache.get(table);
  if (existing) {
    existing.set(cacheKey, result);
  } else {
    cache.set(table, new Map([[cacheKey, result]]));
  }
}

function filterRows(
  table: ArrowTable,
  filters: ArrowRowFilter[],
  cache: WeakMap<ArrowTable, Map<string, ArrowTable>>,
  cacheKey: string
): ArrowTable {
  const cached = getCachedFilterResult(table, cache, cacheKey);
  if (cached) return cached;

  const columnVectors = new Map<
    string,
    { index: number; vector: ReturnType<ArrowTable['getChildAt']> }
  >();

  for (const filter of filters) {
    if (columnVectors.has(filter.column)) continue;
    const colIndex = table.schema.fields.findIndex(
      (f) => f.name === filter.column
    );
    if (colIndex === -1) {
      continue;
    }
    const vector = table.getChildAt(colIndex);
    if (vector) {
      columnVectors.set(filter.column, { index: colIndex, vector });
    }
  }

  const validFilters = filters.filter((f) => columnVectors.has(f.column));
  if (validFilters.length === 0) return table;

  const topFilterMatches = new Map<string, Set<number>>();
  for (const filter of validFilters) {
    if (filter.operator !== 'top_asc' && filter.operator !== 'top_desc') {
      continue;
    }

    const column = columnVectors.get(filter.column);
    if (!column) {
      continue;
    }

    topFilterMatches.set(
      filter.id,
      getTopFilterMatchSet(
        table,
        column.index,
        filter.limit ?? toComparableNumber(filter.value) ?? undefined,
        filter.operator === 'top_asc' ? 'ASC' : 'DESC'
      )
    );
  }

  const matchingIndices: number[] = [];
  for (let i = 0; i < table.numRows; i++) {
    let matches = true;
    for (const filter of validFilters) {
      if (filter.operator === 'top_asc' || filter.operator === 'top_desc') {
        const matchingRows = topFilterMatches.get(filter.id);
        if (!matchingRows?.has(i)) {
          matches = false;
          break;
        }
        continue;
      }

      const col = columnVectors.get(filter.column)!;
      const cellValue = col.vector!.get(i);
      if (
        !matchesOperator(
          cellValue,
          filter.operator,
          filter.value,
          filter.secondaryValue
        )
      ) {
        matches = false;
        break;
      }
    }
    if (matches) {
      matchingIndices.push(i);
    }
  }

  if (matchingIndices.length === table.numRows) {
    cacheFilterResult(table, cache, cacheKey, table);
    return table;
  }

  const result = selectRowsByIndices(table, matchingIndices);
  cacheFilterResult(table, cache, cacheKey, result);
  return result;
}

export function filterArrowTableByDataFilters(
  table: ArrowTable,
  filters: VizDataFilter[] | undefined,
  primitiveType?: PrimitiveFilter
): ArrowTable {
  if (!filters?.length) return table;

  const applicableFilters = (
    primitiveType
      ? filters.filter(
          (f) => !f.primitiveType || f.primitiveType === primitiveType
        )
      : filters
  ).filter((f) => !isFilterIncomplete(f));
  if (!applicableFilters.length) return table;

  return filterRows(
    table,
    applicableFilters,
    dataFilterCache,
    buildFilterCacheKey(applicableFilters)
  );
}

const ARROW_COMPATIBLE_OPERATORS = new Set<string>([
  FilterOperatorEnum.GTE,
  FilterOperatorEnum.LTE,
  FilterOperatorEnum.CONTAINS,
  FilterOperatorEnum.EQUALS,
  FilterOperatorEnum.NOT_EQUALS,
  FilterOperatorEnum.BETWEEN,
  FilterOperatorEnum.EMPTY,
  FilterOperatorEnum.NOT_EMPTY
]);

export function filterArrowTableByTableFilters(
  table: ArrowTable,
  filters: DataTableFilter[] | undefined
): ArrowTable {
  if (!filters?.length) return table;

  const compatible = filters.filter((f) =>
    ARROW_COMPATIBLE_OPERATORS.has(f.operator)
  );
  if (compatible.length === 0) return table;

  const cacheKey = buildFilterCacheKey(compatible);
  return filterRows(
    table,
    compatible.map((filter) => ({
      id: filter.id,
      column: filter.column,
      operator: filter.operator,
      value: filter.value !== undefined ? String(filter.value) : undefined,
      secondaryValue:
        filter.secondaryValue !== undefined
          ? String(filter.secondaryValue)
          : undefined,
      limit: filter.limit
    })),
    tableFilterCache,
    cacheKey
  );
}
