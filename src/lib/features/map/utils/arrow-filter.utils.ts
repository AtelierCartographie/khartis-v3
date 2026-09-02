import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { Table } from 'apache-arrow/Arrow';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

const scopedTableCache = new WeakMap<
  ArrowTable,
  WeakMap<Set<number>, ArrowTable>
>();

const warnedTablesWithoutRowId = new WeakSet<ArrowTable>();

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

export function selectRowsInScope(
  table: ArrowTable,
  rowIds: Set<number> | null
): ArrowTable {
  if (!rowIds) {
    return table;
  }

  const cached = scopedTableCache.get(table)?.get(rowIds);
  if (cached) {
    return cached;
  }

  const rowIdVector = table.getChild(INTERNAL_COLUMN.ID);
  if (!rowIdVector) {
    if (!warnedTablesWithoutRowId.has(table)) {
      warnedTablesWithoutRowId.add(table);
      logger.warn(
        'Cannot scope a table without an internal row id; showing every row',
        LogCategory.MAP,
        { rowIdColumn: INTERNAL_COLUMN.ID }
      );
    }
    return table;
  }

  const indices: number[] = [];
  for (let rowIndex = 0; rowIndex < table.numRows; rowIndex += 1) {
    const rowId = rowIdVector.get(rowIndex);
    if (rowId !== null && rowId !== undefined && rowIds.has(Number(rowId))) {
      indices.push(rowIndex);
    }
  }

  const scoped =
    indices.length === table.numRows
      ? table
      : selectRowsByIndices(table, indices);

  const perTable =
    scopedTableCache.get(table) ?? new WeakMap<Set<number>, ArrowTable>();
  scopedTableCache.set(table, perTable);
  perTable.set(rowIds, scoped);

  return scoped;
}
