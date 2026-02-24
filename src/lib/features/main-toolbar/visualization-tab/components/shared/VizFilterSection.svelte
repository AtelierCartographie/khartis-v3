<script lang="ts">
  import { Button, Select, SelectItem, TextInput, Tag } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import type {
    VizDataFilter,
    VizFilterOperator
  } from '$lib/features/commons/store/visualization.store.svelte';
  import SectionHeading from './SectionHeading.svelte';

  interface Props {
    dataFields: Array<{ id: number; text: string }>;
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

  interface OperatorDef {
    value: VizFilterOperator;
    label: string;
    requiresRange?: boolean;
  }

  const operators: OperatorDef[] = [
    { value: 'gte', label: m.filter_op_gte() },
    { value: 'lte', label: m.filter_op_lte() },
    { value: 'equals', label: m.filter_op_equals() },
    { value: 'not_equals', label: m.filter_op_not_equals() },
    { value: 'between', label: m.filter_op_between(), requiresRange: true }
  ];

  const currentOperator = $derived(
    operators.find((op) => op.value === newOperator) ?? operators[0]
  );

  function handleAdd(event?: Event) {
    event?.preventDefault();
    if (!newColumn || !newValue) return;
    onAddFilter({
      column: newColumn,
      operator: newOperator,
      value: newValue,
      secondaryValue: currentOperator.requiresRange ? newSecondaryValue : undefined
    });
    newValue = '';
    newSecondaryValue = '';
  }

  function formatFilterLabel(filter: VizDataFilter): string {
    const opLabel = operators.find((op) => op.value === filter.operator)?.label ?? filter.operator;
    if (filter.operator === 'between' && filter.secondaryValue) {
      return `${filter.column} ${opLabel} ${filter.value} – ${filter.secondaryValue}`;
    }
    return `${filter.column} ${opLabel} ${filter.value}`;
  }
</script>

<div class="viz-filter-section">
  <SectionHeading title={m.filter_data()} />

  <form class="filter-form" onsubmit={handleAdd}>
    <div class="field-group">
      <Select
        size="sm"
        labelText={m.filter_column()}
        bind:selected={newColumn}
      >
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
        {#each operators as op (op.value)}
          <SelectItem value={op.value} text={op.label} />
        {/each}
      </Select>
    </div>

    {#if currentOperator.requiresRange}
      <div class="field-row">
        <TextInput
          size="sm"
          labelText={m.filter_value_min()}
          placeholder={m.filter_placeholder_min()}
          bind:value={newValue}
        />
        <TextInput
          size="sm"
          labelText={m.filter_value_max()}
          placeholder={m.filter_placeholder_max()}
          bind:value={newSecondaryValue}
        />
      </div>
    {:else}
      <div class="field-group">
        <TextInput
          size="sm"
          labelText={m.filter_value()}
          placeholder={m.filter_value()}
          bind:value={newValue}
        />
      </div>
    {/if}

    <Button
      kind="primary"
      size="small"
      type="submit"
      disabled={!newColumn || !newValue}
    >
      {m.filter_add()}
    </Button>
  </form>

  {#if filters.length > 0}
    <div class="active-filters">
      <div class="filters-header">
        <span class="filters-title">{m.filter_active()} ({filters.length})</span>
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

  .field-row {
    display: flex;
    gap: var(--cds-spacing-03);
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
