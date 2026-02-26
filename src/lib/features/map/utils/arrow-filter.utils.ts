import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { Table } from 'apache-arrow/Arrow';
import type {
  YearFilter,
  VizDataFilter,
  VizFilterOperator
} from '$lib/features/commons/store/visualization.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

interface YearFilterCacheEntry {
  column: string;
  value: number | string;
  result: ArrowTable;
}

const yearFilterCache = new WeakMap<ArrowTable, YearFilterCacheEntry>();

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

  // Check cache: same table reference + same filter params → return cached result
  const cached = yearFilterCache.get(table);
  if (cached && cached.column === column && cached.value === value) {
    return cached.result;
  }

  const columnIndex = table.schema.fields.findIndex(
    (field) => field.name === column
  );

  if (columnIndex === -1) {
    logger.warn('Year filter column not found in table', LogCategory.MAP, {
      column,
      availableColumns: table.schema.fields.map((f) => f.name)
    });
    return table;
  }

  const columnVector = table.getChildAt(columnIndex);
  if (!columnVector) {
    logger.warn('Year filter column vector not accessible', LogCategory.MAP, {
      column
    });
    return table;
  }

  const matchingIndices: number[] = [];
  const targetValue =
    typeof value === 'number' ? value : parseInt(String(value), 10);

  if (isNaN(targetValue)) {
    logger.warn('Year filter value is not a valid number', LogCategory.MAP, {
      value
    });
    return table;
  }

  for (let i = 0; i < table.numRows; i++) {
    const cellValue = columnVector.get(i);
    const numValue =
      typeof cellValue === 'number'
        ? cellValue
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
    yearFilterCache.set(table, { column, value, result: table });
    return table;
  }

  logger.debug('Filtering Arrow table by year', LogCategory.MAP, {
    column,
    value: targetValue,
    totalRows: table.numRows,
    matchingRows: matchingIndices.length
  });

  const result = selectRowsByIndices(table, matchingIndices);
  yearFilterCache.set(table, { column, value, result });
  return result;
}

function matchesOperator(
  cellValue: unknown,
  operator: VizFilterOperator,
  filterValue: string,
  secondaryValue?: string
): boolean {
  if (cellValue === null || cellValue === undefined) return false;

  if (operator === 'equals') {
    return String(cellValue) === filterValue;
  }
  if (operator === 'not_equals') {
    return String(cellValue) !== filterValue;
  }

  const numCell =
    typeof cellValue === 'number' ? cellValue : parseFloat(String(cellValue));
  const numFilter = parseFloat(filterValue);

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
  filters: VizDataFilter[] | undefined
): ArrowTable {
  if (!filters?.length) return table;

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

  const validFilters = filters.filter((f) => columnVectors.has(f.column));
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

  if (matchingIndices.length === table.numRows) {
    return table;
  }

  logger.debug('Filtering Arrow table by data filters', LogCategory.MAP, {
    filterCount: validFilters.length,
    totalRows: table.numRows,
    matchingRows: matchingIndices.length
  });

  if (matchingIndices.length === 0) {
    logger.warn('Data filters returned no matching rows', LogCategory.MAP, {
      filters: validFilters.map((f) => `${f.column} ${f.operator} ${f.value}`)
    });
  }

  return selectRowsByIndices(table, matchingIndices);
}
