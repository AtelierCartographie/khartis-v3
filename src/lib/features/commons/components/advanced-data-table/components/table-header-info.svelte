<script lang="ts">
  import type { FilterStats } from '$lib/features/duckdb';
  import * as m from '$lib/paraglide/messages';
  import { resolveLocale } from '$lib/features/commons/utils/format.utils';

  interface Props {
    filterStats: FilterStats;
  }

  const { filterStats }: Props = $props();

  const numberLocale = $derived(resolveLocale());
  const hasActiveFilters = $derived(filterStats.filtered < filterStats.total);
</script>

{#if hasActiveFilters}
  <div class="table-header">
    <div class="table-info">
      <span class="filter-count" title={m.filter_count_tooltip()}>
        {m.filter_count_display({
          filtered: filterStats.filtered.toLocaleString(numberLocale),
          total: filterStats.total.toLocaleString(numberLocale)
        })}
      </span>
    </div>
  </div>
{/if}

<style>
  .table-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 0;
    margin-bottom: 4px;
  }

  .table-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 12px;
    color: var(--cds-text-02, #525252);
  }

  .filter-count {
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.32px;
    color: var(--cds-text-02, #525252);
  }
</style>
