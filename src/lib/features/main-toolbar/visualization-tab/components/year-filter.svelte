<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import {
    Select,
    SelectItem,
    InlineNotification
  } from 'carbon-components-svelte';
  import { Close } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    visualizationStore,
    type VisualizationConfig,
    type YearFilter
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';

  interface Props {
    visualization: VisualizationConfig | undefined;
  }

  let { visualization }: Props = $props();

  const dataset = $derived(
    visualization
      ? datasetsStore.datasets.find((d) => d.id === visualization.datasetId)
      : null
  );

  const numericColumns = $derived(
    dataset
      ? dataset.columns
          .filter((col) => col.type === 'number')
          .map((col) => ({ name: col.name, text: col.name }))
      : []
  );

  let selectedColumn = $state('');
  let selectedValue = $state<string | number>('');

  const hasYearFilter = $derived(!!visualization?.yearFilter);
  const hasNumericColumns = $derived(numericColumns.length > 0);

  function handleColumnChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    selectedColumn = target.value;
    selectedValue = '';
    applyFilter();
  }

  function handleValueChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const val = target.value;
    selectedValue = val === '' ? '' : parseInt(val, 10);
    applyFilter();
  }

  function applyFilter() {
    if (!visualization?.id) return;

    if (selectedColumn && selectedValue !== '') {
      const filter: YearFilter = {
        column: selectedColumn,
        value:
          typeof selectedValue === 'string'
            ? parseInt(selectedValue, 10)
            : selectedValue
      };
      visualizationStore.setYearFilter(visualization.id, filter);
    } else if (!selectedColumn && !selectedValue) {
      visualizationStore.setYearFilter(visualization.id, null);
    }
  }

  function handleClearFilter() {
    selectedColumn = '';
    selectedValue = '';
    if (visualization?.id) {
      visualizationStore.setYearFilter(visualization.id, null);
    }
  }

  $effect(() => {
    if (visualization?.yearFilter) {
      selectedColumn = visualization.yearFilter.column;
      selectedValue = visualization.yearFilter.value;
    } else {
      selectedColumn = '';
      selectedValue = '';
    }
  });
</script>

<div class="year-filter-panel">
  <div class="year-filter-header">
    <span class="year-filter-title">{m.year_filter_title()}</span>
    {#if hasYearFilter}
      <IconButton
        kind="ghost"
        size="small"
        icon={Close}
        iconDescription={m.year_filter_clear()}
        on:click={handleClearFilter}
      />
    {/if}
  </div>

  {#if !hasNumericColumns}
    <InlineNotification
      kind="info"
      subtitle={m.year_filter_no_year_columns()}
      lowContrast
      hideCloseButton
    />
  {:else}
    <div class="year-filter-controls">
      <Select
        size="sm"
        labelText={m.year_filter_column()}
        selected={selectedColumn}
        on:change={handleColumnChange}
      >
        <SelectItem value="" text={m.year_filter_select_column()} />
        {#each numericColumns as col (col.name)}
          <SelectItem value={col.name} text={col.text} />
        {/each}
      </Select>

      {#if selectedColumn}
        <Select
          size="sm"
          labelText={m.year_filter_value()}
          selected={String(selectedValue)}
          on:change={handleValueChange}
        >
          <SelectItem value="" text={m.year_filter_select_value()} />
          <SelectItem value="2020" text="2020" />
          <SelectItem value="2021" text="2021" />
          <SelectItem value="2022" text="2022" />
          <SelectItem value="2023" text="2023" />
          <SelectItem value="2024" text="2024" />
          <SelectItem value="2025" text="2025" />
        </Select>
      {/if}
    </div>
  {/if}
</div>

<style>
  .year-filter-panel {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    padding: var(--cds-spacing-04);
    background: var(--cds-ui-02);
    border-radius: var(--cds-spacing-02);
  }

  .year-filter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .year-filter-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
  }

  .year-filter-controls {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }
</style>
