<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { NONE_FIELD_ID } from '../../hooks/use-field-selection.svelte';
  import {
    Checkbox,
    CheckboxCheckedFilled,
    ChevronDown,
    Checkmark
  } from 'carbon-icons-svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import VariableBadge from '$lib/features/commons/components/variable-badge.svelte';
  import type { VariableBadgeType } from '$lib/features/commons/types/variable-badge.types';
  import { clickOutside } from '$lib/features/commons/utils/click-outside';
  import {
    createExclusiveContextualSurfaceId,
    engageExclusiveContextualSurface
  } from '$lib/features/commons/utils/contextual-surface-coordinator';

  interface DataField {
    id: number;
    text: string;
    type?: string;
  }

  interface Props {
    dataFields: DataField[];
    singleSelectItems?: DataField[];
    selectedFieldId: number;
    selectedFieldIds?: number[];
    isCollectionEnabled: boolean;
    canEnableCollection?: boolean;
    showCollectionFooter?: boolean;
    titleText?: string;
    open?: boolean;
    onSelect: (fieldId: number) => void;
    onCollectionChange?: (fieldIds: number[]) => void;
    onToggleCollection?: (enabled: boolean) => void;
  }

  let {
    dataFields,
    singleSelectItems = dataFields,
    selectedFieldId,
    selectedFieldIds = [],
    isCollectionEnabled,
    canEnableCollection = true,
    showCollectionFooter = true,
    titleText,
    open = $bindable(false),
    onSelect,
    onCollectionChange,
    onToggleCollection
  }: Props = $props();

  function resolveVariableBadgeType(field: DataField): VariableBadgeType {
    if (field.type === 'number' || field.type === 'numeric') return 'numeric';
    if (field.type === 'boolean') return 'boolean';
    if (field.type === 'date') return 'date';
    if (field.type === 'geometry') return 'geo';
    return 'string';
  }

  const selectedField = $derived(
    singleSelectItems.find((f) => f.id === selectedFieldId) ?? null
  );

  const triggerLabel = $derived.by(() => {
    if (!isCollectionEnabled) return null;
    const count = selectedFieldIds.length;
    if (count === 0) return null;
    if (count === 1) {
      return dataFields.find((f) => f.id === selectedFieldIds[0]) ?? null;
    }
    return null;
  });

  const collectionCount = $derived(
    isCollectionEnabled && selectedFieldIds.length > 1
      ? selectedFieldIds.length
      : 0
  );
  const contextualSurfaceId = createExclusiveContextualSurfaceId(
    'facets-variable-picker'
  );

  const displayItems = $derived(
    (isCollectionEnabled ? dataFields : singleSelectItems).filter(
      (f) => f.id !== NONE_FIELD_ID
    )
  );

  function handleTriggerClick() {
    open = !open;
  }

  function handleOutsideClick() {
    open = false;
  }

  function isSelected(fieldId: number): boolean {
    if (isCollectionEnabled) return selectedFieldIds.includes(fieldId);
    return selectedFieldId === fieldId;
  }

  function handleItemClick(fieldId: number) {
    if (isCollectionEnabled) {
      const next = selectedFieldIds.includes(fieldId)
        ? selectedFieldIds.filter((id) => id !== fieldId)
        : [...selectedFieldIds, fieldId];
      onCollectionChange?.(next);
    } else {
      onSelect(fieldId);
      open = false;
    }
  }

  function handleToggle(checked: boolean) {
    onToggleCollection?.(checked);
  }

  $effect(() => {
    if (!open) {
      return;
    }

    return engageExclusiveContextualSurface(contextualSurfaceId, () => {
      open = false;
    });
  });
</script>

{#if titleText}
  <span class="field-label">{titleText}</span>
{/if}

<div
  class="variable-dropdown"
  use:clickOutside={{ enabled: open }}
  onoutsideclick={handleOutsideClick}
>
  <button
    type="button"
    class="dropdown-trigger"
    aria-expanded={open}
    onclick={handleTriggerClick}
  >
    <div class="trigger-value">
      {#if isCollectionEnabled && collectionCount > 1}
        <span class="collection-count"
          >{m.facets_variables_count({ count: collectionCount })}</span
        >
      {:else if isCollectionEnabled && triggerLabel}
        <VariableBadge
          label={triggerLabel.text}
          type={resolveVariableBadgeType(triggerLabel)}
          interactive={false}
        />
      {:else if selectedField && selectedFieldId !== NONE_FIELD_ID}
        <VariableBadge
          label={selectedField.text}
          type={resolveVariableBadgeType(selectedField)}
          interactive={false}
        />
      {:else}
        <span class="placeholder">{m.none()}</span>
      {/if}
    </div>
    <span class="chevron" class:rotated={open}>
      <ChevronDown size={16} />
    </span>
  </button>

  {#if open}
    <div class="dropdown-list" role="listbox">
      <div class="list-items">
        {#each displayItems as field (field.id)}
          <button
            type="button"
            role="option"
            aria-selected={isSelected(field.id)}
            class="list-item"
            class:selected={isSelected(field.id)}
            onclick={() => handleItemClick(field.id)}
          >
            {#if isCollectionEnabled}
              <span class="checkbox-icon">
                {#if isSelected(field.id)}
                  <CheckboxCheckedFilled size={20} />
                {:else}
                  <Checkbox size={20} />
                {/if}
              </span>
            {/if}
            <VariableBadge
              label={field.text}
              type={resolveVariableBadgeType(field)}
              interactive={false}
            />
            {#if !isCollectionEnabled && isSelected(field.id)}
              <span class="checkmark"><Checkmark size={16} /></span>
            {/if}
          </button>
        {/each}
      </div>

      {#if showCollectionFooter}
        <div class="dropdown-footer" class:disabled={!canEnableCollection}>
          <Switch
            size="sm"
            labelText={m.facets_toggle_create_collection()}
            toggled={isCollectionEnabled}
            disabled={!canEnableCollection}
            onchange={handleToggle}
          />
        </div>
      {/if}
    </div>
  {/if}
</div>

<style lang="scss">
  .field-label {
    display: block;
    font-size: 0.75rem;
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-02);
  }

  .variable-dropdown {
    position: relative;
    width: 100%;
  }

  .dropdown-trigger {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    width: 100%;
    height: 32px;
    padding: 7px var(--cds-spacing-05);
    background: var(--cds-field-01, #f4f4f4);
    border: none;
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
    cursor: pointer;
    text-align: left;

    &:hover {
      background: var(--cds-field-hover-01, #e8e8e8);
    }
  }

  .trigger-value {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
  }

  .chevron {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    color: var(--cds-icon-primary, #161616);
    transition: transform 0.15s ease;

    &.rotated {
      transform: rotate(180deg);
    }
  }

  .placeholder {
    font-size: 0.875rem;
    color: var(--cds-text-placeholder, #a8a8a8);
  }

  .collection-count {
    font-size: 0.75rem;
    color: var(--cds-text-secondary, #525252);
  }

  .dropdown-list {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: var(--z-dropdown);
    background: var(--cds-layer-01, #f4f4f4);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }

  .list-items {
    max-height: 200px;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .list-item {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    width: 100%;
    min-height: 40px;
    padding: 7px var(--cds-spacing-05);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--cds-border-subtle-01, #e0e0e0);
    cursor: pointer;
    text-align: left;

    &:hover {
      background: var(--cds-layer-hover-01, #e8e8e8);
    }

    &.selected {
      background: var(--cds-layer-selected-01, #e0e0e0);
    }

    :global(.variable-badge) {
      flex: 1;
      min-width: 0;
    }
  }

  .trigger-value :global(.variable-badge) {
    flex: 1;
    min-width: 0;
  }

  .checkbox-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    color: var(--cds-icon-primary, #161616);
  }

  .checkmark {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    color: var(--cds-icon-primary, #161616);
  }

  .dropdown-footer {
    border-top: 1px solid var(--cds-border-subtle-01, #e0e0e0);
    padding: var(--cds-spacing-02) var(--cds-spacing-03);
    background: var(--cds-layer-01, #f4f4f4);

    &.disabled {
      opacity: 0.5;
    }

    :global(.kh-switch-label) {
      font-size: 0.75rem;
      color: var(--cds-text-secondary, #525252);
    }
  }
</style>
