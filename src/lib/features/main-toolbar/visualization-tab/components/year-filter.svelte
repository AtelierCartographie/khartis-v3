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
  import { Duck } from '$lib/features/duckdb';
  import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';

  interface Props {
    visualization: VisualizationConfig | undefined;
  }

  let { visualization }: Props = $props();

  const dataset = $derived(
    visualization
      ? datasetsStore.datasets.find((d) => d.id === visualization.datasetId)
      : null
  );

  const YEAR_MIN = 1000;
  const YEAR_MAX = 3000;
  const YEAR_NAME_PATTERN = /(^_?year$)|annee|année|year/i;
  let yearValues = $state<number[]>([]);
  let yearValuesRequestId = 0;

  function parseYearValue(value: unknown): number | null {
    if (typeof value === 'bigint') {
      const numericValue = Number(value);
      return Number.isInteger(numericValue) &&
        numericValue >= YEAR_MIN &&
        numericValue <= YEAR_MAX
        ? numericValue
        : null;
    }

    if (typeof value === 'number') {
      return Number.isInteger(value) && value >= YEAR_MIN && value <= YEAR_MAX
        ? value
        : null;
    }

    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number.parseInt(trimmed, 10);
    return Number.isInteger(parsed) && parsed >= YEAR_MIN && parsed <= YEAR_MAX
      ? parsed
      : null;
  }

  function isYearColumn(columnName: string): boolean {
    if (YEAR_NAME_PATTERN.test(columnName)) {
      return true;
    }

    const rows = dataset?.data ?? [];
    if (rows.length === 0) {
      return false;
    }

    let validYears = 0;
    let nonNullValues = 0;

    for (const row of rows) {
      const rawValue = row[columnName];
      if (rawValue === null || rawValue === undefined || rawValue === '') {
        continue;
      }

      nonNullValues++;
      if (parseYearValue(rawValue) !== null) {
        validYears++;
      }
    }

    return nonNullValues > 0 && validYears / nonNullValues >= 0.8;
  }

  const yearColumns = $derived(
    dataset
      ? dataset.columns
          .filter((col) => col.type === 'number' && isYearColumn(col.name))
          .map((col) => ({ name: col.name, text: col.name }))
      : []
  );

  function collectYearValuesFromRows(
    rows: Record<string, unknown>[],
    columnName: string
  ): number[] {
    const values: number[] = [];
    for (const row of rows) {
      const parsed = parseYearValue(row[columnName]);
      if (parsed !== null && !values.includes(parsed)) {
        values.push(parsed);
      }
    }

    return values.sort((a, b) => a - b);
  }

  let selectedColumn = $state('');
  let selectedValue = $state<string | number>('');

  const hasYearFilter = $derived(!!visualization?.yearFilter);
  const hasYearColumns = $derived(yearColumns.length > 0);

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
    if (!selectedColumn) {
      return;
    }

    const selectedYear =
      typeof selectedValue === 'number'
        ? selectedValue
        : parseYearValue(selectedValue);

    if (selectedYear === null || !yearValues.includes(selectedYear)) {
      selectedValue = '';
      if (visualization?.id && visualization.yearFilter) {
        visualizationStore.setYearFilter(visualization.id, null);
      }
    }
  });

  $effect(() => {
    if (visualization?.yearFilter) {
      selectedColumn = visualization.yearFilter.column;
      selectedValue = visualization.yearFilter.value;
    } else {
      selectedColumn = '';
      selectedValue = '';
    }
  });

  $effect(() => {
    const currentDataset = dataset;
    const currentColumn = selectedColumn;
    const requestId = ++yearValuesRequestId;

    if (!currentDataset || !currentColumn) {
      yearValues = [];
      return;
    }

    const localRows =
      currentDataset.originalData?.data ?? currentDataset.data ?? [];
    if (localRows.length > 0) {
      yearValues = collectYearValuesFromRows(localRows, currentColumn);
      return;
    }

    const escapedTable = escapeIdentifier(currentDataset.tableName);
    const escapedColumn = escapeIdentifier(currentColumn);

    void (async () => {
      const rows = (await Duck.query(
        `SELECT DISTINCT "${escapedColumn}" AS year_value
         FROM "${escapedTable}"
         WHERE "${escapedColumn}" IS NOT NULL
         ORDER BY 1`,
        { format: 'array' }
      )) as Array<Record<string, unknown>>;

      if (requestId !== yearValuesRequestId) {
        return;
      }

      yearValues = rows
        .map((row) => parseYearValue(row.year_value))
        .filter((value): value is number => value !== null);
    })().catch(() => {
      if (requestId === yearValuesRequestId) {
        yearValues = [];
      }
    });
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

  {#if !hasYearColumns}
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
        {#each yearColumns as col (col.name)}
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
          {#each yearValues as year (year)}
            <SelectItem value={String(year)} text={String(year)} />
          {/each}
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
