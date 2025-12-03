<script lang="ts">
  // eslint-disable svelte/no-unnecessary-state-wrap
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import type { ProcessedDataset } from '$lib/features/data-pipeline';
  import {
    duckDBOrchestrator,
    RefineOperation,
    type AnalysisResult,
    type DataTableFilter,
    type FilterStats
  } from '$lib/features/duckdb';
  import {
    create_summary_plot,
    type CategoricalHistogram,
    type NumericHistogram,
    type SummaryPlotData
  } from '$lib/features/duckdb/services/duckdb/summary-plot';
  import SummaryPlot from '$lib/features/duckdb/services/duckdb/SummaryPlot.svelte';
  import {
    DataTableSkeleton,
    OverflowMenu,
    OverflowMenuItem
  } from 'carbon-components-svelte';
  import { View, ViewOff } from 'carbon-icons-svelte';
  import { onMount, tick, untrack } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { LogCategory, logger } from '../../utils/logger';
  import * as m from '$lib/paraglide/messages';
  import ColumnRenameModal from '../column-rename-modal.svelte';

  type HistogramLike = NumericHistogram | CategoricalHistogram;

  function isHistogram(value: unknown): value is HistogramLike {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as HistogramLike).toArray === 'function'
    );
  }

  function isNumericHistogram(value: unknown): value is NumericHistogram {
    if (!isHistogram(value)) return false;
    const sample = value.toArray()[0];
    return sample === undefined || 'bin' in sample;
  }

  function isCategoricalHistogram(
    value: unknown
  ): value is CategoricalHistogram {
    if (!isHistogram(value)) return false;
    const sample = value.toArray()[0];
    return sample === undefined || 'category' in sample;
  }

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

  let root: HTMLDivElement;
  let tableContainer = $state<HTMLDivElement | undefined>(undefined);
  let tableElement = $state<HTMLTableElement | undefined>(undefined);
  interface ColumnInfo {
    name: string;
    type: string;
  }

  let columns = $state<ColumnInfo[]>([]);
  let columnAnalysis = $state<SvelteMap<string, AnalysisResult>>(
    new SvelteMap()
  );
  let numRows = $state(0);
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  const rowHeight = 32;
  const maxHeight = $derived((maxRows + 1) * rowHeight);

  const hasDataSource = $derived(!!dataset || !!tableName);
  const showSkeleton = $derived(
    isLoading || (hasDataSource && columns.length === 0 && !error)
  );
  const showEmptyState = $derived(!hasDataSource && columns.length === 0);
  let startIndex = 0;
  let offsetRows = 1;
  let rows = $state<number[]>([]);
  type TableRow = Record<string, unknown>;
  let tableData = $state<TableRow[]>([]);
  let sortColumn = $state<string | null>(null);
  let sortOrder = $state<'ASC' | 'DESC' | null>(null);
  let hiddenColumns = $state<SvelteSet<string>>(new SvelteSet());
  let renameModalOpen = $state(false);
  let columnToRename = $state<string | null>(null);
  let _filters = $state<DataTableFilter[]>([]);
  let filterStats = $state<FilterStats>({ total: 0, filtered: 0 });

  const COLUMN_TYPE_OPTIONS = $derived([
    { label: m.column_type_text(), value: 'VARCHAR' },
    { label: m.column_type_number(), value: 'DOUBLE' },
    { label: m.column_type_integer(), value: 'BIGINT' },
    { label: m.column_type_date(), value: 'DATE' },
    { label: m.column_type_boolean(), value: 'BOOLEAN' }
  ]);

  function recordDatasetTransformation(summary: string) {
    if (!dataset?.id) return;
    datasetsStore.recordTransformation(dataset.id, summary);
  }

  function updateDatasetRowCountLocally(newCount: number) {
    if (!dataset?.id) return;
    datasetsStore.updateDatasetRowCount(dataset.id, newCount);
  }

  function createIndexArray(length: number, start = 0): number[] {
    return Array.from({ length }, (_, i) => i + start);
  }

  async function initializeRows(start: number) {
    tableData = [];
    const end = numRows - start;
    const length = Math.min(end, maxRows * 2);
    rows = createIndexArray(length, start);
    await loadRowsData();
  }

  async function loadRowsData() {
    if (!tableName && !dataset) return;

    try {
      if (tableName) {
        const data = await duckDBOrchestrator.getTableData(tableName, {
          offset: rows[0],
          limit: rows.length,
          orderBy: sortColumn,
          order: sortOrder
        });

        if (data && data.numRows > 0) {
          tableData = [];
          for (let i = 0; i < data.numRows; i++) {
            tableData.push(data.get(i));
          }
        }
      } else if (dataset) {
        tableData = dataset.data.slice(rows[0], rows[0] + rows.length);
      }
    } catch (err) {
      logger.error('Error loading data', LogCategory.UI, err);
      error = err instanceof Error ? err.message : 'Failed to load data';
    }
  }

  function handleScroll() {
    if (!tableContainer) return;

    const scrollBottom =
      tableContainer.scrollHeight -
      tableContainer.clientHeight -
      tableContainer.scrollTop;

    if (scrollBottom < 1 && rows[rows.length - 1] + 1 < numRows) {
      const endIndex = rows[rows.length - 1] + 1;
      const newEndIndex = Math.min(numRows, endIndex + 13);
      const newLength = newEndIndex - endIndex;
      const moreRows = createIndexArray(newLength, endIndex);
      rows = [...rows, ...moreRows];
      loadRowsData();
    } else if (tableContainer.scrollTop <= 0 && startIndex > 0) {
      const newStartIndex = Math.max(0, startIndex - 13);
      const newLength = startIndex - newStartIndex;
      const newRows = createIndexArray(newLength, newStartIndex);
      rows = [...newRows, ...rows];
      startIndex = newStartIndex;
      tableContainer.scrollTop = startIndex * rowHeight;
      loadRowsData();
    }
  }

  async function sortTable(column: string, order: 'ASC' | 'DESC') {
    if (sortColumn === column && sortOrder === order) {
      sortColumn = null;
      sortOrder = null;
    } else {
      sortColumn = column;
      sortOrder = order;
    }
    startIndex = 0;
    await initializeRows(0);
    if (tableContainer) {
      tableContainer.scrollTop = 0;
    }
  }

  async function goToId(id: number) {
    if (numRows === 0 || id > numRows) return;

    const index = id - 1;
    if (index !== -1) {
      startIndex = Math.max(0, index - offsetRows);
      await initializeRows(startIndex);
      const scrollPosition = offsetRows * rowHeight;
      if (tableContainer) {
        tableContainer.scrollTop = scrollPosition;
      }
    }
  }

  async function renameColumn(oldName: string, newName: string) {
    if (tableName) {
      isInternalOperation = true;

      try {
        await duckDBOrchestrator.renameColumn(tableName, oldName, newName);

        if (dataset?.id) {
          datasetsStore.renameDatasetColumn(dataset.id, oldName, newName);
        }

        if (sortColumn === oldName) {
          sortColumn = newName;
        }

        if (hiddenColumns.has(oldName)) {
          hiddenColumns.delete(oldName);
          hiddenColumns.add(newName);
          hiddenColumns = new SvelteSet(hiddenColumns);
        }

        await loadColumnsInfo(true);
        await initializeRows(startIndex);

        if (dataset?.sourceFileId) {
          await projectStore.addColumnTransformation(dataset.sourceFileId, {
            type: 'rename',
            column: oldName,
            newValue: newName,
            timestamp: new Date().toISOString()
          });
        }

        recordDatasetTransformation(`Renommage de ${oldName} en ${newName}`);
      } finally {
        await tick();
        isInternalOperation = false;
      }
    }
  }

  async function dropColumn(columnName: string) {
    if (tableName) {
      isInternalOperation = true;

      try {
        await duckDBOrchestrator.dropColumn(tableName, columnName);

        if (sortColumn === columnName) {
          sortColumn = null;
          sortOrder = null;
        }

        if (hiddenColumns.has(columnName)) {
          hiddenColumns.delete(columnName);
          hiddenColumns = hiddenColumns;
        }

        await loadColumnsInfo(true);
        await initializeRows(startIndex);

        if (dataset?.sourceFileId) {
          await projectStore.addColumnTransformation(dataset.sourceFileId, {
            type: 'drop',
            column: columnName,
            timestamp: new Date().toISOString()
          });
        }

        recordDatasetTransformation(`Suppression de la colonne ${columnName}`);
      } finally {
        await tick();
        isInternalOperation = false;
      }
    }
  }

  function openRenameModal(columnName: string) {
    columnToRename = columnName;
    renameModalOpen = true;
  }

  async function handleRename(newName: string) {
    if (columnToRename) {
      const oldName = columnToRename;

      await renameColumn(oldName, newName);

      renameModalOpen = false;
      columnToRename = null;
    }
  }

  function toggleColumnVisibility(columnName: string) {
    if (hiddenColumns.has(columnName)) {
      hiddenColumns.delete(columnName);
    } else {
      hiddenColumns.add(columnName);
    }
  }

  async function refreshFiltersState() {
    if (!tableName) {
      _filters = [];
      filterStats = {
        total: dataset?.rowCount ?? 0,
        filtered: dataset?.rowCount ?? 0
      };
      numRows = filterStats.filtered;
      return;
    }

    _filters = duckDBOrchestrator.getFilters(tableName);
    filterStats = await duckDBOrchestrator.getRowStats(tableName);
    numRows = filterStats.filtered;
  }

  async function afterFilterChange(transformationLabel?: string) {
    await refreshFiltersState();
    startIndex = 0;
    await initializeRows(0);
    if (transformationLabel) {
      recordDatasetTransformation(transformationLabel);
    }
  }

  async function handleRefine(columnName: string, operation: RefineOperation) {
    if (!tableName) return;

    await duckDBOrchestrator.refineColumn(tableName, columnName, operation);

    await loadColumnsInfo(true);
    await initializeRows(startIndex);

    recordDatasetTransformation(`Affinage (${operation}) sur ${columnName}`);
  }

  async function changeColumnType(columnName: string, duckType: string) {
    if (!tableName) return;

    await duckDBOrchestrator.changeColumnType(tableName, columnName, duckType);
    await loadColumnsInfo(true);
    await initializeRows(startIndex);

    recordDatasetTransformation(
      `Type de ${columnName} converti en ${duckType}`
    );
  }

  const visibleColumns = $derived.by(() => {
    const hidden = Array.from(hiddenColumns);
    return columns.filter((col) => !hidden.includes(col.name));
  });

  async function loadColumnsInfo(forceRefresh = false) {
    if (tableName) {
      const analysis = await duckDBOrchestrator.getFullAnalysis(
        tableName,
        forceRefresh
      );

      const newColumns = analysis
        .filter((a: AnalysisResult) => a.name !== 'geom' && a.name !== '__id')
        .map((a: AnalysisResult) => ({
          name: a.name,
          type: a.type_simple
        }));
      columns = [...newColumns];

      const analysisMap = new SvelteMap<string, AnalysisResult>();
      analysis.forEach((a: AnalysisResult) => {
        if (a.name !== 'geom' && a.name !== '__id') {
          analysisMap.set(a.name, a);
        }
      });
      columnAnalysis = analysisMap;

      if (sortColumn && !columns.some((c) => c.name === sortColumn)) {
        sortColumn = null;
        sortOrder = null;
      }
    } else if (dataset) {
      columns = [...dataset.columns.filter((c) => c.name !== 'geometry')];

      if (sortColumn && !columns.some((c) => c.name === sortColumn)) {
        sortColumn = null;
        sortOrder = null;
      }
    }
  }

  function getPlotForColumn(columnName: string) {
    const analysis = columnAnalysis.get(columnName);
    if (!analysis) {
      return null;
    }

    const histogramValue = analysis.histogram;

    const renderPlot = (summaryData: SummaryPlotData) => {
      try {
        const plot = create_summary_plot(summaryData, {
          width: 150,
          height: 48,
          main_color: '#a56eff',
          nulls_color: '#ffd666'
        });
        return plot;
      } catch (err) {
        logger.error('Error creating histogram', LogCategory.UI, err);
        return null;
      }
    };

    if (analysis.type_simple === 'string') {
      if (!isCategoricalHistogram(histogramValue)) {
        return null;
      }
      const summaryData: SummaryPlotData = {
        ...(analysis as SummaryPlotData & { type_simple: 'string' }),
        histogram: histogramValue
      };
      return renderPlot(summaryData);
    }

    if (analysis.type_simple === 'numeric' || analysis.type_simple === 'date') {
      if (!isNumericHistogram(histogramValue)) {
        return null;
      }
      const summaryData: SummaryPlotData = {
        ...(analysis as SummaryPlotData & {
          type_simple: 'numeric' | 'date';
        }),
        histogram: histogramValue
      };
      return renderPlot(summaryData);
    }

    return null;
  }

  onMount(() => {
    logger.debug('AdvancedDataTable mounted', LogCategory.UI, {
      tableName,
      datasetId: dataset?.id
    });
  });

  $effect(() => {
    if (highlightIds.length > 0 && numRows > 0) {
      untrack(() => goToId(highlightIds[0]));
    }
  });

  let lastDatasetId: string | undefined = undefined;
  let lastTableName: string | undefined = undefined;
  let isInternalOperation = false;

  $effect(() => {
    const currentTableName = tableName;
    const currentDataset = dataset;
    const currentDatasetId = currentDataset?.id;

    if (isInternalOperation) {
      return;
    }

    const datasetChanged = currentDatasetId !== lastDatasetId;
    const tableChanged = currentTableName !== lastTableName;

    if (!datasetChanged && !tableChanged) {
      return;
    }

    lastDatasetId = currentDatasetId;
    lastTableName = currentTableName;

    sortColumn = null;
    sortOrder = null;

    if (currentDataset || currentTableName) {
      untrack(async () => {
        isLoading = true;
        logger.debug('$effect: reloading table data', LogCategory.UI, {
          tableName: currentTableName,
          datasetId: currentDataset?.id
        });

        try {
          await loadColumnsInfo();

          if (currentTableName) {
            await refreshFiltersState();
          } else if (currentDataset) {
            numRows = currentDataset.rowCount;
            filterStats = {
              total: currentDataset.rowCount,
              filtered: currentDataset.rowCount
            };
          }

          await initializeRows(0);
          logger.debug('$effect: table data reloaded', LogCategory.UI, {
            rowCount: rows.length,
            tableDataLength: tableData.length
          });
        } catch (err) {
          logger.error('Error reloading table data', LogCategory.UI, err);
          error = err instanceof Error ? err.message : 'Failed to reload table';
        } finally {
          isLoading = false;
        }
      });
    } else {
      columns = [];
      numRows = 0;
      tableData = [];
      rows = [];
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getSkeletonProps = () => ({ columns: 5, rows: Math.floor(maxRows) }) as any;
</script>

<div class="advanced-data-table" bind:this={root}>
  {#if numRows > 0}
    {@const hasActiveFilters =
      tableName && filterStats.filtered < filterStats.total}
    {@const hasHiddenCols = hiddenColumns.size > 0}
    {#if hasActiveFilters || hasHiddenCols}
      <div class="table-header">
        {#if hasActiveFilters}
          <div class="table-info">
            <span class="filter-count">
              {filterStats.filtered.toLocaleString('fr-FR')} / {filterStats.total.toLocaleString(
                'fr-FR'
              )} lignes
            </span>
          </div>
        {/if}
        {#if hasHiddenCols}
          <div class="hidden-columns-info">
            <ViewOff size={16} />
            <span class="hidden-count">
              {hiddenColumns.size} colonne{hiddenColumns.size > 1 ? 's' : ''}
              masquée{hiddenColumns.size > 1 ? 's' : ''}
            </span>
            {#each Array.from(hiddenColumns) as hiddenCol (hiddenCol)}
              <button
                class="show-column-btn"
                onclick={() => toggleColumnVisibility(hiddenCol)}
                title={`Afficher ${hiddenCol}`}
              >
                <View size={16} />
                {hiddenCol}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/if}

  {#if showSkeleton}
    <div class="skeleton-wrapper" style="max-height: {maxHeight}px;">
      <DataTableSkeleton {...getSkeletonProps()} />
    </div>
  {:else if error}
    <div class="error-message">
      <p>Erreur: {error}</p>
    </div>
  {:else if columns.length > 0}
    <div
      class="table-container"
      style="max-height: {maxHeight}px;"
      bind:this={tableContainer}
      onscroll={handleScroll}
    >
      <table bind:this={tableElement}>
        <thead>
          <tr>
            {#each visibleColumns as column (column.name)}
              {@const analysis = columnAnalysis.get(column.name)}
              <th>
                <div class="col-header">
                  <div class="col-title-row">
                    <span class="col-name" title={column.name}
                      >{column.name}</span
                    >
                    <div class="col-actions">
                      {#if tableName}
                        <OverflowMenu size="sm" flipped>
                          <OverflowMenuItem
                            text="Renommer"
                            on:click={() => openRenameModal(column.name)}
                          />
                          <OverflowMenuItem
                            text={m.column_type_change()}
                            hasDivider
                          />
                          {#each COLUMN_TYPE_OPTIONS as typeOption (typeOption.value)}
                            <OverflowMenuItem
                              text={`  → ${typeOption.label}`}
                              on:click={() =>
                                changeColumnType(column.name, typeOption.value)}
                            />
                          {/each}
                          <OverflowMenuItem text="Affiner..." hasDivider />
                          <OverflowMenuItem
                            text="  → MAJUSCULES"
                            on:click={() =>
                              handleRefine(
                                column.name,
                                RefineOperation.UPPERCASE
                              )}
                          />
                          <OverflowMenuItem
                            text="  → minuscules"
                            on:click={() =>
                              handleRefine(
                                column.name,
                                RefineOperation.LOWERCASE
                              )}
                          />
                          <OverflowMenuItem
                            text="  → Casse Titre"
                            on:click={() =>
                              handleRefine(
                                column.name,
                                RefineOperation.TITLECASE
                              )}
                          />
                          <OverflowMenuItem
                            text="  → Supprimer espaces"
                            on:click={() =>
                              handleRefine(column.name, RefineOperation.TRIM)}
                          />
                          <OverflowMenuItem
                            text="  → Espaces multiples"
                            on:click={() =>
                              handleRefine(
                                column.name,
                                RefineOperation.TRIM_ALL
                              )}
                          />
                          <OverflowMenuItem
                            text={hiddenColumns.has(column.name)
                              ? 'Afficher'
                              : 'Masquer'}
                            hasDivider
                            on:click={() => toggleColumnVisibility(column.name)}
                          />
                          <OverflowMenuItem
                            text="Supprimer"
                            danger
                            on:click={() => dropColumn(column.name)}
                          />
                        </OverflowMenu>
                      {/if}
                      <div class="sort-buttons">
                        <button
                          class="sort-btn"
                          class:active={sortColumn === column.name &&
                            sortOrder === 'ASC'}
                          onclick={() => sortTable(column.name, 'ASC')}
                          title="Tri croissant"
                        >
                          ▲
                        </button>
                        <button
                          class="sort-btn"
                          class:active={sortColumn === column.name &&
                            sortOrder === 'DESC'}
                          onclick={() => sortTable(column.name, 'DESC')}
                          title="Tri décroissant"
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  </div>
                  <!-- Summary plot -->
                  {#if showSummaryPlots && analysis}
                    {@const plotElement = getPlotForColumn(column.name)}
                    <div class="summary-plot">
                      {#if plotElement}
                        <SummaryPlot svgElement={plotElement} />
                      {:else if analysis.type_simple === 'string'}
                        <span class="unique-count"
                          >{analysis.uniques ?? 0} valeurs uniques</span
                        >
                      {/if}
                    </div>
                  {/if}
                </div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if tableData.length === 0}
            {#each rows as _row, idx (idx)}
              <tr>
                {#each visibleColumns as _col, colIdx (colIdx)}
                  <td><div class="skeleton-cell"></div></td>
                {/each}
              </tr>
            {/each}
          {:else}
            {#each tableData as row, i (rows[i])}
              {@const rowId = row.__id as number | undefined}
              {@const rowDisplayId = rowId ?? rows[i] + 1}
              <tr class:highlight={highlightIds.includes(rowDisplayId)}>
                {#each visibleColumns as col (col.name)}
                  {@const value = row[col.name]}
                  {@const isNumeric =
                    col.type === 'number' ||
                    col.type === 'integer' ||
                    col.type === 'bigint'}
                  {@const isDate = col.type === 'date'}
                  <td class:numeric={isNumeric}>
                    {#if value === null || value === undefined}
                      <span class="null-value">—</span>
                    {:else if isDate && value instanceof Date}
                      {value.toLocaleDateString('fr-FR')}
                    {:else if isNumeric}
                      {Number(value).toLocaleString('fr-FR')}
                    {:else}
                      {String(value)}
                    {/if}
                  </td>
                {/each}
              </tr>
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

{#if columnToRename}
  <ColumnRenameModal
    bind:open={renameModalOpen}
    columnName={columnToRename}
    onClose={() => {
      renameModalOpen = false;
      columnToRename = null;
    }}
    onRename={handleRename}
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

  .table-header {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-03) 0;
    margin-bottom: var(--cds-spacing-03);
  }

  .table-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cds-spacing-03);
    font-size: 0.875rem;
    color: var(--cds-text-02);
  }

  .filter-count {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--cds-text-02);
  }

  .hidden-columns-info {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-03);
    background-color: var(--cds-ui-03);
    border-radius: 4px;
    flex-wrap: wrap;
  }

  .hidden-columns-info :global(svg) {
    color: var(--cds-icon-02);
  }

  .hidden-count {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 600;
  }

  .show-column-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    padding: var(--cds-spacing-02) var(--cds-spacing-03);
    background-color: var(--cds-ui-01);
    border: 1px solid var(--cds-ui-04);
    border-radius: 4px;
    color: var(--cds-text-01);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .show-column-btn:hover {
    background-color: var(--cds-hover-ui);
    border-color: var(--cds-interactive-01);
  }

  .show-column-btn :global(svg) {
    color: var(--cds-icon-01);
  }

  .show-column-btn:focus-visible {
    outline: 2px solid var(--cds-focus);
    outline-offset: 2px;
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

  thead th {
    text-align: left;
    vertical-align: top;
    padding: var(--cds-spacing-03);
    border-bottom: 2px solid var(--cds-ui-03);
    min-width: 150px;
  }

  .col-header {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .col-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cds-spacing-02);
  }

  .col-name {
    font-weight: 600;
    color: var(--cds-text-01);
    font-size: 0.875rem;
    flex: 1;
  }

  .col-actions {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .sort-buttons {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .sort-btn {
    border: none;
    background: none;
    padding: 0;
    color: gray;
    cursor: pointer;
    font-size: 10px;
    line-height: 1;
  }

  .sort-btn:hover {
    color: white;
  }

  .sort-btn.active {
    color: white;
  }

  .summary-plot {
    height: 64px;
    margin-top: var(--cds-spacing-02);
  }

  .unique-count {
    display: inline-block;
    background-color: var(--cds-interactive-01);
    color: var(--cds-text-04);
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  tbody tr {
    border-bottom: 1px solid var(--cds-ui-03);
    transition: background-color 0.15s;
  }

  tbody tr:hover {
    background-color: var(--cds-hover-ui);
  }

  tbody tr.highlight {
    background-color: var(--cds-support-03);
  }

  tbody td {
    padding: var(--cds-spacing-02) var(--cds-spacing-03);
    color: var(--cds-text-01);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  td.numeric {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .null-value {
    color: var(--cds-text-03);
    font-style: italic;
  }

  .skeleton-wrapper {
    overflow: hidden;
  }

  /* Cache le header et la toolbar du DataTableSkeleton */
  .skeleton-wrapper :global(.bx--data-table-header),
  .skeleton-wrapper :global(.bx--table-toolbar) {
    display: none;
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
