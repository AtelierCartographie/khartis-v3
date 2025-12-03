<script lang="ts">
  import { RefineOperation, type AnalysisResult } from '$lib/features/duckdb';
  import SummaryPlot from '$lib/features/duckdb/services/duckdb/SummaryPlot.svelte';
  import { OverflowMenu, OverflowMenuItem } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import type { ColumnInfo } from '../types';
  import { getPlotForColumn } from '../histogram.utils';

  interface ColumnTypeOption {
    label: string;
    value: string;
  }

  interface Props {
    column: ColumnInfo;
    analysis?: AnalysisResult;
    columnAnalysis: Map<string, AnalysisResult>;
    sortColumn: string | null;
    sortOrder: 'ASC' | 'DESC' | null;
    showSummaryPlots: boolean;
    isEditMode: boolean;
    columnTypeOptions: ColumnTypeOption[];
    onSort: (column: string, order: 'ASC' | 'DESC') => void;
    onRename: (columnName: string) => void;
    onChangeType: (columnName: string, type: string) => void;
    onRefine: (columnName: string, operation: RefineOperation) => void;
    onToggleVisibility: (columnName: string) => void;
    onDrop: (columnName: string) => void;
  }

  const {
    column,
    analysis,
    columnAnalysis,
    sortColumn,
    sortOrder,
    showSummaryPlots,
    isEditMode,
    columnTypeOptions,
    onSort,
    onRename,
    onChangeType,
    onRefine,
    onToggleVisibility,
    onDrop
  }: Props = $props();

  const plotElement = $derived(
    showSummaryPlots && analysis
      ? getPlotForColumn(column.name, columnAnalysis)
      : null
  );
</script>

<th>
  <div class="col-header">
    <div class="col-title-row">
      <span class="col-name" title={column.name}>{column.name}</span>
      <div class="col-actions">
        {#if isEditMode}
          <OverflowMenu size="sm" flipped>
            <OverflowMenuItem
              text="Renommer"
              on:click={() => onRename(column.name)}
            />
            <OverflowMenuItem text={m.column_type_change()} hasDivider />
            {#each columnTypeOptions as typeOption (typeOption.value)}
              <OverflowMenuItem
                text={`  → ${typeOption.label}`}
                on:click={() => onChangeType(column.name, typeOption.value)}
              />
            {/each}
            <OverflowMenuItem text="Affiner..." hasDivider />
            <OverflowMenuItem
              text="  → MAJUSCULES"
              on:click={() => onRefine(column.name, RefineOperation.UPPERCASE)}
            />
            <OverflowMenuItem
              text="  → minuscules"
              on:click={() => onRefine(column.name, RefineOperation.LOWERCASE)}
            />
            <OverflowMenuItem
              text="  → Casse Titre"
              on:click={() => onRefine(column.name, RefineOperation.TITLECASE)}
            />
            <OverflowMenuItem
              text="  → Supprimer espaces"
              on:click={() => onRefine(column.name, RefineOperation.TRIM)}
            />
            <OverflowMenuItem
              text="  → Espaces multiples"
              on:click={() => onRefine(column.name, RefineOperation.TRIM_ALL)}
            />
            <OverflowMenuItem
              text="Masquer"
              hasDivider
              on:click={() => onToggleVisibility(column.name)}
            />
            <OverflowMenuItem
              text="Supprimer"
              danger
              on:click={() => onDrop(column.name)}
            />
          </OverflowMenu>
        {/if}
        <div class="sort-buttons">
          <button
            class="sort-btn"
            class:active={sortColumn === column.name && sortOrder === 'ASC'}
            onclick={() => onSort(column.name, 'ASC')}
            title="Tri croissant"
          >
            ▲
          </button>
          <button
            class="sort-btn"
            class:active={sortColumn === column.name && sortOrder === 'DESC'}
            onclick={() => onSort(column.name, 'DESC')}
            title="Tri décroissant"
          >
            ▼
          </button>
        </div>
      </div>
    </div>
    {#if showSummaryPlots && analysis}
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

<style>
  th {
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
    color: var(--cds-text-02);
    cursor: pointer;
    font-size: 10px;
    line-height: 1;
  }

  .sort-btn:hover {
    color: var(--cds-text-01);
  }

  .sort-btn.active {
    color: var(--cds-text-01);
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
</style>
