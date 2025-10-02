<script lang="ts">
  import {
    DataTableSkeleton,
    OverflowMenu,
    OverflowMenuItem
  } from 'carbon-components-svelte';
  import { onMount, untrack } from 'svelte';
  import { duckDBOrchestrator } from '../services/duckdb-orchestrator.service';
  import type { ProcessedDataset } from '../utils/data-pipeline.utils';
  import { logger, LogCategory } from '../utils/logger';
  import { create_summary_plot } from '../services/duckdb/summary-plot';
  import SummaryPlot from '../services/duckdb/SummaryPlot.svelte';
  import type { AnalysisResult } from '../services/duckdb/types';

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
  let columnAnalysis = $state<Map<string, AnalysisResult>>(new Map());
  let numRows = $state(0);
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  const rowHeight = 32;
  const maxHeight = (maxRows + 1) * rowHeight;
  let startIndex = 0;
  let offsetRows = 1;
  let rows = $state<number[]>([]);
  type TableRow = Record<string, unknown>;
  let tableData = $state<TableRow[]>([]);
  let sortColumn = $state<string | null>(null);
  let sortOrder = $state<'ASC' | 'DESC' | null>(null);

  function createIndexArray(length: number, start = 0): number[] {
    return Array.from({ length }, (_, i) => i + start);
  }

  function initializeRows(start: number) {
    const end = numRows - start;
    const length = Math.min(end, maxRows * 2);
    rows = createIndexArray(length, start);
    loadRowsData();
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
    await loadRowsData();
  }

  function goToId(id: number) {
    if (numRows === 0 || id > numRows) return;

    const index = id - 1;
    if (index !== -1) {
      startIndex = Math.max(0, index - offsetRows);
      initializeRows(startIndex);
      const scrollPosition = offsetRows * rowHeight;
      if (tableContainer) {
        tableContainer.scrollTop = scrollPosition;
      }
    }
  }

  async function renameColumn(oldName: string, newName: string) {
    if (tableName) {
      await duckDBOrchestrator.renameColumn(tableName, oldName, newName);
      await loadColumnsInfo();
    }
  }

  async function changeColumnType(columnName: string, newType: string) {
    if (tableName) {
      await duckDBOrchestrator.changeColumnType(tableName, columnName, newType);
      await loadColumnsInfo();
    }
  }

  async function dropColumn(columnName: string) {
    if (tableName) {
      await duckDBOrchestrator.dropColumn(tableName, columnName);
      await loadColumnsInfo();
    }
  }

  async function loadColumnsInfo() {
    if (tableName) {
      logger.debug('Loading columns with analysis', LogCategory.UI, {
        tableName
      });
      const analysis = await duckDBOrchestrator.getFullAnalysis(tableName);
      logger.debug('Analysis loaded', LogCategory.UI, {
        count: analysis.length,
        sample: analysis[0]
      });
      columns = analysis.map((a: AnalysisResult) => ({
        name: a.name,
        type: a.type_simple
      }));
      columns = columns.filter((c) => c.name !== 'geom' && c.name !== '__id');

      const analysisMap = new Map<string, AnalysisResult>();
      analysis.forEach((a: AnalysisResult) => {
        if (a.name !== 'geom' && a.name !== '__id') {
          analysisMap.set(a.name, a);
        }
      });
      columnAnalysis = analysisMap;
      logger.debug('Column analysis map created', LogCategory.UI, {
        size: columnAnalysis.size
      });
    } else if (dataset) {
      logger.debug(
        'Loading columns from dataset (no analysis)',
        LogCategory.UI
      );
      columns = dataset.columns.filter((c) => c.name !== 'geometry');
    }
  }

  function getPlotForColumn(columnName: string) {
    const analysis = columnAnalysis.get(columnName);
    if (!analysis) {
      logger.debug('No analysis for column', LogCategory.UI, {
        columnName,
        analysisSize: columnAnalysis.size
      });
      return null;
    }

    logger.debug('Creating plot for column', LogCategory.UI, {
      columnName,
      typeSimple: analysis.type_simple,
      hasHistogram: !!analysis.histogram
    });

    try {
      const plot = create_summary_plot(analysis as any, {
        width: 150,
        height: 48,
        main_color: '#a56eff',
        nulls_color: '#ffd666'
      });
      logger.debug('Plot created successfully', LogCategory.UI, { columnName });
      return plot;
    } catch (err) {
      logger.error('Error creating histogram', LogCategory.UI, err);
      return null;
    }
  }

  onMount(async () => {
    isLoading = true;

    try {
      await loadColumnsInfo();

      if (tableName) {
        numRows = await duckDBOrchestrator.getRowCount(tableName);
      } else if (dataset) {
        numRows = dataset.rowCount;
      }

      initializeRows(startIndex);
    } catch (err) {
      logger.error('Error on mount', LogCategory.UI, err);
      error = err instanceof Error ? err.message : 'Failed to initialize table';
    } finally {
      isLoading = false;
    }
  });

  $effect(() => {
    if (highlightIds.length > 0 && numRows > 0) {
      untrack(() => goToId(highlightIds[0]));
    }
  });

  $effect(() => {
    if (tableName) {
      untrack(async () => {
        await loadColumnsInfo();
        numRows = await duckDBOrchestrator.getRowCount(tableName);
        initializeRows(0);
      });
    }
  });

  $effect(() => {
    if (dataset) {
      untrack(() => {
        loadColumnsInfo();
        numRows = dataset.rowCount;
        initializeRows(0);
      });
    }
  });
</script>

<div class="advanced-data-table" bind:this={root}>
  {#if numRows > 0}
    <div class="table-info">
      <span class="data-count">
        {numRows.toLocaleString('fr-FR')} lignes au total
      </span>
      <span class="visible-count">
        {rows.length.toLocaleString('fr-FR')} lignes affichées
      </span>
    </div>
  {/if}

  {#if isLoading}
    <DataTableSkeleton headers={['Chargement...']} rows={5} />
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
            {#each columns as column}
              {@const analysis = columnAnalysis.get(column.name)}
              <th>
                <div class="col-header">
                  <div class="col-title-row">
                    <span class="col-name">{column.name}</span>
                    <div class="col-actions">
                      <div class="sort-buttons">
                        <button
                          class="sort-btn"
                          class:active={sortColumn === column.name &&
                            sortOrder === 'ASC'}
                          onclick={() => sortTable(column.name, 'ASC')}
                        >
                          ▲
                        </button>
                        <button
                          class="sort-btn"
                          class:active={sortColumn === column.name &&
                            sortOrder === 'DESC'}
                          onclick={() => sortTable(column.name, 'DESC')}
                        >
                          ▼
                        </button>
                      </div>
                      {#if tableName}
                        <OverflowMenu size="sm" light>
                          <OverflowMenuItem
                            text="Renommer"
                            on:click={() =>
                              renameColumn(column.name, `${column.name}_new`)}
                          />
                          <OverflowMenuItem
                            text="Changer le type"
                            on:click={() =>
                              changeColumnType(column.name, 'VARCHAR')}
                          />
                          <OverflowMenuItem
                            text="Supprimer"
                            on:click={() => dropColumn(column.name)}
                          />
                        </OverflowMenu>
                      {/if}
                    </div>
                  </div>
                  {#if showSummaryPlots && analysis}
                    {@const plotElement = getPlotForColumn(column.name)}
                    <div class="summary-plot">
                      {#if analysis.type_simple === 'numeric' || analysis.type_simple === 'date'}
                        {#if plotElement}
                          <div class="plot-container">
                            <SummaryPlot svgElement={plotElement} />
                          </div>
                        {/if}
                      {:else if analysis.type_simple === 'string'}
                        <div class="categorical-info">
                          <span class="unique-count"
                            >{analysis.uniques ?? 0} valeurs uniques</span
                          >
                        </div>
                        {#if plotElement}
                          <div class="plot-container">
                            <SummaryPlot svgElement={plotElement} />
                          </div>
                        {/if}
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
            {#each rows as _}
              <tr>
                {#each columns as _}
                  <td><div class="skeleton-cell"></div></td>
                {/each}
              </tr>
            {/each}
          {:else}
            {#each tableData as row, i}
              <tr class:highlight={highlightIds.includes(rows[i] + 1)}>
                {#each columns as col}
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
  {:else}
    <div class="empty-state">
      <p>Aucune donnée disponible</p>
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

  .table-info {
    display: flex;
    justify-content: space-between;
    padding: var(--cds-spacing-03) 0;
    margin-bottom: var(--cds-spacing-03);
    font-size: 0.875rem;
    color: var(--cds-text-02);
  }

  .data-count {
    font-weight: 600;
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
    gap: 2px;
  }

  .sort-btn {
    border: none;
    background: none;
    padding: 2px 4px;
    color: var(--cds-text-03);
    font-size: 0.625rem;
    cursor: pointer;
    transition: color 0.15s;
  }

  .sort-btn:hover {
    color: var(--cds-text-01);
  }

  .sort-btn.active {
    color: var(--cds-interactive-01);
  }

  .summary-plot {
    margin-top: var(--cds-spacing-03);
    min-height: 48px;
  }

  .plot-container {
    width: 100%;
    display: flex;
    justify-content: center;
  }

  .plot-container :global(svg) {
    max-width: 100%;
    height: auto;
  }

  .categorical-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-02) 0;
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .unique-count {
    font-size: 0.75rem;
    color: var(--cds-text-02);
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

  .skeleton-cell {
    height: 20px;
    background: linear-gradient(
      100deg,
      var(--cds-ui-03) 40%,
      var(--cds-ui-02) 50%,
      var(--cds-ui-03) 60%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 3px;
  }

  @keyframes shimmer {
    0% {
      background-position: 100% 0;
    }
    100% {
      background-position: -100% 0;
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
