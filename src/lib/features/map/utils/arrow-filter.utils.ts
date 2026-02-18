import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { Table } from 'apache-arrow/Arrow';
import type { YearFilter } from '$lib/features/commons/store/visualization.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

export function filterArrowTableByYear(
  table: ArrowTable,
  yearFilter: YearFilter | undefined
): ArrowTable {
  if (!yearFilter) return table;

  const { column, value } = yearFilter;
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
    return table;
  }

  logger.debug('Filtering Arrow table by year', LogCategory.MAP, {
    column,
    value: targetValue,
    totalRows: table.numRows,
    matchingRows: matchingIndices.length
  });

  const filteredBatches = table.batches
    .map((batch) => {
      const filteredRowIndices = matchingIndices.filter(
        (i) => i < batch.numRows
      );
      if (filteredRowIndices.length === 0) return null;
      return batch.select(filteredRowIndices);
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  if (filteredBatches.length === 0) {
    return table;
  }

  return new Table(table.schema, filteredBatches) as ArrowTable;
}
