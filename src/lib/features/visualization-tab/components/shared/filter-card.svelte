<script lang="ts">
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { ColumnType } from '$lib/features/data-pipeline';
  import type {
    VizDataFilter,
    VizFilterOperator
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import { translateCarbonId } from '$lib/features/commons/utils/carbon-a11y.utils';
  import { Dropdown, TextInput } from 'carbon-components-svelte';
  import { TrashCan } from 'carbon-icons-svelte';
  import { ToggleWithLabel } from '$lib/features/commons/components/viz-controls';
  import {
    DEFAULT_FILTER_LIMIT,
    MAX_FILTER_LIMIT,
    getFilterColumnType,
    getOperatorDef,
    getAvailableOperatorsForType,
    defaultOperatorForType
  } from './filter-operators.utils';

  interface DataFieldOption {
    id: number;
    text: string;
    type?: string;
  }

  interface Props {
    filter: VizDataFilter;
    index: number;
    dataFields: DataFieldOption[];
    dataFieldsDropdownItems: Array<{ id: string; text: string; type?: string }>;
    collectionVariable?: string;
    onRemoveFilter: (filterId: string) => void;
    onUpdateFilter?: (
      filterId: string,
      updates: Partial<Omit<VizDataFilter, 'id'>>
    ) => void;
  }

  let {
    filter,
    index,
    dataFields,
    dataFieldsDropdownItems,
    collectionVariable,
    onRemoveFilter,
    onUpdateFilter
  }: Props = $props();

  type CarbonTextInputEvent = Event & {
    detail?: string | number | null | { value?: string | number | null };
  };

  function readTextInputValue(event: CarbonTextInputEvent): string {
    const detail = event.detail;
    if (typeof detail === 'string') return detail;
    if (typeof detail === 'number') return String(detail);
    if (
      detail &&
      typeof detail === 'object' &&
      'value' in detail &&
      (typeof detail.value === 'string' || typeof detail.value === 'number')
    ) {
      return String(detail.value);
    }
    return event.target instanceof HTMLInputElement ? event.target.value : '';
  }

  const currentColumnType = $derived(
    getFilterColumnType(dataFields, filter.column)
  );
  const availOps = $derived(getAvailableOperatorsForType(currentColumnType));
  const opDef = $derived(getOperatorDef(filter.operator));
  const canRankPerFacet = $derived(
    Boolean(opDef?.requiresLimit && collectionVariable)
  );
  const isPerFacet = $derived(canRankPerFacet && Boolean(filter.perFacet));

  function handlePerFacetToggle(perFacet: boolean): void {
    onUpdateFilter?.(
      filter.id,
      perFacet && collectionVariable
        ? { perFacet: true, column: collectionVariable }
        : { perFacet: undefined }
    );
  }

  function handleColumnChange(newColumn: string): void {
    if (newColumn === filter.column) return;
    const oldType = getFilterColumnType(dataFields, filter.column);
    const newType = getFilterColumnType(dataFields, newColumn);
    const updates: Partial<Omit<VizDataFilter, 'id'>> = { column: newColumn };
    if (oldType !== newType) {
      const nextOp = defaultOperatorForType(newType);
      updates.operator = nextOp;
      updates.value = '';
      updates.secondaryValue = undefined;
      updates.limit = getOperatorDef(nextOp)?.requiresLimit
        ? DEFAULT_FILTER_LIMIT
        : undefined;
    }
    onUpdateFilter?.(filter.id, updates);
  }

  function handleOperatorChange(newOperator: VizFilterOperator): void {
    if (newOperator === filter.operator) return;
    const def = getOperatorDef(newOperator);
    const updates: Partial<Omit<VizDataFilter, 'id'>> = {
      operator: newOperator
    };
    if (def?.requiresLimit) {
      updates.limit = filter.limit ?? DEFAULT_FILTER_LIMIT;
      updates.value = String(updates.limit);
      updates.secondaryValue = undefined;
    } else if (def?.requiresRange) {
      updates.limit = undefined;
    } else if (!def?.requiresValue) {
      updates.value = '';
      updates.secondaryValue = undefined;
      updates.limit = undefined;
    } else {
      updates.limit = undefined;
      updates.secondaryValue = undefined;
    }
    if (!def?.requiresLimit && filter.perFacet) {
      updates.perFacet = undefined;
    }
    onUpdateFilter?.(filter.id, updates);
  }
</script>

<article class="filter-card">
  <header class="filter-card-header">
    <span class="filter-card-title">
      {m.filter_card_label({ index: index + 1 })}
    </span>
    <div class="filter-card-divider"></div>
    <IconButton
      kind="ghost"
      size="small"
      icon={TrashCan}
      iconDescription={m.filter_remove()}
      on:click={() => onRemoveFilter(filter.id)}
    />
  </header>

  {#if isPerFacet}
    <div class="filter-field">
      <span class="filter-field-label">{m.filter_variable()}</span>
      <span class="filter-field-static">{m.filter_per_facet_variable()}</span>
    </div>
  {:else}
    <div class="filter-field">
      <Dropdown
        translateWithId={translateCarbonId}
        translateWithIdSelection={translateCarbonId}
        size="sm"
        titleText={m.filter_variable()}
        items={dataFieldsDropdownItems}
        selectedId={String(
          dataFields.find((f) => f.text === filter.column)?.id ?? ''
        )}
        on:select={(e) => {
          const field = dataFields.find(
            (f) => String(f.id) === e.detail.selectedId
          );
          if (field) handleColumnChange(field.text);
        }}
        type="default"
      />
    </div>
  {/if}

  <div class="filter-field">
    <Dropdown
      translateWithId={translateCarbonId}
      translateWithIdSelection={translateCarbonId}
      size="sm"
      titleText={m.filter_operator()}
      items={availOps.map((op) => ({ id: op.value, text: op.label }))}
      selectedId={filter.operator}
      direction="top"
      on:select={(e) =>
        handleOperatorChange(e.detail.selectedId as VizFilterOperator)}
      type="default"
    />
  </div>

  {#if canRankPerFacet}
    <ToggleWithLabel
      label={m.filter_per_facet()}
      infoText={m.filter_per_facet_info()}
      toggled={isPerFacet}
      ontoggle={handlePerFacetToggle}
    />
  {/if}

  {#if opDef?.requiresRange}
    <div class="filter-field">
      <TextInput
        size="sm"
        labelText={m.filter_value_min()}
        placeholder={m.filter_placeholder_min()}
        value={filter.value ?? ''}
        on:input={(e) =>
          onUpdateFilter?.(filter.id, {
            value: readTextInputValue(e)
          })}
      />
    </div>
    <div class="filter-field">
      <TextInput
        size="sm"
        labelText={m.filter_value_max()}
        placeholder={m.filter_placeholder_max()}
        value={filter.secondaryValue ?? ''}
        on:input={(e) =>
          onUpdateFilter?.(filter.id, {
            secondaryValue: readTextInputValue(e)
          })}
      />
    </div>
  {:else if opDef?.requiresLimit}
    <div class="filter-field">
      <label class="filter-field-label" for="filter-limit-{filter.id}">
        {m.filter_count()}
      </label>
      <CompactNumberInput
        id="filter-limit-{filter.id}"
        value={filter.limit ?? DEFAULT_FILTER_LIMIT}
        min={1}
        max={MAX_FILTER_LIMIT}
        width="100%"
        onchange={(val) =>
          onUpdateFilter?.(filter.id, { limit: val, value: String(val) })}
      />
    </div>
  {:else if opDef?.requiresValue}
    <div class="filter-field">
      {#if currentColumnType === ColumnType.NUMBER}
        <label class="filter-field-label" for="filter-value-{filter.id}">
          {m.filter_value()}
        </label>
        <CompactNumberInput
          id="filter-value-{filter.id}"
          value={Number(filter.value) || 0}
          min={Number.MIN_SAFE_INTEGER}
          max={Number.MAX_SAFE_INTEGER}
          width="100%"
          onchange={(val) =>
            onUpdateFilter?.(filter.id, { value: String(val) })}
        />
      {:else}
        <TextInput
          size="sm"
          labelText={m.filter_value()}
          placeholder={m.filter_value()}
          value={filter.value ?? ''}
          on:input={(e) =>
            onUpdateFilter?.(filter.id, {
              value: readTextInputValue(e)
            })}
        />
      {/if}
    </div>
  {/if}
</article>

<style lang="scss">
  .filter-card {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-inline);
    padding-top: var(--cds-spacing-03);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .filter-card-header {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .filter-card-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-primary);
    white-space: nowrap;
  }

  .filter-card-divider {
    flex: 1;
    height: 1px;
    background: var(--cds-border-subtle);
  }

  .filter-field {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-label);
  }

  .filter-field-label {
    font-size: 0.75rem;
    color: var(--cds-text-secondary);
  }

  .filter-field-static {
    font-size: 0.875rem;
    color: var(--cds-text-primary);
  }

  :global(.filter-card .bx--dropdown) {
    max-width: 100%;
  }
</style>
