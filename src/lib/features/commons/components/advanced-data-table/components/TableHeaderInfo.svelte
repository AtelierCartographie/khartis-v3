<script lang="ts">
  import type { FilterStats } from '$lib/features/duckdb';
  import { View, ViewOff } from 'carbon-icons-svelte';

  interface Props {
    filterStats: FilterStats;
    hiddenColumns: Set<string>;
    onShowColumn: (columnName: string) => void;
  }

  const { filterStats, hiddenColumns, onShowColumn }: Props = $props();

  const hasActiveFilters = $derived(filterStats.filtered < filterStats.total);
  const hasHiddenCols = $derived(hiddenColumns.size > 0);
  const hiddenColumnsArray = $derived(Array.from(hiddenColumns));
</script>

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
        {#each hiddenColumnsArray as hiddenCol (hiddenCol)}
          <button
            class="show-column-btn"
            onclick={() => onShowColumn(hiddenCol)}
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

<style>
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
</style>
