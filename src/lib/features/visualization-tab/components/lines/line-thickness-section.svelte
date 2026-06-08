<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Dropdown } from 'carbon-components-svelte';
  import { LineThick, LineThin, Table } from 'carbon-icons-svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    DiscretizationRow,
    MissingDataSection,
    SectionHeading,
    SliderWithInput,
    ToggleWithLabel
  } from '../shared';
  import FacetsVariablePicker from '../shared/facets-variable-picker.svelte';
  import {
    BasemapDottedPattern,
    SLIDER_LIMITS,
    ThicknessMode
  } from '$lib/features/commons/constants/visualization.constants';
  import {
    FACET_SLOT,
    type FacetSlotPath
  } from '../../adapters/facets-adapter';
  import { filterFieldsByKind } from '../../hooks/use-field-selection.svelte';

  interface FieldSelection {
    selectedFieldId: number;
    selectedFieldName: string | undefined;
    handleSelect: (fieldId: number) => void;
  }

  interface FacetsSelection {
    getSelectedFieldIds(slot: FacetSlotPath): number[];
    isActiveForSlot(slot: FacetSlotPath): boolean;
    updateVariables(column: string, slot: FacetSlotPath, ids: number[]): void;
    toggle(
      column: string,
      slot: FacetSlotPath,
      enabled: boolean,
      fieldIds?: number[]
    ): void;
  }

  interface Props {
    thicknessMode: ThicknessMode;
    thickness: number;
    maxThickness: number;
    dashed: boolean;
    dashedPattern: BasemapDottedPattern;
    showMissingData: boolean;
    missingDataColor: string;
    missingDataDashed: boolean;
    missingDataDashedPattern: BasemapDottedPattern;
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
    onDashedChange: (value: boolean) => void;
    onDashedPatternChange: (value: BasemapDottedPattern) => void;
    onMissingDataShowChange: (value: boolean) => void;
    onMissingDataColorChange: (value: string) => void;
    onMissingDataDashedChange: (value: boolean) => void;
    onMissingDataDashedPatternChange: (value: BasemapDottedPattern) => void;
    onOpenThicknessDiscretization: () => void;
  }

  let {
    thicknessMode,
    thickness,
    maxThickness,
    dashed,
    dashedPattern,
    showMissingData,
    missingDataColor,
    missingDataDashed,
    missingDataDashedPattern,
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
    onDashedChange,
    onDashedPatternChange,
    onMissingDataShowChange,
    onMissingDataColorChange,
    onMissingDataDashedChange,
    onMissingDataDashedPatternChange,
    onOpenThicknessDiscretization
  }: Props = $props();

  const thicknessModeItems = [
    { icon: LineThin, label: m.thickness_mode_unique(), iconSize: 16 },
    { icon: LineThick, label: m.thickness_mode_proportional(), iconSize: 16 },
    { icon: Table, label: m.thickness_mode_classes(), iconSize: 16 }
  ];

  const THICKNESS_MODE_ORDER = [
    ThicknessMode.UNIQUE,
    ThicknessMode.PROPORTIONAL,
    ThicknessMode.CLASSES
  ];

  const thicknessModeIndex = $derived(
    THICKNESS_MODE_ORDER.indexOf(thicknessMode)
  );

  const selectableSizeDataFields = $derived(
    filterFieldsByKind(
      selectableDataFields,
      'numeric',
      sizeFieldSelection.selectedFieldId
    )
  );
  const selectableValueDataFields = $derived(
    filterFieldsByKind(
      selectableDataFields,
      'numeric',
      valueFieldSelection.selectedFieldId
    )
  );
  const dashedPatternItems = $derived([
    { id: BasemapDottedPattern.DOTS, text: m.dashed_pattern_dots() },
    { id: BasemapDottedPattern.DASHES, text: m.dashed_pattern_dashes() },
    { id: BasemapDottedPattern.DASH_DOT, text: m.dashed_pattern_dash_dot() },
    {
      id: BasemapDottedPattern.LONG_DASH,
      text: m.dashed_pattern_long_dash()
    }
  ]);

  function handleDashedPatternSelect(value: string | number) {
    const next =
      Object.values(BasemapDottedPattern).find(
        (pattern) => pattern === value
      ) ?? BasemapDottedPattern.DOTS;
    onDashedPatternChange(next);
  }
</script>

{#snippet dashedControl()}
  <ToggleWithLabel
    label={m.dashed()}
    toggled={dashed}
    ontoggle={onDashedChange}
  />
  {#if dashed}
    <Dropdown
      titleText={m.stroke_dashed_pattern()}
      items={dashedPatternItems}
      selectedId={dashedPattern}
      on:select={(e) => handleDashedPatternSelect(e.detail.selectedId)}
      type="default"
    />
  {/if}
{/snippet}

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
  {@render dashedControl()}
{:else if thicknessMode === ThicknessMode.PROPORTIONAL}
  <div class="field-group">
    <FacetsVariablePicker
      bind:open={pickerOpen}
      titleText={m.thickness_according()}
      dataFields={dataFields}
      singleSelectItems={selectableSizeDataFields}
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
      onToggleCollection={(en, ids) =>
        facetsSelection.toggle(sizeColumnName, FACET_SLOT.LINE_SIZE, en, ids)}
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
  {@render dashedControl()}
  <MissingDataSection
    show={showMissingData}
    onshowchange={onMissingDataShowChange}
    color={missingDataColor}
    oncolorchange={onMissingDataColorChange}
    showShapeSelector={false}
    showSizeSlider={false}
    showDashedToggle={true}
    dashed={missingDataDashed}
    dashedPattern={missingDataDashedPattern}
    ondashedchange={onMissingDataDashedChange}
    ondashedpatternchange={onMissingDataDashedPatternChange}
  />
{:else if thicknessMode === ThicknessMode.CLASSES}
  <div class="field-group">
    <FacetsVariablePicker
      bind:open={pickerOpen}
      titleText={m.thickness_according()}
      dataFields={dataFields}
      singleSelectItems={selectableValueDataFields}
      selectedFieldId={valueFieldSelection.selectedFieldId}
      selectedFieldIds={facetsSelection.getSelectedFieldIds(
        FACET_SLOT.LINE_THICKNESS_VALUE
      )}
      isCollectionEnabled={facetsSelection.isActiveForSlot(
        FACET_SLOT.LINE_THICKNESS_VALUE
      )}
      onSelect={valueFieldSelection.handleSelect}
      onCollectionChange={(ids) =>
        facetsSelection.updateVariables(
          valueColumnName,
          FACET_SLOT.LINE_THICKNESS_VALUE,
          ids
        )}
      onToggleCollection={(en, ids) =>
        facetsSelection.toggle(
          valueColumnName,
          FACET_SLOT.LINE_THICKNESS_VALUE,
          en,
          ids
        )}
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
  {@render dashedControl()}
  <MissingDataSection
    show={showMissingData}
    onshowchange={onMissingDataShowChange}
    color={missingDataColor}
    oncolorchange={onMissingDataColorChange}
    showShapeSelector={false}
    showSizeSlider={false}
    showDashedToggle={true}
    dashed={missingDataDashed}
    dashedPattern={missingDataDashedPattern}
    ondashedchange={onMissingDataDashedChange}
    ondashedpatternchange={onMissingDataDashedPatternChange}
  />
{/if}

<style lang="scss">
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }
</style>
