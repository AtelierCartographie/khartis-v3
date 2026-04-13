<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import {
    Search,
    Filter,
    Calculator,
    TrashCan,
    Reset,
    Maximize,
    Settings,
    ChartHistogram,
    View
  } from 'carbon-icons-svelte';
  import { Button } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import { dataToolsStore, DataToolType } from '../data-tools.store.svelte';

  interface Props {
    onDelete?: () => void;
    onReset?: () => void;
    onExpand?: () => void;
    onCsvOptions?: () => void;
    onShowHiddenColumns?: () => void;
    onToggleSummaryPlots?: () => void;
    deleteDisabled?: boolean;
    deleteActive?: boolean;
    resetDisabled?: boolean;
    selectionCount?: number;
    showCsvOptions?: boolean;
    showHiddenColumns?: boolean;
    showSummaryPlots?: boolean;
  }

  let {
    onDelete,
    onReset,
    onExpand,
    onCsvOptions,
    onShowHiddenColumns,
    onToggleSummaryPlots,
    deleteDisabled = true,
    deleteActive = false,
    resetDisabled = false,
    selectionCount = 0,
    showCsvOptions = false,
    showHiddenColumns = false,
    showSummaryPlots = true
  }: Props = $props();

  const hasSelection = $derived(selectionCount > 0);
  const effectiveDeleteDisabled = $derived(deleteDisabled);

  const isSearchActive = $derived(
    dataToolsStore.activeTool === DataToolType.Search
  );
  const isFiltersActive = $derived(
    dataToolsStore.activeTool === DataToolType.Filters
  );
  const isCalculatorActive = $derived(
    dataToolsStore.activeTool === DataToolType.Calculator
  );
</script>

<div class="data-tools-bar">
  <div class="tools-left">
    <IconButton
      kind="ghost"
      size="small"
      icon={ChartHistogram}
      iconDescription={m.data_toggle_summary_plots()}
      tooltipPosition="bottom"
      class={showSummaryPlots ? 'active' : ''}
      on:click={() => onToggleSummaryPlots?.()}
    />
    <IconButton
      kind="ghost"
      size="small"
      icon={Search}
      iconDescription={m.data_tool_search_icon()}
      tooltipPosition="bottom"
      class={isSearchActive ? 'active' : ''}
      on:click={() => dataToolsStore.toggleTool(DataToolType.Search)}
    />
    <IconButton
      kind="ghost"
      size="small"
      icon={Filter}
      iconDescription={m.data_tool_filters_icon()}
      tooltipPosition="bottom"
      class={isFiltersActive ? 'active' : ''}
      on:click={() => dataToolsStore.toggleTool(DataToolType.Filters)}
    />
    <IconButton
      kind="ghost"
      size="small"
      icon={Calculator}
      iconDescription={m.data_tool_calculator_icon()}
      tooltipPosition="bottom"
      class={isCalculatorActive ? 'active' : ''}
      on:click={() => dataToolsStore.toggleTool(DataToolType.Calculator)}
    />
    <IconButton
      kind="ghost"
      size="small"
      icon={TrashCan}
      iconDescription={m.data_tool_trash()}
      tooltipPosition="bottom"
      disabled={effectiveDeleteDisabled}
      class={deleteActive ? 'active' : ''}
      on:click={() => onDelete?.()}
    />
    {#if hasSelection}
      <span class="selection-count">
        {m.selection_count({ count: selectionCount })}
      </span>
    {/if}
    {#if showHiddenColumns}
      <IconButton
        kind="ghost"
        size="small"
        icon={View}
        iconDescription={m.column_show()}
        tooltipPosition="bottom"
        on:click={() => onShowHiddenColumns?.()}
      />
    {/if}
    {#if showCsvOptions}
      <IconButton
        kind="ghost"
        size="small"
        icon={Settings}
        iconDescription={m.csv_options_button()}
        tooltipPosition="bottom"
        on:click={() => onCsvOptions?.()}
      />
    {/if}
    <IconButton
      kind="ghost"
      size="small"
      icon={Reset}
      iconDescription={m.data_tool_reset_icon()}
      tooltipPosition="bottom"
      disabled={resetDisabled}
      on:click={() => onReset?.()}
    />
  </div>
  <div class="tools-right">
    <Button
      kind="ghost"
      size="small"
      icon={Maximize}
      iconDescription={m.data_tool_expand_icon()}
      on:click={() => onExpand?.()}
    >
      {m.data_tool_expand_label()}
    </Button>
  </div>
</div>

<style>
  .data-tools-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: var(--cds-spacing-02);
    margin-bottom: 0;
  }

  .tools-left {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-01);
  }

  .tools-right {
    display: flex;
    align-items: center;
  }

  .data-tools-bar :global(.bx--btn.active) {
    background-color: var(--cds-selected-ui);
  }

  .data-tools-bar :global(.bx--btn.active svg) {
    fill: var(--cds-interactive-01);
  }

  .selection-count {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    padding: 0 var(--cds-spacing-03);
    background-color: var(--cds-ui-03);
    border-radius: 12px;
    line-height: 24px;
    white-space: nowrap;
  }
</style>
