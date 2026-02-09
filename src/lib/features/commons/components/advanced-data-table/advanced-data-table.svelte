<script lang="ts">
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import type { ProcessedDataset } from '$lib/features/data-pipeline';
  import {
    Duck,
    RefineOperation,
    duckDBOrchestrator
  } from '$lib/features/duckdb';
  import { renameColumn } from '$lib/features/duckdb/orchestrator/column-ops';
  import * as m from '$lib/paraglide/messages';
  import {
    DataTableSkeleton,
    InlineNotification,
    Modal,
    TextInput
  } from 'carbon-components-svelte';
  import ChevronUp from 'carbon-icons-svelte/lib/ChevronUp.svelte';
  import ChevronDown from 'carbon-icons-svelte/lib/ChevronDown.svelte';
  import { onMount, untrack } from 'svelte';
  import { LogCategory, logger } from '../../utils/logger';

  import { useColumnOperations } from './hooks/use-column-operations.svelte';
  import { useRowSelection } from './hooks/use-row-selection.svelte';
  import { useTableData } from './hooks/use-table-data.svelte';
  import { useTableFilters } from './hooks/use-table-filters.svelte';
  import { useTableSort } from './hooks/use-table-sort.svelte';
  import { useVirtualScroll } from './hooks/use-virtual-scroll.svelte';
  import { GEOID_SCORE_THRESHOLD } from './column-type-styles';
  import {
    DOM_UPDATE_DELAY_MS,
    TABLE_ROW_HEIGHT,
    type ColumnType
  } from './types';

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

  let histogramVisible = $state(true);
  const effectiveShowSummaryPlots = $derived(
    showSummaryPlots && histogramVisible
  );

  function toggleHistograms() {
    histogramVisible = !histogramVisible;
  }

  let tableContainer = $state<HTMLDivElement | undefined>(undefined);
  let viewportHeight = $state(
    typeof window !== 'undefined' ? window.innerHeight : 800
  );

  const rowHeight = TABLE_ROW_HEIGHT;
  const viewportHeightRatioNormal = 0.4;
  const viewportHeightRatioExpanded = 0.85;
  const viewportHeightRatio = $derived(
    isExpanded ? viewportHeightRatioExpanded : viewportHeightRatioNormal
  );
  const maxViewportHeight = $derived(
    Math.floor(viewportHeight * viewportHeightRatio)
  );
  const DEFAULT_MIN_ROWS = 10;
  const computedMaxRows = $derived(
    Math.max(DEFAULT_MIN_ROWS, Math.floor(maxViewportHeight / rowHeight))
  );
  const effectiveMaxRows = $derived(maxRows ?? computedMaxRows);
  const maxHeight = $derived((effectiveMaxRows + 1) * rowHeight);
  const hasDataSource = $derived(!!dataset || !!tableName);
  const isEditMode = $derived(!!tableName && !isReadOnly);

  function recordTransformation(summary: string) {
    if (!dataset?.id) return;
    datasetsStore.recordTransformation(dataset.id, summary);
  }

  async function recordProjectTransformation(
    type: 'refine' | 'drop' | 'type_change',
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

  let renameModalOpen = $state(false);
  let columnToRename = $state<string | null>(null);
  let newColumnName = $state('');
  let deleteConfirmOpen = $state(false);
  let columnToDelete = $state<string | null>(null);
  let typeChangeError = $state<string | null>(null);

  const columnOps = useColumnOperations({
    tableName: () => tableName,
    datasetId: () => dataset?.id,
    columns: () => tableData.columns,
    onColumnsChange: async () => {
      await tableData.loadColumnsInfo();
      await virtualScroll.initializeRows(virtualScroll.startIndex);
    },
    onColumnRefined: async () => {
      await filters.refreshFiltersState();
      await tableData.loadRowsData();
    },
    onRecordTransformation: recordTransformation,
    onColumnRenamed: (oldName: string) => {
      columnToRename = oldName;
      newColumnName = oldName;
      renameModalOpen = true;
    }
  });

  const affectedVisualizations = $derived.by(() => {
    if (!columnToDelete) return [];
    return columnOps.getAffectedVisualizations(columnToDelete);
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

  const columnTypeToDuckDB: Record<ColumnType, string> = {
    text: 'VARCHAR',
    number: 'DOUBLE',
    date: 'DATE',
    boolean: 'BOOLEAN'
  };

  async function handleChangeType(columnName: string, newType: ColumnType) {
    typeChangeError = null;
    isLocalUpdate = true;
    try {
      await columnOps.handleChangeType(columnName, newType);
      await recordProjectTransformation(
        'type_change',
        columnName,
        columnTypeToDuckDB[newType]
      );
    } catch (err) {
      logger.error('Error changing column type', LogCategory.UI, err);
      typeChangeError = m.column_type_change_error({
        column: columnName,
        type: newType
      });
    } finally {
      setTimeout(() => {
        isLocalUpdate = false;
      }, 100);
    }
  }

  async function handleRenameConfirm() {
    if (!columnToRename || !newColumnName.trim() || !tableName) {
      renameModalOpen = false;
      return;
    }

    const oldName = columnToRename;
    const trimmedNewName = newColumnName.trim();

    isLocalUpdate = true;
    try {
      await renameColumn(tableName, oldName, trimmedNewName, Duck);
      await tableData.loadColumnsInfo();
      await virtualScroll.initializeRows(virtualScroll.startIndex);

      if (dataset?.id) {
        datasetsStore.renameDatasetColumn(dataset.id, oldName, trimmedNewName);
      }

      recordTransformation(`Colonne renommée: ${oldName} → ${trimmedNewName}`);

      if (dataset?.sourceFileId) {
        await projectStore.addColumnTransformation(dataset.sourceFileId, {
          type: 'rename',
          column: oldName,
          newValue: trimmedNewName,
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      logger.error('Error renaming column', LogCategory.UI, err);
    } finally {
      renameModalOpen = false;
      columnToRename = null;
      newColumnName = '';
      setTimeout(() => {
        isLocalUpdate = false;
      }, 100);
    }
  }

  function handleDeleteRequest(columnName: string) {
    columnToDelete = columnName;
    deleteConfirmOpen = true;
  }

  async function handleDeleteConfirm() {
    if (!columnToDelete) {
      deleteConfirmOpen = false;
      return;
    }

    const deletedColumn = columnToDelete;

    isLocalUpdate = true;
    try {
      await columnOps.handleDelete(deletedColumn);
      await recordProjectTransformation('drop', deletedColumn);
    } catch (err) {
      logger.error('Error deleting column', LogCategory.UI, err);
    } finally {
      deleteConfirmOpen = false;
      columnToDelete = null;
      setTimeout(() => {
        isLocalUpdate = false;
      }, 100);
    }
  }

  // Pre-index cellHighlights into a Map for O(1) lookup instead of O(n) .find()
  const cellHighlightMap = $derived.by(() => {
    const map = new Map<string, 'exact' | 'contains' | 'partial'>();
    for (const h of cellHighlights) {
      map.set(`${h.rowId}:${h.columnName}`, h.type);
    }
    return map;
  });

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
    return cellHighlightMap.get(`${rowId}:${columnName}`) ?? null;
  }

  // Pre-index highlightedRowIds into a Set for O(1) lookup instead of O(n) .includes()
  const highlightedRowIdSet = $derived(new Set(highlightedRowIds));

  // Pre-compute geoid column names for O(1) lookup in TableRow
  const geoidColumns = $derived.by(() => {
    const set = new Set<string>();
    for (const [name, a] of tableData.columnAnalysis) {
      if (
        a?.semioType === 'geoid' &&
        (a?.semioScore ?? 0) >= GEOID_SCORE_THRESHOLD
      ) {
        set.add(name);
      }
    }
    return set;
  });

  function getRowHighlightType(
    rowIndex: number,
    row: Record<string, unknown>
  ): HighlightType {
    const rowId = (row.__id as number | undefined) ?? rowIndex + 1;
    if (currentCell?.rowId === rowId) return 'current';
    if (highlightedRowIdSet.has(rowId)) return 'partial';
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

  // Debounce scroll-to-cell to avoid stacking getRowPosition queries during search navigation
  let scrollToCellTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (currentCell && filters.numRows > 0 && tableName) {
      const rowId = currentCell.rowId;
      const columnName = currentCell.columnName;
      const currentSortColumn = sort.sortColumn;
      const currentSortOrder = sort.sortOrder;
      const currentTableName = tableName;

      clearTimeout(scrollToCellTimer);
      scrollToCellTimer = setTimeout(() => {
        untrack(async () => {
          const position = await duckDBOrchestrator.getRowPosition(
            currentTableName,
            rowId,
            { orderBy: currentSortColumn, order: currentSortOrder }
          );

          if (position >= 0) {
            await virtualScroll.goToPosition(position);
          }

          setTimeout(() => {
            const cellSelector = `td[data-column="${columnName}"]`;
            const cell = tableContainer?.querySelector(cellSelector);
            cell?.scrollIntoView({
              behavior: 'smooth',
              inline: 'center',
              block: 'nearest'
            });
          }, DOM_UPDATE_DELAY_MS);
        });
      }, 150);
    }
    return () => clearTimeout(scrollToCellTimer);
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
    void isExpanded;
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
      <p>{m.error_prefix()}{tableData.error}</p>
    </div>
  {:else if showEmptyState}
    <div class="empty-state">
      <p>{m.no_data_available()}</p>
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
            <tr class:histograms-open={effectiveShowSummaryPlots}>
              {#if isSelectable && isEditMode}
                <th class="selection-header-spacer"></th>
              {/if}
              <th
                class="row-index-header"
                class:histograms-open={effectiveShowSummaryPlots}
              >
                <div class="row-index-header-content">
                  <div class="histogram-toggle-area">
                    <button
                      class="histogram-toggle"
                      onclick={toggleHistograms}
                      title={histogramVisible
                        ? m.column_hide()
                        : m.column_show()}
                    >
                      {#if histogramVisible}
                        <ChevronUp size={16} />
                      {:else}
                        <ChevronDown size={16} />
                      {/if}
                    </button>
                  </div>
                  {#if effectiveShowSummaryPlots}
                    <div class="row-index-stats">
                      <span class="row-index-count"
                        >{filters.filterStats.total}</span
                      >
                      <span class="row-index-label">{m.rows()}</span>
                    </div>
                  {/if}
                </div>
              </th>
              {#each columnOps.visibleColumns as column (column.name)}
                <TableColumnHeader
                  column={column}
                  analysis={tableData.columnAnalysis.get(column.name)}
                  columnAnalysis={tableData.columnAnalysis}
                  sortColumn={sort.sortColumn}
                  sortOrder={sort.sortOrder}
                  showSummaryPlots={effectiveShowSummaryPlots}
                  isEditMode={isEditMode}
                  isHidden={columnOps.isColumnHidden(column.name)}
                  onSort={handleSort}
                  onRefine={handleRefine}
                  onRename={columnOps.handleRename}
                  onChangeType={handleChangeType}
                  onHide={columnOps.handleHide}
                  onDelete={handleDeleteRequest}
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
                showRowNumbers={true}
                geoidColumns={geoidColumns}
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

  {#if typeChangeError}
    <InlineNotification
      kind="error"
      lowContrast
      title={typeChangeError}
      on:close={() => (typeChangeError = null)}
    />
  {/if}
</div>

<!-- Rename Column Modal -->
<Modal
  bind:open={renameModalOpen}
  modalHeading={m.column_rename_title()}
  primaryButtonText={m.column_rename_confirm()}
  secondaryButtonText={m.cancel()}
  on:click:button--primary={handleRenameConfirm}
  on:click:button--secondary={() => {
    renameModalOpen = false;
    columnToRename = null;
    newColumnName = '';
  }}
  on:close={() => {
    renameModalOpen = false;
    columnToRename = null;
    newColumnName = '';
  }}
  size="sm"
>
  <div class="rename-modal-content">
    <p class="rename-modal-description">
      {m.column_rename_description({ column: columnToRename ?? '' })}
    </p>
    <TextInput
      bind:value={newColumnName}
      labelText={m.column_rename_label()}
      placeholder={m.column_rename_placeholder()}
    />
  </div>
</Modal>

<!-- Delete Column Confirmation Modal -->
<Modal
  bind:open={deleteConfirmOpen}
  modalHeading={m.delete_column_title()}
  primaryButtonText={m.delete_column_confirm()}
  primaryButtonDisabled={false}
  secondaryButtonText={m.cancel()}
  danger
  on:click:button--primary={handleDeleteConfirm}
  on:click:button--secondary={() => {
    deleteConfirmOpen = false;
    columnToDelete = null;
  }}
  on:close={() => {
    deleteConfirmOpen = false;
    columnToDelete = null;
  }}
  size="sm"
>
  <p>
    {m.delete_column_message({ column: columnToDelete ?? '' })}
  </p>
  {#if affectedVisualizations.length > 0}
    <InlineNotification
      kind="warning"
      lowContrast
      hideCloseButton
      title={m.delete_column_warning_title({
        count: affectedVisualizations.length
      })}
      subtitle={affectedVisualizations.map((v) => v.name).join(', ')}
    />
  {/if}
</Modal>

<style>
  .advanced-data-table {
    background-color: var(--cds-ui-background);
    padding: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--cds-border-subtle-00, #e0e0e0);
  }

  .table-wrapper {
    position: relative;
    overflow: hidden;
  }

  .table-container {
    overflow-y: auto;
    overflow-x: auto;
    background-color: #ffffff;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .table-container::-webkit-scrollbar {
    display: none;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  table :global {
    td,
    th {
      text-overflow: ellipsis;
      min-width: 128px;
      max-width: 200px;
      overflow: hidden;
    }
  }

  thead {
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: #e0e0e0;
  }

  thead .selection-header-spacer {
    width: 32px;
    min-width: 32px;
    max-width: 32px;
    padding: 0;
    border-bottom: 1px solid var(--cds-border-subtle-01, #c6c6c6);
    background-color: #e0e0e0;
    position: sticky;
    left: 0;
    z-index: 1;
    overflow: visible;
  }

  tr.histograms-open .selection-header-spacer {
    background: linear-gradient(
      to bottom,
      #e0e0e0 calc(100% - 63px),
      #f4f4f4 calc(100% - 63px)
    );
  }

  thead .row-index-header {
    width: 52px;
    min-width: 52px;
    max-width: 52px;
    padding: 0;
    border-bottom: 1px solid var(--cds-border-subtle-01, #c6c6c6);
    background-color: #e0e0e0;
    vertical-align: top;
    overflow: visible;
    position: relative;
  }

  .row-index-header-content {
    display: flex;
    flex-direction: column;
    position: absolute;
    inset: 0;
  }

  /* --- Chevron toggle: top area, centered in dark gray header zone --- */
  .histogram-toggle-area {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 24px;
  }

  /* --- Row count: bottom area, centered in light gray histogram zone --- */
  .row-index-stats {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 63px;
    flex-shrink: 0;
    background-color: #f4f4f4;
    line-height: 1.2;
  }

  .row-index-count {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 12px;
    font-weight: 600;
    color: #161616;
    line-height: 1;
  }

  .row-index-label {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 10px;
    font-weight: 400;
    color: #525252;
    line-height: 1;
  }

  .histogram-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: #525252;
    cursor: pointer;
    transition: color 0.15s;
  }

  .histogram-toggle:hover {
    color: #161616;
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
    color: var(--cds-text-02, #525252);
    background-color: var(--cds-layer-01, #f4f4f4);
    border-radius: 4px;
  }

  .error-message {
    color: var(--cds-text-error);
    border: 1px solid var(--cds-support-01);
  }

  :global(.rename-modal-content) {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  :global(.rename-modal-description) {
    color: var(--cds-text-02, #525252);
    margin-bottom: var(--cds-spacing-03);
  }
</style>
