<script lang="ts">
  import { ProgressBar, Tag } from 'carbon-components-svelte';
  import { Filter } from 'carbon-icons-svelte';
  import { m } from '$lib/paraglide/messages';

  interface FilterSummaryBarProps {
    filteredCount: number;
    totalCount: number;
    filterCount: number;
    onScrollToFilters?: () => void;
  }

  let {
    filteredCount,
    totalCount,
    filterCount,
    onScrollToFilters
  }: FilterSummaryBarProps = $props();

  const percentage = $derived(
    totalCount > 0 ? Math.round((filteredCount / totalCount) * 100) : 0
  );

  // Color coding based on percentage filtered
  const colorClass = $derived(
    percentage <= 30
      ? 'filter-low'
      : percentage <= 70
        ? 'filter-medium'
        : 'filter-high'
  );

  const tagType = $derived(
    percentage <= 30 ? 'green' : percentage <= 70 ? 'gray' : 'red'
  );

  const shouldPulse = $derived(percentage > 50);

  function handleClick() {
    if (onScrollToFilters) {
      onScrollToFilters();
    }
  }
</script>

<div class="filter-summary-bar" class:pulse={shouldPulse}>
  <div class="summary-header">
    <button
      class="summary-title"
      type="button"
      onclick={handleClick}
      aria-label="Scroll to filters section"
    >
      <Filter size={16} />
      <span class="title-text">
        {m.filter_summary_active({
          count: filterCount.toString(),
          percent: percentage.toString()
        })}
      </span>
    </button>

    <Tag type={tagType} size="sm">
      {filteredCount} / {totalCount} lignes
    </Tag>
  </div>

  <div class="progress-container">
    <ProgressBar
      value={percentage}
      max={100}
      helperText="{filteredCount} lignes affichées sur {totalCount} total"
      size="sm"
      class={colorClass}
    />
  </div>
</div>

<style>
  .filter-summary-bar {
    position: sticky;
    top: 0;
    z-index: 100;
    background-color: var(--cds-layer-01);
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    padding: var(--cds-spacing-04);
    margin-bottom: var(--cds-spacing-05);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .filter-summary-bar.pulse {
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    50% {
      box-shadow: 0 1px 8px
        rgba(var(--cds-support-warning-rgb, 255, 174, 0), 0.4);
    }
  }

  .summary-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cds-spacing-03);
    margin-bottom: var(--cds-spacing-03);
  }

  .summary-title {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-primary);
    transition: color 0.2s ease;
  }

  .summary-title:hover {
    color: var(--cds-interactive-01);
  }

  .summary-title :global(svg) {
    fill: var(--cds-icon-primary);
  }

  .title-text {
    line-height: 1;
  }

  .progress-container {
    width: 100%;
  }

  .progress-container :global(.bx--progress-bar__label) {
    display: none;
  }

  .progress-container :global(.bx--progress-bar__helper-text) {
    font-size: 0.75rem;
    color: var(--cds-text-secondary);
    margin-top: var(--cds-spacing-02);
  }

  /* Progress bar color variants */
  .progress-container :global(.filter-low .bx--progress-bar__bar) {
    background-color: var(--cds-support-success);
  }

  .progress-container :global(.filter-medium .bx--progress-bar__bar) {
    background-color: var(--cds-support-warning);
  }

  .progress-container :global(.filter-high .bx--progress-bar__bar) {
    background-color: var(--cds-support-error);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .summary-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .summary-title {
      font-size: 0.8125rem;
    }
  }
</style>
