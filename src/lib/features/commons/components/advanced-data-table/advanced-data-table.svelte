<script lang="ts">
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import type { ProcessedDataset } from '$lib/features/data-pipeline';
  import { RefineOperation } from '$lib/features/duckdb';
  import * as m from '$lib/paraglide/messages';
  import { DataTableSkeleton } from 'carbon-components-svelte';
  import { onMount, untrack } from 'svelte';
  import { LogCategory, logger } from '../../utils/logger';
  import ColumnRenameModal from '../column-rename-modal.svelte';

  import { useVirtualScroll } from './hooks/use-virtual-scroll.svelte';
  import { useTableData } from './hooks/use-table-data.svelte';
  import { useTableSort } from './hooks/use-table-sort.svelte';
  import { useColumnOperations } from './hooks/use-column-operations.svelte';
  import { useTableFilters } from './hooks/use-table-filters.svelte';

  import TableHeaderInfo from './components/TableHeaderInfo.svelte';
  import TableColumnHeader from './components/TableColumnHeader.svelte';
  import TableRow from './components/TableRow.svelte';

  interface Props {
    dataset?: ProcessedDataset;
    tableName?: string;
    highlightIds?: number[];
    showSummaryPlots?: boolean;
    maxRows?: number;
  }

  let {
    dataset,
    tableName,
    highlightIds = [],
    showSummaryPlots = true,
    maxRows = 12.5
  }: Props = $props();

  let tableContainer = $state<HTMLDivElement | undefined>(undefined);

  const rowHeight = 32;
  const maxHeight = $derived((maxRows + 1) * rowHeight);
  const hasDataSource = $derived(!!dataset || !!tableName);
  const isEditMode = $derived(!!tableName);

  const COLUMN_TYPE_OPTIONS = $derived([
    { label: m.column_type_text(), value: 'VARCHAR' },
    { label: m.column_type_number(), value: 'DOUBLE' },
    { label: m.column_type_integer(), value: 'BIGINT' },
    { label: m.column_type_date(), value: 'DATE' },
    { label: m.column_type_boolean(), value: 'BOOLEAN' }
  ]);

  function recordTransformation(summary: string) {
    if (!dataset?.id) return;
    datasetsStore.recordTransformation(dataset.id, summary);
  }

  async function recordProjectTransformation(
    type: 'rename' | 'drop' | 'type_change',
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
    maxRows: () => maxRows,
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
    onSortColumnRenamed: (oldName, newName) => {
      if (sort.sortColumn === oldName) {
        sort.sortTable(newName, sort.sortOrder ?? 'ASC');
      }
    },
    onSortColumnDeleted: (columnName) => {
      if (sort.sortColumn === columnName) {
        sort.sortTable(columnName, 'ASC');
      }
    },
    onRecordTransformation: recordTransformation
  });

  const showSkeleton = $derived(
    tableData.isLoading ||
      (hasDataSource && tableData.columns.length === 0 && !tableData.error)
  );
  const showEmptyState = $derived(
    !hasDataSource && tableData.columns.length === 0
  );

  async function handleSort(column: string, order: 'ASC' | 'DESC') {
    sort.sortTable(column, order);
  }

  async function handleRename(columnName: string) {
    columnOps.openRenameModal(columnName);
  }

  async function handleRenameConfirm(newName: string) {
    if (columnOps.columnToRename) {
      const oldName = columnOps.columnToRename;
      await columnOps.handleRename(newName);
      await recordProjectTransformation('rename', oldName, newName);
    }
  }

  async function handleChangeType(columnName: string, duckType: string) {
    await columnOps.changeColumnType(columnName, duckType);
    await recordProjectTransformation('type_change', columnName, duckType);
  }

  async function handleRefine(columnName: string, operation: RefineOperation) {
    await columnOps.handleRefine(columnName, operation);
  }

  async function handleDrop(columnName: string) {
    await columnOps.dropColumn(columnName);
    await recordProjectTransformation('drop', columnName);
  }

  function isRowHighlighted(
    rowIndex: number,
    row: Record<string, unknown>
  ): boolean {
    const rowId = (row.__id as number | undefined) ?? rowIndex + 1;
    return highlightIds.includes(rowId);
  }

  onMount(() => {
    logger.debug('AdvancedDataTable mounted', LogCategory.UI, {
      tableName,
      datasetId: dataset?.id
    });
  });

  $effect(() => {
    if (highlightIds.length > 0 && filters.numRows > 0) {
      untrack(() => virtualScroll.goToId(highlightIds[0]));
    }
  });

  let lastDatasetId: string | undefined = undefined;
  let lastTableName: string | undefined = undefined;

  $effect(() => {
    const currentTableName = tableName;
    const currentDataset = dataset;
    const currentDatasetId = currentDataset?.id;

    const datasetChanged = currentDatasetId !== lastDatasetId;
    const tableChanged = currentTableName !== lastTableName;

    if (!datasetChanged && !tableChanged) {
      return;
    }

    lastDatasetId = currentDatasetId;
    lastTableName = currentTableName;

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getSkeletonProps = () =>
    ({ columns: 5, rows: Math.floor(maxRows) }) as any;
</script>

<div class="advanced-data-table">
  {#if filters.numRows > 0}
    <TableHeaderInfo
      filterStats={filters.filterStats}
      hiddenColumns={columnOps.hiddenColumns}
      onShowColumn={columnOps.toggleColumnVisibility}
    />
  {/if}

  {#if showSkeleton}
    <div class="skeleton-wrapper" style="max-height: {maxHeight}px;">
      <DataTableSkeleton {...getSkeletonProps()} />
    </div>
  {:else if tableData.error}
    <div class="error-message">
      <p>Erreur: {tableData.error}</p>
    </div>
  {:else if tableData.columns.length > 0}
    <div
      class="table-container"
      style="max-height: {maxHeight}px;"
      bind:this={tableContainer}
      onscroll={virtualScroll.handleScroll}
    >
      <table>
        <thead>
          <tr>
            {#each columnOps.visibleColumns as column (column.name)}
              <TableColumnHeader
                column={column}
                analysis={tableData.columnAnalysis.get(column.name)}
                columnAnalysis={tableData.columnAnalysis}
                sortColumn={sort.sortColumn}
                sortOrder={sort.sortOrder}
                showSummaryPlots={showSummaryPlots}
                isEditMode={isEditMode}
                columnTypeOptions={COLUMN_TYPE_OPTIONS}
                onSort={handleSort}
                onRename={handleRename}
                onChangeType={handleChangeType}
                onRefine={handleRefine}
                onToggleVisibility={columnOps.toggleColumnVisibility}
                onDrop={handleDrop}
              />
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if tableData.tableData.length === 0}
            {#each virtualScroll.rows as _row, idx (idx)}
              <tr>
                {#each columnOps.visibleColumns as _col, colIdx (colIdx)}
                  <td><div class="skeleton-cell"></div></td>
                {/each}
              </tr>
            {/each}
          {:else}
            {#each tableData.tableData as row, i (virtualScroll.rows[i] ?? `row-${i}`)}
              {@const rowIndex = virtualScroll.rows[i] ?? i}
              <TableRow
                row={row}
                rowIndex={rowIndex}
                visibleColumns={columnOps.visibleColumns}
                isHighlighted={isRowHighlighted(rowIndex, row)}
              />
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  {:else if showEmptyState}
    <div class="empty-state">
      <p>Aucune donnée disponible</p>
    </div>
  {/if}
</div>

{#if columnOps.columnToRename}
  <ColumnRenameModal
    bind:open={columnOps.renameModalOpen}
    columnName={columnOps.columnToRename}
    onClose={() => {
      columnOps.setRenameModalOpen(false);
      columnOps.setColumnToRename(null);
    }}
    onRename={handleRenameConfirm}
  />
{/if}

<style>
  .advanced-data-table {
    background-color: var(--cds-ui-background);
    padding: var(--cds-spacing-05);
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .table-container {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: auto;
    background-color: var(--cds-ui-01);
    border: 1px solid var(--cds-ui-03);
    border-radius: 4px;
    position: relative;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }

  thead {
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: var(--cds-ui-02);
  }

  tbody td {
    padding: var(--cds-spacing-02) var(--cds-spacing-03);
    color: var(--cds-text-01);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .skeleton-wrapper {
    overflow: hidden;
  }

  .skeleton-wrapper :global(.bx--data-table-header),
  .skeleton-wrapper :global(.bx--table-toolbar) {
    display: none;
  }

  .skeleton-cell {
    height: 16px;
    background-color: var(--cds-ui-03);
    border-radius: 2px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 0.7;
    }
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
