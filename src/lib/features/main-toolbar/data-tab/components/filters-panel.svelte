<script lang="ts">
  import {
    Button,
    Select,
    SelectItem,
    TextInput,
    Tag,
    InlineNotification
  } from 'carbon-components-svelte';
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { ColumnType } from '$lib/features/data-pipeline';
  import {
    duckDBOrchestrator,
    type DataTableFilter,
    type FilterOperator,
    type FilterStats
  } from '$lib/features/duckdb';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    tableName?: string;
    onFilterChange?: () => void;
  }

  let { tableName, onFilterChange }: Props = $props();

  const selectedDataset = $derived(datasetsStore.selectedDataset);
  const columns = $derived(
    selectedDataset?.columns.filter(
      (c) => c.name !== 'geom' && c.name !== '__id'
    ) ?? []
  );

  let filters = $state<DataTableFilter[]>([]);
  let filterStats = $state<FilterStats>({ total: 0, filtered: 0 });

  let newFilter = $state({
    column: '',
    operator: 'equals' as FilterOperator,
    value: '',
    secondaryValue: '',
    limit: 5
  });

  const hasData = $derived(columns.length > 0);

  interface FilterOperatorDef {
    value: FilterOperator;
    label: string;
    requiresValue?: boolean;
    requiresRange?: boolean;
    requiresLimit?: boolean;
    allowedTypes?: ColumnType[];
  }

  const ALL_FILTER_OPERATORS = $derived<FilterOperatorDef[]>([
    {
      value: 'gte',
      label: m.filter_op_gte(),
      requiresValue: true,
      allowedTypes: [ColumnType.NUMBER, ColumnType.DATE]
    },
    {
      value: 'lte',
      label: m.filter_op_lte(),
      requiresValue: true,
      allowedTypes: [ColumnType.NUMBER, ColumnType.DATE]
    },
    {
      value: 'contains',
      label: m.filter_op_contains(),
      requiresValue: true,
      allowedTypes: [ColumnType.TEXT]
    },
    {
      value: 'equals',
      label: m.filter_op_equals(),
      requiresValue: true
    },
    {
      value: 'not_equals',
      label: m.filter_op_not_equals(),
      requiresValue: true
    },
    {
      value: 'between',
      label: m.filter_op_between(),
      requiresRange: true,
      allowedTypes: [ColumnType.NUMBER, ColumnType.DATE]
    },
    {
      value: 'top_asc',
      label: m.filter_op_top_asc(),
      requiresLimit: true,
      allowedTypes: [ColumnType.NUMBER, ColumnType.DATE]
    },
    {
      value: 'top_desc',
      label: m.filter_op_top_desc(),
      requiresLimit: true,
      allowedTypes: [ColumnType.NUMBER, ColumnType.DATE]
    },
    { value: 'empty', label: m.filter_op_empty() },
    { value: 'not_empty', label: m.filter_op_not_empty() }
  ]);

  const selectedColumnType = $derived.by(() => {
    if (!newFilter.column) return null;
    const column = columns.find((c) => c.name === newFilter.column);
    return column?.type ?? null;
  });

  const FILTER_OPERATORS = $derived.by(() => {
    const colType = selectedColumnType;
    if (!colType) return ALL_FILTER_OPERATORS;
    return ALL_FILTER_OPERATORS.filter(
      (op) => !op.allowedTypes || op.allowedTypes.includes(colType)
    );
  });

  const currentOperator = $derived(
    FILTER_OPERATORS.find((op) => op.value === newFilter.operator) ??
      FILTER_OPERATORS[0]
  );

  const filterPercentage = $derived(
    filterStats.total > 0
      ? Math.round((filterStats.filtered / filterStats.total) * 100)
      : 100
  );

  async function refreshFilters() {
    if (!tableName) return;

    filters = duckDBOrchestrator.getFilters(tableName);
    filterStats = await duckDBOrchestrator.getRowStats(tableName);
  }

  async function addFilter(event?: Event) {
    event?.preventDefault();
    if (!tableName || !newFilter.column) return;

    try {
      const updated = await duckDBOrchestrator.addFilter(tableName, {
        column: newFilter.column,
        operator: newFilter.operator,
        value: newFilter.value,
        secondaryValue: newFilter.secondaryValue,
        limit: newFilter.limit
      });
      filters = updated;
      await refreshFilters();
      resetFilterForm();
      onFilterChange?.();
    } catch (err) {
      logger.error('Failed to add filter', LogCategory.UI, err);
    }
  }

  async function removeFilter(filterId: string) {
    if (!tableName) return;

    try {
      const updated = await duckDBOrchestrator.removeFilter(
        tableName,
        filterId
      );
      filters = updated;
      await refreshFilters();
      onFilterChange?.();
    } catch (err) {
      logger.error('Failed to remove filter', LogCategory.UI, err);
    }
  }

  async function clearAllFilters() {
    if (!tableName || filters.length === 0) return;

    duckDBOrchestrator.clearFilters(tableName);
    filters = [];
    await refreshFilters();
    onFilterChange?.();
  }

  function resetFilterForm() {
    newFilter = {
      column: '',
      operator: 'equals',
      value: '',
      secondaryValue: '',
      limit: 5
    };
  }

  $effect(() => {
    if (tableName) {
      refreshFilters();
    }
  });

  $effect(() => {
    const validOperators = FILTER_OPERATORS;
    const isCurrentOperatorValid = validOperators.some(
      (op) => op.value === newFilter.operator
    );
    if (!isCurrentOperatorValid && validOperators.length > 0) {
      newFilter.operator = validOperators[0].value;
    }
  });
</script>

<div class="filters-panel">
  {#if !hasData}
    <InlineNotification
      kind="info"
      title={m.data_tool_no_data()}
      subtitle={m.data_tool_no_data_description()}
      lowContrast
      hideCloseButton
    />
  {:else}
    <div class="filter-stats">
      <span class="stats-text">
        {filterStats.filtered.toLocaleString()} / {filterStats.total.toLocaleString()}
        {m.filter_rows_visible()}
      </span>
      <span class="stats-percentage">{filterPercentage}%</span>
    </div>

    <form class="filter-form" onsubmit={addFilter}>
      <div class="field-group">
        <Select
          size="sm"
          labelText={m.filter_column()}
          bind:selected={newFilter.column}
        >
          <SelectItem value="" text={m.filter_select_column()} />
          {#each columns as column (column.name)}
            <SelectItem value={column.name} text={column.name} />
          {/each}
        </Select>
      </div>

      <div class="field-group">
        <Select
          size="sm"
          labelText={m.filter_operator()}
          bind:selected={newFilter.operator}
        >
          {#each FILTER_OPERATORS as op (op.value)}
            <SelectItem value={op.value} text={op.label} />
          {/each}
        </Select>
      </div>

      {#if currentOperator.requiresRange}
        <div class="field-group">
          <TextInput
            size="sm"
            labelText={m.filter_value_min()}
            placeholder={m.filter_placeholder_min()}
            bind:value={newFilter.value}
          />
        </div>
        <div class="field-group">
          <TextInput
            size="sm"
            labelText={m.filter_value_max()}
            placeholder={m.filter_placeholder_max()}
            bind:value={newFilter.secondaryValue}
          />
        </div>
      {:else if currentOperator.requiresValue}
        <div class="field-group">
          <TextInput
            size="sm"
            labelText={m.filter_value()}
            placeholder={m.filter_value()}
            bind:value={newFilter.value}
          />
        </div>
      {:else if currentOperator.requiresLimit}
        <div class="field-group">
          <div class="labeled-input">
            <label class="input-label" for="filter-count-input"
              >{m.filter_count()}</label
            >
            <CompactNumberInput
              id="filter-count-input"
              bind:value={newFilter.limit}
              min={1}
              max={1000}
              width="100%"
            />
          </div>
        </div>
      {/if}

      <div class="form-actions">
        <Button
          kind="primary"
          size="small"
          type="submit"
          disabled={!newFilter.column}
        >
          {m.filter_add()}
        </Button>
      </div>
    </form>

    {#if filters.length > 0}
      <div class="active-filters">
        <div class="filters-header">
          <span class="filters-title"
            >{m.filter_active()} ({filters.length})</span
          >
          <Button kind="ghost" size="small" on:click={clearAllFilters}
            >{m.filter_clear_all()}</Button
          >
        </div>
        <ul class="filters-list">
          {#each filters as filter (filter.id)}
            <li class="filter-item">
              <Tag
                size="sm"
                type="gray"
                filter
                on:close={() => removeFilter(filter.id)}
              >
                {filter.label}
              </Tag>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
</div>

<style>
  .filters-panel {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .filter-stats {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-03);
    background: var(--cds-ui-02);
    border-radius: var(--cds-spacing-02);
  }

  .stats-text {
    font-size: 0.875rem;
    color: var(--cds-text-02);
  }

  .stats-percentage {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
  }

  .filter-form {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .labeled-input {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .input-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }

  .form-actions {
    padding-top: var(--cds-spacing-02);
  }

  .active-filters {
    border-top: 1px solid var(--cds-border-subtle);
    padding-top: var(--cds-spacing-04);
  }

  .filters-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--cds-spacing-03);
  }

  .filters-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
  }

  .filters-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .filter-item {
    display: flex;
  }
</style>
