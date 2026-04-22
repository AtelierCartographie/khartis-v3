<script lang="ts">
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import {
    Button,
    Select,
    SelectItem,
    TextInput,
    Tag
  } from 'carbon-components-svelte';
  import { ColumnType } from '$lib/features/data-pipeline';
  import * as m from '$lib/paraglide/messages';
  import type {
    VizDataFilter,
    VizFilterOperator
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { SectionHeading } from '$lib/features/commons/components/viz-controls';

  interface DataFieldOption {
    id: number;
    text: string;
    type?: string;
  }

  interface Props {
    dataFields: DataFieldOption[];
    filters: VizDataFilter[];
    onAddFilter: (filter: Omit<VizDataFilter, 'id'>) => void;
    onRemoveFilter: (filterId: string) => void;
    onClearFilters: () => void;
  }

  let {
    dataFields,
    filters,
    onAddFilter,
    onRemoveFilter,
    onClearFilters
  }: Props = $props();

  let newColumn = $state('');
  let newOperator = $state<VizFilterOperator>('gte');
  let newValue = $state('');
  let newSecondaryValue = $state('');
  let newLimit = $state(5);

  interface OperatorDef {
    value: VizFilterOperator;
    label: string;
    requiresValue?: boolean;
    requiresRange?: boolean;
    requiresLimit?: boolean;
    allowedTypes?: ColumnType[];
  }

  const operators: OperatorDef[] = [
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
    { value: 'equals', label: m.filter_op_equals(), requiresValue: true },
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
  ];

  const selectedColumnType = $derived.by(() => {
    if (!newColumn) {
      return null;
    }

    const selectedField = dataFields.find((field) => field.text === newColumn);
    return selectedField?.type ?? null;
  });

  const availableOperators = $derived.by(() => {
    if (!selectedColumnType) {
      return operators;
    }

    return operators.filter(
      (operator) =>
        !operator.allowedTypes ||
        operator.allowedTypes.includes(selectedColumnType as ColumnType)
    );
  });

  const currentOperator = $derived(
    availableOperators.find((op) => op.value === newOperator) ??
      availableOperators[0]
  );

  const canAddFilter = $derived.by(() => {
    if (!newColumn || !currentOperator) {
      return false;
    }

    if (currentOperator.requiresRange) {
      return newValue.trim().length > 0 && newSecondaryValue.trim().length > 0;
    }

    if (currentOperator.requiresLimit) {
      return Number.isFinite(newLimit) && newLimit > 0;
    }

    if (currentOperator.requiresValue) {
      return newValue.trim().length > 0;
    }

    return true;
  });

  $effect(() => {
    if (!currentOperator) {
      return;
    }

    const isOperatorAvailable = availableOperators.some(
      (operator) => operator.value === newOperator
    );

    if (!isOperatorAvailable) {
      newOperator = availableOperators[0]?.value ?? 'equals';
    }
  });

  function handleAdd(event?: Event) {
    event?.preventDefault();
    if (!canAddFilter || !currentOperator) return;

    onAddFilter({
      column: newColumn,
      operator: newOperator,
      value: currentOperator.requiresLimit ? String(newLimit) : newValue.trim(),
      secondaryValue: currentOperator.requiresRange
        ? newSecondaryValue.trim()
        : undefined,
      limit: currentOperator.requiresLimit ? newLimit : undefined
    });

    newValue = '';
    newSecondaryValue = '';
    newLimit = 5;
  }

  function formatFilterLabel(filter: VizDataFilter): string {
    switch (filter.operator) {
      case 'contains':
        return String(
          m.filter_label_contains({
            column: filter.column,
            value: filter.value
          })
        );
      case 'between':
        return String(
          m.filter_label_between({
            column: filter.column,
            value: m.filter_between_values({
              first: filter.value,
              second: filter.secondaryValue ?? ''
            })
          })
        );
      case 'top_asc':
        return String(
          m.filter_label_top_asc({
            column: filter.column,
            limit: String(filter.limit ?? filter.value ?? '')
          })
        );
      case 'top_desc':
        return String(
          m.filter_label_top_desc({
            column: filter.column,
            limit: String(filter.limit ?? filter.value ?? '')
          })
        );
      case 'empty':
        return String(m.filter_label_empty({ column: filter.column }));
      case 'not_empty':
        return String(m.filter_label_not_empty({ column: filter.column }));
      case 'gte':
        return `${filter.column} ≥ ${filter.value}`;
      case 'lte':
        return `${filter.column} ≤ ${filter.value}`;
      case 'not_equals':
        return `${filter.column} ≠ ${filter.value}`;
      case 'equals':
      default:
        return `${filter.column} = ${filter.value}`;
    }
  }
</script>

<div class="viz-filter-section">
  <SectionHeading title={m.filter_data()} />

  <form class="filter-form" onsubmit={handleAdd}>
    <div class="field-group">
      <Select size="sm" labelText={m.filter_column()} bind:selected={newColumn}>
        <SelectItem value="" text={m.filter_select_column()} />
        {#each dataFields as field (field.id)}
          <SelectItem value={field.text} text={field.text} />
        {/each}
      </Select>
    </div>

    <div class="field-group">
      <Select
        size="sm"
        labelText={m.filter_operator()}
        bind:selected={newOperator}
      >
        {#each availableOperators as op (op.value)}
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
          bind:value={newValue}
        />
      </div>
      <div class="field-group">
        <TextInput
          size="sm"
          labelText={m.filter_value_max()}
          placeholder={m.filter_placeholder_max()}
          bind:value={newSecondaryValue}
        />
      </div>
    {:else if currentOperator.requiresValue}
      <div class="field-group">
        <TextInput
          size="sm"
          labelText={m.filter_value()}
          placeholder={m.filter_value()}
          bind:value={newValue}
        />
      </div>
    {:else if currentOperator.requiresLimit}
      <div class="field-group">
        <div class="labeled-input">
          <label class="input-label" for="viz-filter-count-input"
            >{m.filter_count()}</label
          >
          <CompactNumberInput
            id="viz-filter-count-input"
            bind:value={newLimit}
            min={1}
            max={1000}
            width="100%"
          />
        </div>
      </div>
    {/if}

    <Button kind="primary" size="small" type="submit" disabled={!canAddFilter}>
      {m.filter_add()}
    </Button>
  </form>

  {#if filters.length > 0}
    <div class="active-filters">
      <div class="filters-header">
        <span class="filters-title">{m.filter_active()} ({filters.length})</span
        >
        <Button kind="ghost" size="small" on:click={onClearFilters}>
          {m.filter_clear_all()}
        </Button>
      </div>
      <ul class="filters-list">
        {#each filters as filter (filter.id)}
          <li class="filter-item">
            <Tag
              size="sm"
              type="gray"
              filter
              on:close={() => onRemoveFilter(filter.id)}
            >
              {formatFilterLabel(filter)}
            </Tag>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .viz-filter-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    margin-top: var(--cds-spacing-04);
    padding-top: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
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

  .active-filters {
    border-top: 1px solid var(--cds-border-subtle);
    padding-top: var(--cds-spacing-03);
  }

  .filters-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--cds-spacing-02);
  }

  .filters-title {
    font-size: 0.75rem;
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
