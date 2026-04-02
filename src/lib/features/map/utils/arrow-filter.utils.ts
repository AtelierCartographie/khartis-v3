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
    primitiveType?: string;
  }>
): string {
  return filters
    .map(
      (f) =>
        `${f.column}:${f.operator}:${f.value ?? ''}:${f.secondaryValue ?? ''}:${f.primitiveType ?? ''}`
    )
    .sort()
    .join('|');
}

/**
 * Build a new Arrow table containing only the rows at the given indices.
 * Uses table.slice() to preserve the original schema (including GeoArrow metadata).
 */
function selectRowsByIndices(table: ArrowTable, indices: number[]): ArrowTable {
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

  // Check multi-entry cache: same table + same filter params → cached result
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

  const numCell =
    typeof cellValue === 'number'
      ? cellValue
      : typeof cellValue === 'bigint'
        ? Number(cellValue)
        : parseFloat(String(cellValue));
  const numFilter = parseFloat(filterValue ?? '');

  if (isNaN(numCell) || isNaN(numFilter)) {
    return false;
  }

  switch (operator) {
    case 'gte':
      return numCell >= numFilter;
    case 'lte':
      return numCell <= numFilter;
    case 'between': {
      const numSecondary = parseFloat(secondaryValue ?? '');
      if (isNaN(numSecondary)) return false;
      return numCell >= numFilter && numCell <= numSecondary;
    }
    default:
      return true;
  }
}

export function filterArrowTableByDataFilters(
  table: ArrowTable,
  filters: VizDataFilter[] | undefined,
  primitiveType?: PrimitiveFilter
): ArrowTable {
  if (!filters?.length) return table;

  // Apply only filters matching the given primitiveType (or global filters with no type)
  const applicableFilters = primitiveType
    ? filters.filter(
        (f) => !f.primitiveType || f.primitiveType === primitiveType
      )
    : filters;
  if (!applicableFilters.length) return table;

  // Check multi-entry cache
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
      filters: validFilters.map((f) => `${f.column} ${f.operator} ${f.value}`)
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

  // Check multi-entry cache
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
