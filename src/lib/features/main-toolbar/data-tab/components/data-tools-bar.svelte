<script lang="ts">
  import { Button } from 'carbon-components-svelte';
  import {
    Search,
    Filter,
    Calculator,
    TrashCan,
    Reset,
    Maximize,
    Settings,
    ChartHistogram,
    ViewOff
  } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';
  import { dataToolsStore, DataToolType } from '../data-tools.store.svelte';

  interface Props {
    onDelete?: () => void;
    onReset?: () => void;
    onExpand?: () => void;
    onCsvOptions?: () => void;
    onToggleSummaryPlots?: () => void;
    deleteDisabled?: boolean;
    resetDisabled?: boolean;
    selectionCount?: number;
    showCsvOptions?: boolean;
    showSummaryPlots?: boolean;
  }

  let {
    onDelete,
    onReset,
    onExpand,
    onCsvOptions,
    onToggleSummaryPlots,
    deleteDisabled = true,
    resetDisabled = false,
    selectionCount = 0,
    showCsvOptions = false,
    showSummaryPlots = true
  }: Props = $props();

  const hasSelection = $derived(selectionCount > 0);
  const effectiveDeleteDisabled = $derived(deleteDisabled && !hasSelection);

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
    <Button
      kind="ghost"
      size="small"
      icon={Search}
      iconDescription={m.data_tool_search_icon()}
      tooltipPosition="bottom"
      class={isSearchActive ? 'active' : ''}
      on:click={() => dataToolsStore.toggleTool(DataToolType.Search)}
    />
    <Button
      kind="ghost"
      size="small"
      icon={Filter}
      iconDescription={m.data_tool_filters_icon()}
      tooltipPosition="bottom"
      class={isFiltersActive ? 'active' : ''}
      on:click={() => dataToolsStore.toggleTool(DataToolType.Filters)}
    />
    <Button
      kind="ghost"
      size="small"
      icon={Calculator}
      iconDescription={m.data_tool_calculator_icon()}
      tooltipPosition="bottom"
      class={isCalculatorActive ? 'active' : ''}
      on:click={() => dataToolsStore.toggleTool(DataToolType.Calculator)}
    />
    {#if hasSelection}
      <span class="selection-count">
        {m.selection_count({ count: selectionCount })}
      </span>
    {/if}
    <Button
      kind="ghost"
      size="small"
      icon={TrashCan}
      iconDescription={m.data_tool_trash()}
      tooltipPosition="bottom"
      disabled={effectiveDeleteDisabled}
      on:click={() => onDelete?.()}
    />
    <Button
      kind="ghost"
      size="small"
      icon={Reset}
      iconDescription={m.data_tool_reset_icon()}
      tooltipPosition="bottom"
      disabled={resetDisabled}
      on:click={() => onReset?.()}
    />
    {#if showCsvOptions}
      <Button
        kind="ghost"
        size="small"
        icon={Settings}
        iconDescription={m.csv_options_button()}
        tooltipPosition="bottom"
        on:click={() => onCsvOptions?.()}
      />
    {/if}
    <Button
      kind="ghost"
      size="small"
      icon={showSummaryPlots ? ChartHistogram : ViewOff}
      iconDescription={m.data_toggle_summary_plots()}
      tooltipPosition="bottom"
      class={showSummaryPlots ? 'active' : ''}
      on:click={() => onToggleSummaryPlots?.()}
    />
  </div>
  <div class="tools-right">
    <span class="expand-label">{m.data_tool_expand_label()}</span>
    <Button
      kind="ghost"
      size="small"
      icon={Maximize}
      iconDescription={m.data_tool_expand_icon()}
      tooltipPosition="bottom"
      on:click={() => onExpand?.()}
    />
  </div>
</div>

<style>
  .data-tools-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-02) 0;
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
    gap: var(--cds-spacing-02);
  }

  .expand-label {
    font-size: 0.875rem;
    color: var(--cds-text-02);
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
