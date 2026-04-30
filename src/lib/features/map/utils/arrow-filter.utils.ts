import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { Table } from 'apache-arrow/Arrow';
import type {
  YearFilter,
  VizDataFilter,
  VizFilterOperator,
  PrimitiveFilter
} from '$lib/features/commons/store/visualization.store.svelte';
import type { DataTableFilter } from '$lib/features/duckdb/types';
import { FilterOperatorEnum } from '$lib/features/duckdb/types';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

/**
 * Multi-entry year filter cache.
 * WeakMap<sourceTable, Map<cacheKey, filteredTable>> allows caching multiple
 * year filter results per source table. When the user cycles between years
 * (e.g., 2020→2021→2020), the second visit to 2020 is a cache hit and returns
 * the same table reference — which in turn preserves downstream WeakMap caches
 * (GeoArrow binary parsing, GeoJSON conversion) and avoids costly re-parsing.
 */
const yearFilterCache = new WeakMap<ArrowTable, Map<string, ArrowTable>>();

/**
 * Multi-entry data filter cache (same pattern as yearFilterCache).
 * Prevents creating a new ArrowTable on every render when filters haven't changed,
 * preserving the downstream WeakMap cache chain (GeoArrow binary, GeoJSON, bounds).
 */
const dataFilterCache = new WeakMap<ArrowTable, Map<string, ArrowTable>>();

/**
 * Multi-entry table filter cache (same pattern as yearFilterCache).
 */
const tableFilterCache = new WeakMap<ArrowTable, Map<string, ArrowTable>>();

/** Build a stable, order-independent cache key from a list of filter descriptors. */
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
  return filters
    .map(
      (f) =>
        `${f.column}:${f.operator}:${f.value ?? ''}:${f.secondaryValue ?? ''}:${f.limit ?? ''}:${f.primitiveType ?? ''}`
    )
    .sort()
    .join('|');
}

/**
 * Build a new Arrow table containing only the rows at the given indices.
 * Uses table.slice() to preserve the original schema (including GeoArrow metadata).
 */
export function selectRowsByIndices(
  table: ArrowTable,
  indices: number[]
): ArrowTable {
  if (indices.length === 0) {
    return table.slice(0, 0) as ArrowTable;
  }

  // Group consecutive indices into ranges for efficient slicing
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

  // Slice for each range and collect batches
  const allBatches: InstanceType<typeof Table>['batches'] = [];
  for (const [start, end] of ranges) {
    const sliced = table.slice(start, end);
    allBatches.push(...sliced.batches);
  }

  return new Table(table.schema, allBatches) as ArrowTable;
}

export function filterArrowTableByYear(
  table: ArrowTable,
  yearFilter: YearFilter | undefined
): ArrowTable {
  if (!yearFilter) return table;

  const { column, value } = yearFilter;

  const cacheKey = `${column}:${value}`;
  const tableCache = yearFilterCache.get(table);
  if (tableCache) {
    const cached = tableCache.get(cacheKey);
    if (cached) return cached;
  }

  // Helper to cache pass-through results (including error states) so
  // repeated calls with the same invalid filter skip re-validation.
  function cacheYearResult(result: ArrowTable): void {
    const existing = yearFilterCache.get(table);
    if (existing) {
      existing.set(cacheKey, result);
    } else {
      yearFilterCache.set(table, new Map([[cacheKey, result]]));
    }
  }

  const columnIndex = table.schema.fields.findIndex(
    (field) => field.name === column
  );

  if (columnIndex === -1) {
    logger.warn('Year filter column not found in table', LogCategory.MAP, {
      column,
      availableColumns: table.schema.fields.map((f) => f.name)
    });
    cacheYearResult(table);
    return table;
  }

  const columnVector = table.getChildAt(columnIndex);
  if (!columnVector) {
    logger.warn('Year filter column vector not accessible', LogCategory.MAP, {
      column
    });
    cacheYearResult(table);
    return table;
  }

  const matchingIndices: number[] = [];
  const targetValue =
    typeof value === 'number' ? value : parseInt(String(value), 10);

  if (isNaN(targetValue)) {
    logger.warn('Year filter value is not a valid number', LogCategory.MAP, {
      value
    });
    cacheYearResult(table);
    return table;
  }

  for (let i = 0; i < table.numRows; i++) {
    const cellValue = columnVector.get(i);
    // Fast path: number > bigint > string fallback
    const numValue =
      typeof cellValue === 'number'
        ? cellValue
        : typeof cellValue === 'bigint'
          ? Number(cellValue)
          : parseInt(String(cellValue), 10);
    if (!isNaN(numValue) && numValue === targetValue) {
      matchingIndices.push(i);
    }
  }

  if (matchingIndices.length === 0) {
    logger.warn('Year filter returned no matching rows', LogCategory.MAP, {
      column,
      value: targetValue
    });
  }

  if (matchingIndices.length === table.numRows) {
    cacheYearResult(table);
    return table;
  }

  const result = selectRowsByIndices(table, matchingIndices);
  cacheYearResult(result);
  return result;
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
      return true;
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

export function filterArrowTableByDataFilters(
  table: ArrowTable,
  filters: VizDataFilter[] | undefined,
  primitiveType?: PrimitiveFilter
): ArrowTable {
  if (!filters?.length) return table;

  // Apply only filters matching the given primitiveType (or global filters with no type),
  // and skip filters that are not yet fully configured (e.g. empty value after creation)
  // so the map does not blank out while the user is still typing.
  const applicableFilters = (
    primitiveType
      ? filters.filter(
          (f) => !f.primitiveType || f.primitiveType === primitiveType
        )
      : filters
  ).filter((f) => !isFilterIncomplete(f));
  if (!applicableFilters.length) return table;

  const cacheKey = buildFilterCacheKey(applicableFilters);
  const tableCache = dataFilterCache.get(table);
  if (tableCache) {
    const cached = tableCache.get(cacheKey);
    if (cached) return cached;
  }

  const columnVectors = new Map<
    string,
    { index: number; vector: ReturnType<ArrowTable['getChildAt']> }
  >();

  for (const filter of applicableFilters) {
    if (columnVectors.has(filter.column)) continue;
    const colIndex = table.schema.fields.findIndex(
      (f) => f.name === filter.column
    );
    if (colIndex === -1) {
      logger.warn('Data filter column not found in table', LogCategory.MAP, {
        column: filter.column
      });
      continue;
    }
    const vector = table.getChildAt(colIndex);
    if (vector) {
      columnVectors.set(filter.column, { index: colIndex, vector });
    }
  }

  const validFilters = applicableFilters.filter((f) =>
    columnVectors.has(f.column)
  );
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

  function cacheDataResult(result: ArrowTable): void {
    const existing = dataFilterCache.get(table);
    if (existing) {
      existing.set(cacheKey, result);
    } else {
      dataFilterCache.set(table, new Map([[cacheKey, result]]));
    }
  }

  if (matchingIndices.length === table.numRows) {
    cacheDataResult(table);
    return table;
  }

  if (matchingIndices.length === 0) {
    logger.warn('Data filters returned no matching rows', LogCategory.MAP, {
      filters: validFilters.map((f) =>
        `${f.column} ${f.operator} ${f.limit ?? f.value ?? ''} ${f.secondaryValue ?? ''}`.trim()
      )
    });
  }

  const result = selectRowsByIndices(table, matchingIndices);
  cacheDataResult(result);
  return result;
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
  const tblCache = tableFilterCache.get(table);
  if (tblCache) {
    const cached = tblCache.get(cacheKey);
    if (cached) return cached;
  }

  const columnVectors = new Map<
    string,
    { index: number; vector: ReturnType<ArrowTable['getChildAt']> }
  >();

  for (const filter of compatible) {
    if (columnVectors.has(filter.column)) continue;
    const colIndex = table.schema.fields.findIndex(
      (f) => f.name === filter.column
    );
    if (colIndex === -1) continue;
    const vector = table.getChildAt(colIndex);
    if (vector) {
      columnVectors.set(filter.column, { index: colIndex, vector });
    }
  }

  const validFilters = compatible.filter((f) => columnVectors.has(f.column));
  if (validFilters.length === 0) return table;

  const matchingIndices: number[] = [];
  for (let i = 0; i < table.numRows; i++) {
    let matches = true;
    for (const filter of validFilters) {
      const col = columnVectors.get(filter.column)!;
      const cellValue = col.vector!.get(i);
      if (
        !matchesOperator(
          cellValue,
          filter.operator,
          filter.value !== undefined ? String(filter.value) : undefined,
          filter.secondaryValue !== undefined
            ? String(filter.secondaryValue)
            : undefined
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

  function cacheTableResult(result: ArrowTable): void {
    const existing = tableFilterCache.get(table);
    if (existing) {
      existing.set(cacheKey, result);
    } else {
      tableFilterCache.set(table, new Map([[cacheKey, result]]));
    }
  }

  if (matchingIndices.length === table.numRows) {
    cacheTableResult(table);
    return table;
  }

  const result = selectRowsByIndices(table, matchingIndices);
  cacheTableResult(result);
  return result;
}
