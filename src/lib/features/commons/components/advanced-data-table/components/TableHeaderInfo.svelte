<script lang="ts">
  import type { FilterStats } from '$lib/features/duckdb';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    filterStats: FilterStats;
  }

  const { filterStats }: Props = $props();

  const hasActiveFilters = $derived(filterStats.filtered < filterStats.total);
</script>

{#if hasActiveFilters}
  <div class="table-header">
    <div class="table-info">
      <span class="filter-count" title={m.filter_count_tooltip()}>
        {m.filter_count_display({
          filtered: filterStats.filtered.toLocaleString('fr-FR'),
          total: filterStats.total.toLocaleString('fr-FR')
        })}
      </span>
    </div>
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
</style>
