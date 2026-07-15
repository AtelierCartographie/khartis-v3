import * as m from '$lib/paraglide/messages';
import type { ProcessedDataset } from '$lib/features/data-pipeline';
import { type AnalysisResult } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { SvelteMap } from 'svelte/reactivity';
import {
  isTextLikeColumnType,
  projectHtmlLikeText
} from '../../../utils/html-like-text.utils';
import { LogCategory, logger } from '../../../utils/logger';
import { EXCLUDED_COLUMNS } from '../../../constants/data.constants';
import type { ColumnInfo, SortOrder, TableRow } from '../types';
import {
  isMissingRequestedTableError,
  isRequestedTableAvailable,
  resolveHookValue,
  type HookValue
} from './table-hook.utils';

export interface UseTableDataProps {
  tableName?: HookValue<string | undefined>;
  dataset?: HookValue<ProcessedDataset | undefined>;
  startIndex: HookValue<number>;
  rowIndices: HookValue<number[]>;
  sortColumn?: HookValue<string | null>;
  sortOrder?: HookValue<SortOrder>;
}

export interface UseTableDataReturn {
  columns: ColumnInfo[];
  columnAnalysis: Map<string, AnalysisResult>;
  tableData: TableRow[];
  numRows: number;
  isLoading: boolean;
  isLoadingRows: boolean;
  isFullyLoaded: boolean;
  error: string | null;
  loadColumnsInfo: () => Promise<void>;
  loadRowsData: () => Promise<void>;
  validateSortColumn: (
    currentSortColumn: string | null,
    onReset: () => void
  ) => void;
}

function normalizeRowId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : undefined;
  }

  return undefined;
}

function compareValues(
  aVal: unknown,
  bVal: unknown,
  sortOrder: SortOrder,
  columnType: string | null | undefined
): number {
  if (aVal == null && bVal == null) return 0;
  if (aVal == null) return sortOrder === 'ASC' ? 1 : -1;
  if (bVal == null) return sortOrder === 'ASC' ? -1 : 1;

  if (isTextLikeColumnType(columnType)) {
    const aText =
      typeof aVal === 'string' ? projectHtmlLikeText(aVal) : String(aVal);
    const bText =
      typeof bVal === 'string' ? projectHtmlLikeText(bVal) : String(bVal);

    if (aText < bText) return sortOrder === 'ASC' ? -1 : 1;
    if (aText > bText) return sortOrder === 'ASC' ? 1 : -1;
    return 0;
  }

  if (aVal < bVal) return sortOrder === 'ASC' ? -1 : 1;
  if (aVal > bVal) return sortOrder === 'ASC' ? 1 : -1;
  return 0;
}

export function useTableData(props: UseTableDataProps): UseTableDataReturn {
  let columns = $state<ColumnInfo[]>([]);
  let columnAnalysis = new SvelteMap<string, AnalysisResult>();
  let tableData = $state<TableRow[]>([]);
  let numRows = $state<number>(0);
  let isLoading = $state<boolean>(false);
  let isLoadingRows = $state<boolean>(false);
  let initialLoadComplete = $state<boolean>(false);
  let error = $state<string | null>(null);
  let columnsRequestId = 0;
  let rowsRequestId = 0;

  function isRequestStale(requestId: number, activeRequestId: number): boolean {
    return requestId !== activeRequestId;
  }

  function shouldIgnoreTransientTableError(
    err: unknown,
    requestId: number,
    activeRequestId: number,
    requestedTableName: string | undefined,
    _requestedDatasetId: string | undefined
  ): boolean {
    if (isRequestStale(requestId, activeRequestId)) {
      return true;
    }

    return isMissingRequestedTableError(err, requestedTableName);
  }

  async function loadColumnsInfo(): Promise<void> {
    const tableName = resolveHookValue(props.tableName);
    const dataset = resolveHookValue(props.dataset);
    const requestedDatasetId = dataset?.id;
    const requestId = ++columnsRequestId;

    try {
      isLoading = true;
      initialLoadComplete = false;
      error = null;

      columns = [];
      tableData = [];
      columnAnalysis = new SvelteMap();

      if (tableName) {
        const analysis = await duckDBOrchestrator.getFullAnalysis(tableName);
        if (isRequestStale(requestId, columnsRequestId)) {
          return;
        }

        if (!isRequestedTableAvailable(tableName)) {
          columns = [];
          columnAnalysis = new SvelteMap();
          numRows = 0;
          return;
        }

        const filteredAnalysis = analysis.filter(
          (a: AnalysisResult) =>
            !(EXCLUDED_COLUMNS as readonly string[]).includes(a.name)
        );

        columns = filteredAnalysis.map((a: AnalysisResult) => ({
          name: a.name,
          type: a.type_simple
        }));

        const analysisMap = new SvelteMap<string, AnalysisResult>();
        filteredAnalysis.forEach((a: AnalysisResult) => {
          analysisMap.set(a.name, a);
        });
        columnAnalysis = analysisMap;

        if (!isRequestedTableAvailable(tableName)) {
          columns = [];
          columnAnalysis = new SvelteMap();
          numRows = 0;
          return;
        }

        const count = await duckDBOrchestrator.getFilteredRowCount(tableName);
        if (isRequestStale(requestId, columnsRequestId)) {
          return;
        }
        numRows = count;
      } else if (dataset) {
        columns = dataset.columns.filter(
          (c) => !(EXCLUDED_COLUMNS as readonly string[]).includes(c.name)
        );

        numRows = dataset.data.length;
        columnAnalysis = new SvelteMap();
      } else {
        columns = [];
        columnAnalysis = new SvelteMap();
        numRows = 0;
      }
    } catch (err) {
      if (
        shouldIgnoreTransientTableError(
          err,
          requestId,
          columnsRequestId,
          tableName,
          requestedDatasetId
        )
      ) {
        error = null;
        columns = [];
        columnAnalysis = new SvelteMap();
        numRows = 0;
        return;
      }

      logger.error('Error loading columns info', LogCategory.UI, err);
      error =
        err instanceof Error ? err.message : m.history_failed_load_columns();
      columns = [];
      columnAnalysis = new SvelteMap();
      numRows = 0;
    } finally {
      if (requestId === columnsRequestId) {
        isLoading = false;
      }
    }
  }

  async function loadRowsData(): Promise<void> {
    const tableName = resolveHookValue(props.tableName);
    const dataset = resolveHookValue(props.dataset);
    const requestedDatasetId = dataset?.id;
    const rowIndices = resolveHookValue(props.rowIndices);
    const sortColumn = resolveHookValue(props.sortColumn);
    const sortOrder = resolveHookValue(props.sortOrder);
    const requestId = ++rowsRequestId;

    if (!tableName && !dataset) {
      tableData = [];
      return;
    }

    if (rowIndices.length === 0) {
      tableData = [];
      initialLoadComplete = true;
      return;
    }

    try {
      isLoadingRows = true;
      const sortColumnType =
        sortColumn !== null && sortColumn !== undefined
          ? (columns.find((column) => column.name === sortColumn)?.type ?? null)
          : null;

      if (tableName) {
        if (!isRequestedTableAvailable(tableName)) {
          tableData = [];
          return;
        }

        const data = await duckDBOrchestrator.getTableData(tableName, {
          offset: rowIndices[0],
          limit: rowIndices.length,
          orderBy: sortColumn,
          orderByType: sortColumnType,
          order: sortOrder
        });
        if (isRequestStale(requestId, rowsRequestId)) {
          return;
        }

        if (data && data.numRows > 0) {
          const rows: TableRow[] = [];
          for (let i = 0; i < data.numRows; i++) {
            const rowProxy = data.get(i);
            const row: Record<string, unknown> = {};

            for (const col of columns) {
              row[col.name] = rowProxy[col.name];
            }

            const normalizedRowId = normalizeRowId(rowProxy.__id);

            if (normalizedRowId !== undefined) {
              row.__id = normalizedRowId;
            }

            rows.push(row);
          }
          tableData = rows;
        } else {
          tableData = [];
        }
      } else if (dataset) {
        let sourceData = dataset.data;
        if (sortColumn && sortOrder) {
          sourceData = [...dataset.data].sort((a, b) => {
            const datasetColumnType =
              dataset.columns.find((column) => column.name === sortColumn)
                ?.type ?? sortColumnType;

            return compareValues(
              a[sortColumn],
              b[sortColumn],
              sortOrder,
              datasetColumnType
            );
          });
        }
        const startIdx = rowIndices[0];
        const endIdx = startIdx + rowIndices.length;
        tableData = sourceData.slice(startIdx, endIdx);
      }
    } catch (err) {
      if (
        shouldIgnoreTransientTableError(
          err,
          requestId,
          rowsRequestId,
          tableName,
          requestedDatasetId
        )
      ) {
        error = null;
        tableData = [];
        return;
      }

      logger.error('Error loading row data', LogCategory.UI, err);
      error = err instanceof Error ? err.message : m.history_failed_load_data();
      tableData = [];
    } finally {
      if (requestId === rowsRequestId) {
        isLoadingRows = false;
      }
      if (requestId === rowsRequestId && !initialLoadComplete) {
        initialLoadComplete = true;
      }
    }
  }

  function validateSortColumn(
    currentSortColumn: string | null,
    onReset: () => void
  ): void {
    if (
      currentSortColumn &&
      !columns.some((c) => c.name === currentSortColumn)
    ) {
      onReset();
    }
  }

  return {
    get columns() {
      return columns;
    },
    get columnAnalysis() {
      return columnAnalysis;
    },
    get tableData() {
      return tableData;
    },
    get numRows() {
      return numRows;
    },
    get isLoading() {
      return isLoading;
    },
    get isLoadingRows() {
      return isLoadingRows;
    },
    get isFullyLoaded() {
      return initialLoadComplete;
    },
    get error() {
      return error;
    },
    loadColumnsInfo,
    loadRowsData,
    validateSortColumn
  };
}
