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
import { selectVizFiltersForPrimitive } from '$lib/features/commons/utils/viz-filter.utils';

const dataFilterCache = new WeakMap<ArrowTable, Map<string, ArrowTable>>();

const tableFilterCache = new WeakMap<ArrowTable, Map<string, ArrowTable>>();

const FILTER_RESULT_CACHE_LIMIT_PER_TABLE = 16;

const warnedUnsupportedArrowOperators = new Set<string>();

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function normalizeComparableNumberText(value: string): string | null {
  const normalized = value.trim().replace(/[\s\u00a0\u202f']/g, '');
  if (!normalized) {
    return null;
  }

  const commaIndex = normalized.lastIndexOf(',');
  const dotIndex = normalized.lastIndexOf('.');
  if (commaIndex !== -1 && dotIndex !== -1) {
    return commaIndex > dotIndex
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '');
  }

  if (/^[-+]?\d{1,3}(,\d{3})+$/.test(normalized)) {
    return normalized.replace(/,/g, '');
  }

  if (/^[-+]?\d+,(\d{1,2}|\d{4,})$/.test(normalized)) {
    return normalized.replace(',', '.');
  }

  if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(normalized)) {
    return normalized.replace(/\./g, '');
  }

  return normalized;
}

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

  const numericValue = Number(normalizeComparableNumberText(normalized));
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function toDateOnlyDay(value: unknown): number | null {
  if (typeof value === 'string' && !ISO_DATE_ONLY_PATTERN.test(value.trim())) {
    return null;
  }

  const timestamp = toComparableNumber(value);
  return timestamp === null
    ? null
    : Math.floor(timestamp / MILLISECONDS_PER_DAY);
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
  if (operator === 'equals' || operator === 'not_equals') {
    const cellIsNumericOrDate =
      typeof cellValue === 'number' || cellValue instanceof Date;
    const filterDay = toDateOnlyDay(filterValue);
    const comparableCell =
      cellIsNumericOrDate && filterDay !== null
        ? toDateOnlyDay(cellValue)
        : cellIsNumericOrDate
          ? toComparableNumber(cellValue)
          : null;
    const comparableFilter =
      cellIsNumericOrDate && filterDay !== null
        ? filterDay
        : cellIsNumericOrDate
          ? toComparableNumber(filterValue)
          : null;
    const matches =
      comparableCell !== null && comparableFilter !== null
        ? comparableCell === comparableFilter
        : String(cellValue) === (filterValue ?? '');

    return operator === 'equals' ? matches : !matches;
  }

  const numCell = toComparableNumber(cellValue);
  const numFilter = toComparableNumber(filterValue);

  if (numCell === null || numFilter === null) {
    return false;
  }

  const cellDay = toDateOnlyDay(cellValue);
  const filterDay = toDateOnlyDay(filterValue);

  switch (operator) {
    case 'gte':
      if (cellDay !== null && filterDay !== null) {
        return cellDay >= filterDay;
      }
      return numCell >= numFilter;
    case 'lte':
      if (cellDay !== null && filterDay !== null) {
        return cellDay <= filterDay;
      }
      return numCell <= numFilter;
    case 'between': {
      const numSecondary = toComparableNumber(secondaryValue);
      if (numSecondary === null) return false;
      const secondaryDay = toDateOnlyDay(secondaryValue);
      if (cellDay !== null && filterDay !== null && secondaryDay !== null) {
        return cellDay >= filterDay && cellDay <= secondaryDay;
      }
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
  const perTableCache = cache.get(table);
  const cached = perTableCache?.get(cacheKey);
  if (!cached || !perTableCache) {
    return null;
  }

  // Touch for LRU: move this key to the most-recently-used end.
  perTableCache.delete(cacheKey);
  perTableCache.set(cacheKey, cached);
  return cached;
}

function cacheFilterResult(
  table: ArrowTable,
  cache: WeakMap<ArrowTable, Map<string, ArrowTable>>,
  cacheKey: string,
  result: ArrowTable
): void {
  const existing = cache.get(table);
  const perTableCache = existing ?? new Map<string, ArrowTable>();
  if (!existing) {
    cache.set(table, perTableCache);
  }

  perTableCache.delete(cacheKey);
  perTableCache.set(cacheKey, result);

  // Every distinct filter-value combination (e.g. each keystroke/slider tick)
  // would otherwise retain its own filtered table for as long as the source
  // table lives — evict the least-recently-used entry once the cap is hit.
  while (perTableCache.size > FILTER_RESULT_CACHE_LIMIT_PER_TABLE) {
    const oldestKey = perTableCache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    perTableCache.delete(oldestKey);
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
  const applicableFilters = selectVizFiltersForPrimitive(
    filters,
    primitiveType
  );
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
