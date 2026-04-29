<script lang="ts">
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import SimpleCheckbox from '$lib/features/commons/components/simple-checkbox.svelte';
  import type { ProcessedDataset } from '$lib/features/data-pipeline';
  import { Duck, RefineOperation } from '$lib/features/duckdb';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
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
  import { onDestroy, onMount, tick, untrack, type Component } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
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
    type ColumnType,
    type TableMutation
  } from './types';

  import TableColumnHeader from './components/table-column-header.svelte';
  import TableHeaderInfo from './components/table-header-info.svelte';
  import TableRow from './components/table-row.svelte';

  const LOCAL_UPDATE_DELAY_MS = 100;
  const SCROLL_TO_CELL_DEBOUNCE_MS = 150;
  const MAX_SCROLL_CELL_ATTEMPTS = 5;

  interface DataTableSkeletonRuntimeProps {
    columns?: number;
    rows?: number;
    size?: 'compact' | 'short' | 'tall';
    zebra?: boolean;
    showHeader?: boolean;
    headers?: ReadonlyArray<string | { value?: unknown; empty?: boolean }>;
    showToolbar?: boolean;
  }

  const TypedDataTableSkeleton =
    DataTableSkeleton as unknown as Component<DataTableSkeletonRuntimeProps>;

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
    activeJoinColumn?: string;
    initialSortColumn?: string | null;
    initialSortOrder?: 'ASC' | 'DESC' | null;
    onSelectionChange?: (selectedIds: number[], count: number) => void;
    onSortChange?: (
      column: string | null,
      order: 'ASC' | 'DESC' | null
    ) => void;
    onColumnDeleted?: (columnName: string) => void;
    onTableMutation?: (mutation: TableMutation) => Promise<void> | void;
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
    activeJoinColumn,
    initialSortColumn = null,
    initialSortOrder = null,
    onSelectionChange,
    onSortChange,
    onColumnDeleted,
    onTableMutation
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
  const viewportHeightRatioExpanded = 1.0;
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
    initialSortColumn: untrack(() => initialSortColumn),
    initialSortOrder: untrack(() => initialSortOrder),
    onSortChange: async (column, order) => {
      await virtualScroll.initializeRows(0);
      if (tableContainer) {
        tableContainer.scrollTop = 0;
      }
      onSortChange?.(column, order);
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
    onColumnDeleted: (columnName: string) => onColumnDeleted?.(columnName),
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
  const isSelectionMode = $derived(isSelectable && isEditMode);

  // Defensive guard: during rapid dataset/table switches, transient invalid
  // column entries can appear and break keyed reconciliation in Svelte.
  const safeVisibleColumns = $derived.by(() =>
    columnOps.visibleColumns.filter(
      (column): column is { name: string; type: string } =>
        typeof column?.name === 'string' && column.name.length > 0
    )
  );

  async function handleSort(column: string, order: 'ASC' | 'DESC') {
    if (sort.sortColumn === column && sort.sortOrder === order) {
      sort.clearSort();
      return;
    }

    sort.sortTable(column, order);
  }

  async function handleRefine(columnName: string, operation: RefineOperation) {
    isLocalUpdate = true;
    try {
      await columnOps.handleRefine(columnName, operation);
      await onTableMutation?.({
        type: 'refine',
        columnName,
        operation
      });
      await recordProjectTransformation('refine', columnName, operation);
    } catch (e) {
      isLocalUpdate = false;
      throw e;
    } finally {
      setTimeout(() => {
        isLocalUpdate = false;
      }, LOCAL_UPDATE_DELAY_MS);
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
      await onTableMutation?.({
        type: 'type_change',
        columnName,
        newType
      });
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
      }, LOCAL_UPDATE_DELAY_MS);
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
      await onTableMutation?.({
        type: 'rename',
        oldName,
        newName: trimmedNewName
      });

      recordTransformation(
        m.history_column_renamed({ oldName, newName: trimmedNewName })
      );

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
      }, LOCAL_UPDATE_DELAY_MS);
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
      await onTableMutation?.({
        type: 'delete',
        columnName: deletedColumn
      });
      await recordProjectTransformation('drop', deletedColumn);
    } catch (err) {
      logger.error('Error deleting column', LogCategory.UI, err);
    } finally {
      deleteConfirmOpen = false;
      columnToDelete = null;
      setTimeout(() => {
        isLocalUpdate = false;
      }, LOCAL_UPDATE_DELAY_MS);
    }
  }

  const cellHighlightMap = $derived.by(() => {
    const map = new SvelteMap<string, 'exact' | 'contains' | 'partial'>();
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

  const highlightedRowIdSet = $derived(new Set(highlightedRowIds));
  const selectableRowIds = $derived.by(() => {
    const ids: number[] = [];

    for (const [index, row] of tableData.tableData.entries()) {
      const fallbackRowId = (virtualScroll.rows[index] ?? index) + 1;
      const resolvedRowId = normalizeRowId(
        (row.__id as number | bigint | string | undefined) ?? fallbackRowId
      );

      if (resolvedRowId !== null) {
        ids.push(resolvedRowId);
      }
    }

    return ids;
  });
  const areVisibleRowsSelected = $derived(
    rowSelection.areAllSelected(selectableRowIds)
  );
  const hasVisibleSelection = $derived(
    selectableRowIds.some((rowId) => rowSelection.isRowSelected(rowId))
  );

  const geoidColumns = $derived.by(() => {
    const set = new SvelteSet<string>();
    if (activeJoinColumn) {
      set.add(activeJoinColumn);
      return set;
    }
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

  function handleToggleVisibleRowsSelection() {
    rowSelection.toggleAllRows(selectableRowIds);
  }

  onMount(() => {
    const handleResize = () => {
      viewportHeight = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  });

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function escapeSelectorValue(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }

    return value.replace(/["\\]/g, '\\$&');
  }

  function normalizeRowId(value: number | bigint | string): number | null {
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }

    if (typeof value === 'bigint') {
      return Number(value);
    }

    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      return Number.isInteger(parsed) ? parsed : null;
    }

    return null;
  }

  async function scrollToCurrentCell(options: {
    tableName: string;
    rowId: number;
    columnName: string;
    sortColumn: string | null;
    sortColumnType: string | null;
    sortOrder: 'ASC' | 'DESC' | null;
  }): Promise<void> {
    if (!tableContainer) return;

    const normalizedRowId = normalizeRowId(options.rowId);
    if (normalizedRowId === null) return;

    virtualScroll.setTableContainer(tableContainer);

    let position = await duckDBOrchestrator.getRowPosition(
      options.tableName,
      normalizedRowId,
      {
        orderBy: options.sortColumn,
        orderByType: options.sortColumnType,
        order: options.sortOrder
      }
    );

    if (position < 0) {
      position = Math.max(normalizedRowId - 1, 0);
    }

    if (position >= 0) {
      await virtualScroll.goToPosition(position);
    }

    const rowSelector = `tr[data-row-id="${normalizedRowId}"]`;
    const cellSelector = `${rowSelector} td[data-column="${escapeSelectorValue(options.columnName)}"]`;

    for (let attempt = 0; attempt < MAX_SCROLL_CELL_ATTEMPTS; attempt += 1) {
      await tick();

      const cell =
        tableContainer?.querySelector<HTMLTableCellElement>(cellSelector);
      if (cell) {
        cell.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest'
        });
        return;
      }

      await wait(DOM_UPDATE_DELAY_MS);
    }
  }

  let scrollToCellTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (currentCell && filters.numRows > 0 && tableName && tableContainer) {
      const rowId = currentCell.rowId;
      const columnName = currentCell.columnName;
      const currentSortColumn = sort.sortColumn;
      const currentSortColumnType =
        currentSortColumn !== null
          ? (tableData.columns.find(
              (column) => column.name === currentSortColumn
            )?.type ?? null)
          : null;
      const currentSortOrder = sort.sortOrder;
      const currentTableName = tableName;

      clearTimeout(scrollToCellTimer);
      scrollToCellTimer = setTimeout(() => {
        untrack(() => {
          void scrollToCurrentCell({
            tableName: currentTableName,
            rowId,
            columnName,
            sortColumn: currentSortColumn,
            sortColumnType: currentSortColumnType,
            sortOrder: currentSortOrder
          }).catch((error) => {
            logger.error(m.error_scroll_search_result(), LogCategory.UI, error);
          });
        });
      }, SCROLL_TO_CELL_DEBOUNCE_MS);
    }
    return () => clearTimeout(scrollToCellTimer);
  });

  let lastDatasetId: string | undefined = undefined;
  let lastTableName: string | undefined = undefined;
  let lastColumnsRef: unknown[] | undefined = undefined;
  let lastDatasetVersion: number | undefined = undefined;
  let isLocalUpdate = false;
  let tableReloadRequestId = 0;
  let isDestroyed = false;

  onDestroy(() => {
    isDestroyed = true;
    tableReloadRequestId += 1;
  });

  function isTableReloadStale(
    requestId: number,
    currentDatasetId: string | undefined,
    currentTableName: string | undefined,
    currentDatasetVersion: number | undefined
  ): boolean {
    if (isDestroyed) {
      return true;
    }

    return (
      requestId !== tableReloadRequestId ||
      lastDatasetId !== currentDatasetId ||
      lastTableName !== currentTableName ||
      lastDatasetVersion !== currentDatasetVersion
    );
  }

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
      return;
    }

    if (currentDataset || currentTableName) {
      const requestId = ++tableReloadRequestId;
      untrack(async () => {
        try {
          await tableData.loadColumnsInfo();
          if (
            isTableReloadStale(
              requestId,
              currentDatasetId,
              currentTableName,
              currentDatasetVersion
            )
          ) {
            return;
          }

          await filters.refreshFiltersState();
          if (
            isTableReloadStale(
              requestId,
              currentDatasetId,
              currentTableName,
              currentDatasetVersion
            )
          ) {
            return;
          }

          await virtualScroll.initializeRows(0);
          if (
            isTableReloadStale(
              requestId,
              currentDatasetId,
              currentTableName,
              currentDatasetVersion
            )
          ) {
            return;
          }
        } catch (err) {
          if (
            isTableReloadStale(
              requestId,
              currentDatasetId,
              currentTableName,
              currentDatasetVersion
            )
          ) {
            return;
          }

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
              <th
                class="row-index-header"
                class:histograms-open={effectiveShowSummaryPlots}
                class:selection-mode={isSelectionMode}
                scope="col"
              >
                {#if isSelectionMode}
                  <div class="selection-header-content">
                    <SimpleCheckbox
                      checked={areVisibleRowsSelected}
                      indeterminate={hasVisibleSelection &&
                        !areVisibleRowsSelected}
                      onchange={handleToggleVisibleRowsSelection}
                    />
                  </div>
                {:else}
                  <div class="row-index-header-content">
                    <div class="histogram-toggle-area">
                      <button
                        class="histogram-toggle"
                        onclick={toggleHistograms}
                        title={m.data_toggle_summary_plots()}
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
                {/if}
              </th>
              {#each safeVisibleColumns as column, columnIndex (`${column.name}-${columnIndex}`)}
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
                visibleColumns={safeVisibleColumns}
                highlightType={getRowHighlightType(rowIndex, row)}
                getCellHighlight={(colName) =>
                  getCellHighlightType(rowId, colName)}
                isSelectable={isSelectionMode}
                isSelected={rowSelection.isRowSelected(rowId)}
                showRowNumbers={!isSelectionMode}
                geoidColumns={geoidColumns}
                onToggleSelection={rowSelection.toggleRowSelection}
              />
            {/each}
          </tbody>
        </table>
      </div>

      {#if !tableData.isFullyLoaded}
        <div class="skeleton-overlay" style="max-height: {maxHeight}px;">
          <TypedDataTableSkeleton
            columns={5}
            rows={skeletonRows}
            size="compact"
            showHeader={false}
            showToolbar={false}
          />
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
    background-color: var(--cds-ui-01, #ffffff);
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
    z-index: var(--z-content);
    background-color: var(--khartis-data-table-header-background);
  }

  thead .row-index-header {
    width: 52px;
    min-width: 52px;
    max-width: 52px;
    padding: 0;
    border-bottom: 1px solid var(--cds-border-subtle-01, #c6c6c6);
    background-color: var(--khartis-data-table-header-background);
    vertical-align: top;
    overflow: visible;
    position: relative;
  }

  thead .row-index-header.selection-mode {
    width: 32px;
    min-width: 32px;
    max-width: 32px;
  }

  .row-index-header-content {
    display: flex;
    flex-direction: column;
    position: absolute;
    inset: 0;
  }

  .selection-header-content {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 32px;
  }

  .histogram-toggle-area {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 24px;
  }

  .row-index-stats {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 63px;
    flex-shrink: 0;
    background-color: var(--khartis-data-table-header-background);
    line-height: 1.2;
  }

  .row-index-count {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 12px;
    font-weight: 600;
    color: var(--cds-text-01, #161616);
    line-height: 1;
  }

  .row-index-label {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 10px;
    font-weight: 400;
    color: var(--cds-text-02, #525252);
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
    color: var(--cds-text-02, #525252);
    cursor: pointer;
    transition: color 0.15s;
  }

  .histogram-toggle:hover {
    color: var(--cds-text-01, #161616);
  }

  .skeleton-overlay {
    position: absolute;
    inset: 0;
    background-color: var(--cds-ui-background);
    z-index: var(--z-content-header);
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
