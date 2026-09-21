<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Table, TextScale, TextAllCaps } from 'carbon-icons-svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    DiscretizationRow,
    SectionHeading,
    SliderWithInput
  } from '../shared';
  import FacetsVariablePicker from '../shared/facets-variable-picker.svelte';
  import { SizeMode } from '$lib/features/commons/constants/visualization.constants';
  import { FACET_SLOT } from '../../adapters/facets-adapter';
  import {
    filterFieldsByKind,
    type FieldSelection
  } from '../../hooks/use-field-selection.svelte';
  import type { FacetsVariableSelection } from '../../hooks/use-facets-variable-selection.svelte';

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
    facetsSelection: FacetsVariableSelection;
    discretizationLabel?: string;
    onSizeModeChange: (index: number) => void;
    onSizeChange: (value: number) => void;
    onSizeFieldSelect: (id: number) => void;
    onOpenDiscretization?: () => void;
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
    discretizationLabel,
    onSizeModeChange,
    onSizeChange,
    onSizeFieldSelect,
    onOpenDiscretization
  }: Props = $props();

  const sizeModeItems = [
    { icon: TextScale, label: m.size_mode_fixed(), iconSize: 16 },
    { icon: TextAllCaps, label: m.size_mode_proportional(), iconSize: 16 },
    { icon: Table, label: m.size_mode_classes(), iconSize: 16 }
  ];

  const SIZE_MODE_ORDER = [
    SizeMode.FIXED,
    SizeMode.PROPORTIONAL,
    SizeMode.CLASSES
  ];
  const sizeModeIndex = $derived(SIZE_MODE_ORDER.indexOf(sizeMode));
  const usesSizeVariable = $derived(
    sizeMode === SizeMode.PROPORTIONAL || sizeMode === SizeMode.CLASSES
  );
  const selectableValueDataFields = $derived(
    filterFieldsByKind(
      selectableDataFields,
      'numeric',
      sizeFieldSelection.selectedFieldId
    )
  );
  const numericDataFields = $derived(
    filterFieldsByKind(
      dataFields,
      'numeric',
      sizeFieldSelection.selectedFieldId
    )
  );
  const sizeSliderLabel = $derived(
    sizeMode === SizeMode.FIXED ? m.size_label() : m.size_maximum()
  );
</script>

<SectionHeading title={m.size_label()} />

<div class="field-group">
  <ToggleTabs
    items={sizeModeItems}
    size="lg"
    activeIndex={sizeModeIndex}
    onchange={onSizeModeChange}
    hideInactiveLabel={true}
  />
</div>

{#if usesSizeVariable}
  <div class="field-group">
    <FacetsVariablePicker
      bind:open={sizePickerOpen}
      titleText={m.size_according()}
      dataFields={numericDataFields}
      singleSelectItems={selectableValueDataFields}
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
      onToggleCollection={(enabled, ids) =>
        facetsSelection.toggle(
          sizeColumnName,
          FACET_SLOT.TEXT_VALUE,
          enabled,
          ids
        )}
    />
  </div>
{/if}

{#if sizeMode === SizeMode.CLASSES}
  <DiscretizationRow
    label={m.discretization()}
    value={discretizationLabel ?? m.discretization_none_placeholder()}
    onsettings={onOpenDiscretization}
  />
{/if}

<SliderWithInput
  label={sizeSliderLabel}
  min={sizeMin}
  max={sizeMax}
  value={size}
  showMinMax
  inputWidth="64px"
  onchange={onSizeChange}
/>
