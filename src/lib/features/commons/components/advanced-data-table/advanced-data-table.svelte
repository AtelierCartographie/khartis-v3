<script lang="ts">
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import type { ProcessedDataset } from '$lib/features/data-pipeline';
  import { RefineOperation } from '$lib/features/duckdb';
  import * as m from '$lib/paraglide/messages';
  import { DataTableSkeleton } from 'carbon-components-svelte';
  import { onMount, untrack } from 'svelte';
  import { LogCategory, logger } from '../../utils/logger';

  import { useColumnOperations } from './hooks/use-column-operations.svelte';
  import { useRowSelection } from './hooks/use-row-selection.svelte';
  import { useTableData } from './hooks/use-table-data.svelte';
  import { useTableFilters } from './hooks/use-table-filters.svelte';
  import { useTableSort } from './hooks/use-table-sort.svelte';
  import { useVirtualScroll } from './hooks/use-virtual-scroll.svelte';
  import { TABLE_ROW_HEIGHT } from './types';

  import TableColumnHeader from './components/TableColumnHeader.svelte';
  import TableHeaderInfo from './components/TableHeaderInfo.svelte';
  import TableRow from './components/TableRow.svelte';

  export type HighlightType =
    | 'exact'
    | 'contains'
    | 'partial'
    | 'current'
    | null;

  export interface CellHighlight {
    rowId: number;
    columnName: string;
    type: 'exact' | 'contains' | 'partial';
  }

  interface Props {
    dataset?: ProcessedDataset;
    tableName?: string;
    cellHighlights?: CellHighlight[];
    currentCell?: { rowId: number; columnName: string } | null;
    highlightedRowIds?: number[];
    showSummaryPlots?: boolean;
    maxRows?: number;
    isExpanded?: boolean;
    isSelectable?: boolean;
    isReadOnly?: boolean;
    datasetVersion?: number;
    onSelectionChange?: (selectedIds: number[], count: number) => void;
  }

  let {
    dataset,
    tableName,
    cellHighlights = [],
    currentCell = null,
    highlightedRowIds = [],
    showSummaryPlots = true,
    maxRows,
    isExpanded = false,
    isSelectable = false,
    isReadOnly = false,
    datasetVersion,
    onSelectionChange
  }: Props = $props();

  let tableContainer = $state<HTMLDivElement | undefined>(undefined);
  let viewportHeight = $state(
    typeof window !== 'undefined' ? window.innerHeight : 800
  );

  const rowHeight = TABLE_ROW_HEIGHT;
  const viewportHeightRatioNormal = 0.4;
  const viewportHeightRatioExpanded = 0.65;
  const viewportHeightRatio = $derived(
    isExpanded ? viewportHeightRatioExpanded : viewportHeightRatioNormal
  );
  const maxViewportHeight = $derived(
    Math.floor(viewportHeight * viewportHeightRatio)
  );
  const computedMaxRows = $derived(Math.floor(maxViewportHeight / rowHeight));
  const effectiveMaxRows = $derived(maxRows ?? computedMaxRows);
  const maxHeight = $derived((effectiveMaxRows + 1) * rowHeight);
  const hasDataSource = $derived(!!dataset || !!tableName);
  const isEditMode = $derived(!!tableName && !isReadOnly);

  function recordTransformation(summary: string) {
    if (!dataset?.id) return;
    datasetsStore.recordTransformation(dataset.id, summary);
  }

  async function recordProjectTransformation(
    type: 'refine',
    column: string,
    newValue?: string
  ) {
    if (!dataset?.sourceFileId) return;
    await projectStore.addColumnTransformation(dataset.sourceFileId, {
      type,
      column,
      newValue,
      timestamp: new Date().toISOString()
    });
  }

  const sort = useTableSort({
    onSortChange: async () => {
      await virtualScroll.initializeRows(0);
      if (tableContainer) {
        tableContainer.scrollTop = 0;
      }
    }
  });

  const tableData = useTableData({
    tableName: () => tableName,
    dataset: () => dataset,
    startIndex: () => virtualScroll.startIndex,
    rowIndices: () => virtualScroll.rows,
    sortColumn: () => sort.sortColumn,
    sortOrder: () => sort.sortOrder
  });

  const filters = useTableFilters({
    tableName: () => tableName,
    dataset: () => dataset,
    onRecordTransformation: recordTransformation
  });

  const virtualScroll = useVirtualScroll({
    numRows: () => filters.numRows,
    maxRows: () => effectiveMaxRows,
    onLoadMore: async () => {
      await tableData.loadRowsData();
    }
  });

  const columnOps = useColumnOperations({
    tableName: () => tableName,
    columns: () => tableData.columns,
    onColumnsChange: async () => {
      await tableData.loadColumnsInfo();
      await virtualScroll.initializeRows(virtualScroll.startIndex);
    },
    onColumnRefined: async () => {
      await filters.refreshFiltersState();
      await tableData.loadRowsData();
    },
    onRecordTransformation: recordTransformation
  });

  const rowSelection = useRowSelection({
    onSelectionChange: (ids, count) => {
      onSelectionChange?.(ids, count);
    }
  });

  const showEmptyState = $derived(
    !hasDataSource && tableData.columns.length === 0
  );
  const showFilteredEmptyState = $derived(
    tableData.isFullyLoaded &&
      hasDataSource &&
      filters.numRows === 0 &&
      filters.filterStats.total > 0
  );

  async function handleSort(column: string, order: 'ASC' | 'DESC') {
    sort.sortTable(column, order);
  }

  async function handleRefine(columnName: string, operation: RefineOperation) {
    isLocalUpdate = true;
    try {
      await columnOps.handleRefine(columnName, operation);
      await recordProjectTransformation('refine', columnName, operation);
    } catch (e) {
      isLocalUpdate = false;
      throw e;
    } finally {
      setTimeout(() => {
        isLocalUpdate = false;
      }, 100);
    }
  }

  function getCellHighlightType(
    rowId: number,
    columnName: string
  ): HighlightType {
    if (
      currentCell?.rowId === rowId &&
      currentCell?.columnName === columnName
    ) {
      return 'current';
    }
    const highlight = cellHighlights.find(
      (h) => h.rowId === rowId && h.columnName === columnName
    );
    return highlight?.type ?? null;
  }

  function getRowHighlightType(
    rowIndex: number,
    row: Record<string, unknown>
  ): HighlightType {
    const rowId = (row.__id as number | undefined) ?? rowIndex + 1;
    if (currentCell?.rowId === rowId) return 'current';
    if (highlightedRowIds.includes(rowId)) return 'partial';
    return null;
  }

  onMount(() => {
    logger.debug('AdvancedDataTable mounted', LogCategory.UI, {
      tableName,
      datasetId: dataset?.id
    });

    const handleResize = () => {
      viewportHeight = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  });

  $effect(() => {
    if (currentCell && filters.numRows > 0) {
      untrack(() => {
        // Scroll vertical to the row
        virtualScroll.goToId(currentCell.rowId);

        // Scroll horizontal to the column after DOM update
        setTimeout(() => {
          const cellSelector = `td[data-column="${currentCell.columnName}"]`;
          const cell = tableContainer?.querySelector(cellSelector);
          cell?.scrollIntoView({
            behavior: 'smooth',
            inline: 'center',
            block: 'nearest'
          });
        }, 50);
      });
    }
  });

  let lastDatasetId: string | undefined = undefined;
  let lastTableName: string | undefined = undefined;
  let lastColumnsRef: unknown[] | undefined = undefined;
  let lastDatasetVersion: number | undefined = undefined;
  let isLocalUpdate = false;

  $effect(() => {
    const currentTableName = tableName;
    const currentDataset = dataset;
    const currentDatasetId = currentDataset?.id;
    const currentColumnsRef = currentDataset?.columns;
    const currentDatasetVersion = datasetVersion;

    const datasetChanged = currentDatasetId !== lastDatasetId;
    const tableChanged = currentTableName !== lastTableName;
    const columnsChanged = currentColumnsRef !== lastColumnsRef;
    const versionChanged = currentDatasetVersion !== lastDatasetVersion;

    if (
      !datasetChanged &&
      !tableChanged &&
      !columnsChanged &&
      !versionChanged
    ) {
      return;
    }

    lastDatasetId = currentDatasetId;
    lastTableName = currentTableName;
    lastColumnsRef = currentColumnsRef;
    lastDatasetVersion = currentDatasetVersion;

    if (isLocalUpdate) {
      logger.debug('Ignoring update due to local update', LogCategory.UI);
      return;
    }

    if (currentDataset || currentTableName) {
      untrack(async () => {
        logger.debug('$effect: reloading table data', LogCategory.UI, {
          tableName: currentTableName,
          datasetId: currentDataset?.id
        });

        try {
          await tableData.loadColumnsInfo();
          await filters.refreshFiltersState();
          await virtualScroll.initializeRows(0);

          logger.debug('$effect: table data reloaded', LogCategory.UI, {
            rowCount: virtualScroll.rows.length,
            tableDataLength: tableData.tableData.length
          });
        } catch (err) {
          logger.error('Error reloading table data', LogCategory.UI, err);
        }
      });
    }
  });

  $effect(() => {
    virtualScroll.setTableContainer(tableContainer);
  });

  let expandEffectInitialized = $state(false);
  $effect(() => {
    const _currentIsExpanded = isExpanded;
    if (!expandEffectInitialized) {
      expandEffectInitialized = true;
      return;
    }
    untrack(async () => {
      await virtualScroll.initializeRows(virtualScroll.startIndex);
    });
  });

  const skeletonRowHeight = 32;
  const skeletonRows = $derived(
    Math.floor((effectiveMaxRows * rowHeight) / skeletonRowHeight)
  );

  const getSkeletonProps = () =>
    ({
      columns: 5,
      rows: skeletonRows,
      size: 'compact',
      showHeader: false,
      showToolbar: false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Carbon DataTableSkeleton has complex generic types
    }) as any;
</script>

<div class="advanced-data-table">
  {#if tableData.isFullyLoaded && filters.numRows > 0 && !isReadOnly}
    <TableHeaderInfo filterStats={filters.filterStats} />
  {/if}

  {#if tableData.error}
    <div class="error-message">
      <p>Erreur: {tableData.error}</p>
    </div>
  {:else if showEmptyState}
    <div class="empty-state">
      <p>Aucune donnée disponible</p>
    </div>
  {:else if showFilteredEmptyState}
    <div class="empty-state">
      <p>{m.no_results_match_filters()}</p>
    </div>
  {:else}
    <div class="table-wrapper">
      <div
        class="table-container"
        style="max-height: {maxHeight}px;"
        bind:this={tableContainer}
        onscroll={virtualScroll.handleScroll}
      >
        <table>
          <thead>
            <tr>
              {#if isSelectable && isEditMode}
                <th class="selection-header-spacer"></th>
              {/if}
              {#each columnOps.visibleColumns as column (column.name)}
                <TableColumnHeader
                  column={column}
                  analysis={tableData.columnAnalysis.get(column.name)}
                  columnAnalysis={tableData.columnAnalysis}
                  sortColumn={sort.sortColumn}
                  sortOrder={sort.sortOrder}
                  showSummaryPlots={showSummaryPlots}
                  isEditMode={isEditMode}
                  onSort={handleSort}
                  onRefine={handleRefine}
                />
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each tableData.tableData as row, i (virtualScroll.rows[i] ?? `row-${i}`)}
              {@const rowIndex = virtualScroll.rows[i] ?? i}
              {@const rowId = (row.__id as number | undefined) ?? rowIndex + 1}
              <TableRow
                row={row}
                rowIndex={rowIndex}
                visibleColumns={columnOps.visibleColumns}
                highlightType={getRowHighlightType(rowIndex, row)}
                getCellHighlight={(colName) =>
                  getCellHighlightType(rowId, colName)}
                isSelectable={isSelectable && isEditMode}
                isSelected={rowSelection.isRowSelected(rowId)}
                onToggleSelection={rowSelection.toggleRowSelection}
              />
            {/each}
          </tbody>
        </table>
      </div>

      {#if !tableData.isFullyLoaded}
        <div class="skeleton-overlay" style="max-height: {maxHeight}px;">
          <DataTableSkeleton {...getSkeletonProps()} />
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .advanced-data-table {
    background-color: var(--cds-ui-background);
    padding: var(--cds-spacing-05);
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .table-wrapper {
    position: relative;
  }

  .table-container {
    overflow-y: auto;
    overflow-x: auto;
    background-color: var(--cds-ui-01);
    border: 1px solid var(--cds-ui-03);
    border-radius: 4px;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }

  table :global {
    td,
    th {
      text-overflow: ellipsis;
      min-width: 150px;
      max-width: 150px;
      overflow: hidden;
    }
  }

  thead {
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: var(--cds-ui-02);
  }

  .selection-header-spacer {
    width: 40px;
    min-width: 40px;
    max-width: 40px;
    height: 30px;
    padding: 0;
    border-bottom: 2px solid var(--cds-ui-03);
    background-color: var(--cds-ui-02);
    position: sticky;
    left: 0;
    z-index: 1;
  }

  .skeleton-overlay {
    position: absolute;
    inset: 0;
    background-color: var(--cds-ui-background);
    z-index: 20;
    overflow: hidden;
  }

  .empty-state,
  .error-message {
    padding: var(--cds-spacing-07);
    text-align: center;
    color: var(--cds-text-02);
    background-color: var(--cds-ui-01);
    border-radius: 4px;
  }

  .error-message {
    color: var(--cds-text-error);
    border: 1px solid var(--cds-support-01);
  }
</style>
