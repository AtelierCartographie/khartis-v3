<script lang="ts">
  import { Button } from 'carbon-components-svelte';
  import {
    Search,
    Filter,
    Calculator,
    TrashCan,
    Reset,
    Maximize
  } from 'carbon-icons-svelte';
  import { dataToolsStore } from '../data-tools.store.svelte';
  import { DataToolType } from '../data-tab.types';

  interface Props {
    onDelete?: () => void;
    onReset?: () => void;
    onExpand?: () => void;
    deleteDisabled?: boolean;
  }

  let { onDelete, onReset, onExpand, deleteDisabled = true }: Props = $props();

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
      iconDescription="Rechercher"
      tooltipPosition="bottom"
      class={isSearchActive ? 'active' : ''}
      on:click={() => dataToolsStore.toggleTool(DataToolType.Search)}
    />
    <Button
      kind="ghost"
      size="small"
      icon={Filter}
      iconDescription="Filtres"
      tooltipPosition="bottom"
      class={isFiltersActive ? 'active' : ''}
      on:click={() => dataToolsStore.toggleTool(DataToolType.Filters)}
    />
    <Button
      kind="ghost"
      size="small"
      icon={Calculator}
      iconDescription="Calculatrice"
      tooltipPosition="bottom"
      class={isCalculatorActive ? 'active' : ''}
      on:click={() => dataToolsStore.toggleTool(DataToolType.Calculator)}
    />
    <Button
      kind="ghost"
      size="small"
      icon={TrashCan}
      iconDescription="Supprimer la sélection"
      tooltipPosition="bottom"
      disabled={deleteDisabled}
      on:click={() => onDelete?.()}
    />
    <Button
      kind="ghost"
      size="small"
      icon={Reset}
      iconDescription="Réinitialiser"
      tooltipPosition="bottom"
      on:click={() => onReset?.()}
    />
  </div>
  <div class="tools-right">
    <span class="expand-label">Agrandir</span>
    <Button
      kind="ghost"
      size="small"
      icon={Maximize}
      iconDescription="Agrandir le tableau"
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
    margin-bottom: var(--cds-spacing-03);
    border-bottom: 1px solid var(--cds-border-subtle);
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
</style>
