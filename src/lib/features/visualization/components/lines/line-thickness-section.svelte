<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Category, Minimize, Subtract } from 'carbon-icons-svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    DiscretizationRow,
    SectionHeading,
    SliderWithInput
  } from '../shared';
  import FacetsVariablePicker from '../shared/facets-variable-picker.svelte';
  import {
    SLIDER_LIMITS,
    ThicknessMode
  } from '$lib/features/commons/constants/visualization.constants';
  import { FACET_SLOT, type FacetSlotPath } from '../../utils/facets-adapter';

  interface FieldSelection {
    selectedFieldId: number;
    selectedFieldName: string | undefined;
    handleSelect: (fieldId: number) => void;
  }

  interface FacetsSelection {
    getSelectedFieldIds(slot: FacetSlotPath): number[];
    isActiveForSlot(slot: FacetSlotPath): boolean;
    updateVariables(column: string, slot: FacetSlotPath, ids: number[]): void;
    toggle(column: string, slot: FacetSlotPath, enabled: boolean): void;
  }

  interface Props {
    thicknessMode: ThicknessMode;
    thickness: number;
    maxThickness: number;
    thicknessDiscretizationLabel: string;
    valueColumnName: string;
    sizeColumnName: string;
    pickerOpen: boolean;
    dataFields: Array<{ id: number; text: string; type?: string }>;
    selectableDataFields: Array<{ id: number; text: string; type?: string }>;
    valueFieldSelection: FieldSelection;
    sizeFieldSelection: FieldSelection;
    facetsSelection: FacetsSelection;
    onThicknessModeChange: (index: number) => void;
    onThicknessChange: (value: number) => void;
    onMaxThicknessChange: (value: number) => void;
    onOpenThicknessDiscretization: () => void;
  }

  let {
    thicknessMode,
    thickness,
    maxThickness,
    thicknessDiscretizationLabel,
    valueColumnName,
    sizeColumnName,
    pickerOpen = $bindable(),
    dataFields,
    selectableDataFields,
    valueFieldSelection,
    sizeFieldSelection,
    facetsSelection,
    onThicknessModeChange,
    onThicknessChange,
    onMaxThicknessChange,
    onOpenThicknessDiscretization
  }: Props = $props();

  const thicknessModeItems = [
    { icon: Subtract, label: m.thickness_mode_unique(), iconSize: 16 },
    { icon: Minimize, label: m.thickness_mode_proportional(), iconSize: 16 },
    { icon: Category, label: m.thickness_mode_classes(), iconSize: 16 }
  ];

  const THICKNESS_MODE_ORDER = [
    ThicknessMode.UNIQUE,
    ThicknessMode.PROPORTIONAL,
    ThicknessMode.CLASSES
  ];

  const thicknessModeIndex = $derived(
    THICKNESS_MODE_ORDER.indexOf(thicknessMode)
  );
</script>

<SectionHeading title={m.thickness()} />

<div class="field-group">
  <ToggleTabs
    items={thicknessModeItems}
    activeIndex={thicknessModeIndex}
    onChange={onThicknessModeChange}
    hideInactiveLabel={true}
  />
</div>

{#if thicknessMode === ThicknessMode.UNIQUE}
  <SliderWithInput
    label={m.thickness()}
    min={SLIDER_LIMITS.lineWidth.min}
    max={SLIDER_LIMITS.lineWidth.max}
    step={SLIDER_LIMITS.lineWidth.step}
    value={thickness}
    showMinMax
    inputWidth="128px"
    onchange={onThicknessChange}
  />
{:else if thicknessMode === ThicknessMode.PROPORTIONAL}
  <div class="field-group">
    <FacetsVariablePicker
      bind:open={pickerOpen}
      titleText={m.thickness_according()}
      dataFields={dataFields}
      singleSelectItems={selectableDataFields}
      selectedFieldId={sizeFieldSelection.selectedFieldId}
      selectedFieldIds={facetsSelection.getSelectedFieldIds(
        FACET_SLOT.LINE_SIZE
      )}
      isCollectionEnabled={facetsSelection.isActiveForSlot(
        FACET_SLOT.LINE_SIZE
      )}
      onSelect={sizeFieldSelection.handleSelect}
      onCollectionChange={(ids) =>
        facetsSelection.updateVariables(
          sizeColumnName,
          FACET_SLOT.LINE_SIZE,
          ids
        )}
      onToggleCollection={(en) =>
        facetsSelection.toggle(sizeColumnName, FACET_SLOT.LINE_SIZE, en)}
    />
  </div>
  <SliderWithInput
    label={m.max_thickness()}
    min={SLIDER_LIMITS.lineMaxWidth.min}
    max={SLIDER_LIMITS.lineMaxWidth.max}
    step={SLIDER_LIMITS.lineMaxWidth.step}
    value={maxThickness}
    showMinMax
    inputWidth="128px"
    onchange={onMaxThicknessChange}
  />
{:else if thicknessMode === ThicknessMode.CLASSES}
  <div class="field-group">
    <FacetsVariablePicker
      bind:open={pickerOpen}
      titleText={m.thickness_according()}
      dataFields={dataFields}
      singleSelectItems={selectableDataFields}
      selectedFieldId={valueFieldSelection.selectedFieldId}
      selectedFieldIds={facetsSelection.getSelectedFieldIds(
        FACET_SLOT.LINE_VALUE
      )}
      isCollectionEnabled={facetsSelection.isActiveForSlot(
        FACET_SLOT.LINE_VALUE
      )}
      onSelect={valueFieldSelection.handleSelect}
      onCollectionChange={(ids) =>
        facetsSelection.updateVariables(
          valueColumnName,
          FACET_SLOT.LINE_VALUE,
          ids
        )}
      onToggleCollection={(en) =>
        facetsSelection.toggle(valueColumnName, FACET_SLOT.LINE_VALUE, en)}
    />
  </div>
  <DiscretizationRow
    label={m.discretization()}
    value={thicknessDiscretizationLabel}
    onsettings={onOpenThicknessDiscretization}
  />
  <SliderWithInput
    label={m.max_thickness()}
    min={SLIDER_LIMITS.lineMaxWidth.min}
    max={SLIDER_LIMITS.lineMaxWidth.max}
    step={SLIDER_LIMITS.lineMaxWidth.step}
    value={maxThickness}
    showMinMax
    inputWidth="128px"
    onchange={onMaxThicknessChange}
  />
{/if}

<style lang="scss">
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }
</style>
