<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { TextScale, TextAllCaps } from 'carbon-icons-svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { SectionHeading, SliderWithInput } from '../shared';
  import FacetsVariablePicker from '../shared/facets-variable-picker.svelte';
  import { SizeMode } from '$lib/features/commons/constants/visualization.constants';
  import {
    FACET_SLOT,
    type FacetSlotPath
  } from '../../adapters/facets-adapter';

  interface FieldSelection {
    selectedFieldId: number;
    selectedFieldName: string | undefined;
  }

  interface FacetsSelectionLike {
    getSelectedFieldIds(slot: FacetSlotPath): number[];
    isActiveForSlot(slot: FacetSlotPath): boolean;
    updateVariables(column: string, slot: FacetSlotPath, ids: number[]): void;
    toggle(column: string, slot: FacetSlotPath, enabled: boolean): void;
  }

  interface Props {
    sizeMode: SizeMode;
    size: number;
    sizeMin: number;
    sizeMax: number;
    sizeColumnName: string;
    sizePickerOpen: boolean;
    dataFields: Array<{ id: number; text: string; type?: string }>;
    selectableDataFields: Array<{ id: number; text: string; type?: string }>;
    sizeFieldSelection: FieldSelection;
    facetsSelection: FacetsSelectionLike;
    onSizeModeChange: (index: number) => void;
    onSizeChange: (value: number) => void;
    onSizeFieldSelect: (id: number) => void;
  }

  let {
    sizeMode,
    size,
    sizeMin,
    sizeMax,
    sizeColumnName,
    sizePickerOpen = $bindable(),
    dataFields,
    selectableDataFields,
    sizeFieldSelection,
    facetsSelection,
    onSizeModeChange,
    onSizeChange,
    onSizeFieldSelect
  }: Props = $props();

  const sizeModeItems = [
    { icon: TextScale, label: m.size_mode_fixed(), iconSize: 16 },
    { icon: TextAllCaps, label: m.size_mode_proportional(), iconSize: 16 }
  ];

  const SIZE_MODE_ORDER = [SizeMode.FIXED, SizeMode.PROPORTIONAL];
  const sizeModeIndex = $derived(SIZE_MODE_ORDER.indexOf(sizeMode));
</script>

<SectionHeading title={m.size_label()} />

<div class="field-group">
  <ToggleTabs
    items={sizeModeItems}
    activeIndex={sizeModeIndex}
    onChange={onSizeModeChange}
    hideInactiveLabel={true}
  />
</div>

{#if sizeMode === SizeMode.PROPORTIONAL}
  <div class="field-group">
    <FacetsVariablePicker
      bind:open={sizePickerOpen}
      titleText={m.size_according()}
      dataFields={dataFields}
      singleSelectItems={selectableDataFields}
      selectedFieldId={sizeFieldSelection.selectedFieldId}
      selectedFieldIds={facetsSelection.getSelectedFieldIds(
        FACET_SLOT.TEXT_VALUE
      )}
      isCollectionEnabled={facetsSelection.isActiveForSlot(
        FACET_SLOT.TEXT_VALUE
      )}
      onSelect={onSizeFieldSelect}
      onCollectionChange={(ids) =>
        facetsSelection.updateVariables(
          sizeColumnName,
          FACET_SLOT.TEXT_VALUE,
          ids
        )}
      onToggleCollection={(enabled) =>
        facetsSelection.toggle(sizeColumnName, FACET_SLOT.TEXT_VALUE, enabled)}
    />
  </div>
{/if}

<SliderWithInput
  label={m.size_label()}
  min={sizeMin}
  max={sizeMax}
  value={size}
  showMinMax
  inputWidth="64px"
  onchange={onSizeChange}
/>

<style lang="scss">
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }
</style>
