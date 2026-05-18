<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Dropdown } from 'carbon-components-svelte';
  import { Subtract, Table, Tag } from 'carbon-icons-svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    DiscretizationRow,
    MissingDataSection,
    PalettePreview,
    SectionHeading,
    ToggleWithLabel
  } from '../shared';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import {
    PALETTE_TYPE,
    resolvePaletteTypeForBreakpoint
  } from '$lib/features/commons/components/palette-popover/palette.constants';
  import FacetsVariablePicker from '../shared/facets-variable-picker.svelte';
  import {
    BasemapDottedPattern,
    ColorMode
  } from '$lib/features/commons/constants/visualization.constants';
  import {
    FACET_SLOT,
    type FacetSlotPath
  } from '../../adapters/facets-adapter';
  import type { ClassificationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
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
    toggle(column: string, slot: FacetSlotPath, enabled: boolean): void;
  }

  interface Props {
    colorMode: ColorMode;
    color: string;
    dashed: boolean;
    dashedPattern: BasemapDottedPattern;
    showMissingData: boolean;
    missingDataColor: string;
    missingDataSize: number;
    missingDataDashed: boolean;
    missingDataDashedPattern: BasemapDottedPattern;
    valueColumnName: string;
    categoryColumnName: string;
    colorDiscretizationLabel: string;
    classification: ClassificationConfig | undefined;
    palette: string[];
    categoriesPalette: string[];
    categoryLabels: string[];
    categoryCount: number;
    colorPickerOpen: boolean;
    categoryPickerOpen: boolean;
    categoriesPopoverOpen: boolean;
    dataFields: Array<{ id: number; text: string; type?: string }>;
    selectableDataFields: Array<{ id: number; text: string; type?: string }>;
    valueFieldSelection: FieldSelection;
    categoryFieldSelection: FieldSelection;
    facetsSelection: FacetsSelection;
    onColorModeChange: (index: number) => void;
    onColorChange: (value: string) => void;
    onDashedChange: (value: boolean) => void;
    onDashedPatternChange: (value: BasemapDottedPattern) => void;
    onMissingDataShowChange: (value: boolean) => void;
    onMissingDataColorChange: (value: string) => void;
    onMissingDataSizeChange: (value: number) => void;
    onMissingDataDashedChange: (value: boolean) => void;
    onMissingDataDashedPatternChange: (value: BasemapDottedPattern) => void;
    onOpenColorDiscretization: () => void;
    onClassificationChange: (updates: Partial<ClassificationConfig>) => void;
    onInvertPalette?: () => void;
  }

  let {
    colorMode,
    color,
    dashed,
    dashedPattern,
    showMissingData,
    missingDataColor,
    missingDataSize,
    missingDataDashed,
    missingDataDashedPattern,
    valueColumnName,
    categoryColumnName,
    colorDiscretizationLabel,
    classification,
    palette,
    categoriesPalette,
    categoryLabels,
    categoryCount,
    colorPickerOpen = $bindable(),
    categoryPickerOpen = $bindable(),
    categoriesPopoverOpen = $bindable(),
    dataFields,
    selectableDataFields,
    valueFieldSelection,
    categoryFieldSelection,
    facetsSelection,
    onColorModeChange,
    onColorChange,
    onDashedChange,
    onDashedPatternChange,
    onMissingDataShowChange,
    onMissingDataColorChange,
    onMissingDataSizeChange,
    onMissingDataDashedChange,
    onMissingDataDashedPatternChange,
    onOpenColorDiscretization,
    onClassificationChange,
    onInvertPalette
  }: Props = $props();

  const colorModeItems = [
    { icon: Subtract, label: m.color_mode_unique(), iconSize: 16 },
    { icon: Table, label: m.color_mode_classes(), iconSize: 16 },
    { icon: Tag, label: m.color_mode_categories(), iconSize: 16 }
  ];

  const COLOR_MODE_ORDER = [
    ColorMode.UNIQUE,
    ColorMode.CLASSES,
    ColorMode.CATEGORIES
  ];

  const colorModeIndex = $derived(COLOR_MODE_ORDER.indexOf(colorMode));

  const selectableValueDataFields = $derived(
    filterFieldsByKind(
      selectableDataFields,
      'numeric',
      valueFieldSelection.selectedFieldId
    )
  );
  const selectableCategoryDataFields = $derived(
    filterFieldsByKind(
      selectableDataFields,
      'textual',
      categoryFieldSelection.selectedFieldId
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

<SectionHeading title={m.color()} />

<div class="field-group">
  <ToggleTabs
    items={colorModeItems}
    activeIndex={colorModeIndex}
    onChange={onColorModeChange}
    hideInactiveLabel={true}
  />
</div>

{#if colorMode === ColorMode.UNIQUE}
  <SingleColorPreview
    exclusive
    label={m.color()}
    color={color}
    onchange={onColorChange}
  />
{:else if colorMode === ColorMode.CLASSES}
  <div class="field-group">
    <FacetsVariablePicker
      bind:open={colorPickerOpen}
      titleText={m.color_according()}
      dataFields={dataFields}
      singleSelectItems={selectableValueDataFields}
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
    value={colorDiscretizationLabel}
    onsettings={onOpenColorDiscretization}
  />
  <PalettePreview
    label={m.color_palette()}
    colors={palette}
    selectedPaletteId={classification?.paletteId}
    inverted={classification?.inverted ?? false}
    paletteType={resolvePaletteTypeForBreakpoint(classification)}
    classification={classification}
    oninvert={onInvertPalette}
    onClassificationChange={onClassificationChange}
  />
  <MissingDataSection
    show={showMissingData}
    onshowchange={onMissingDataShowChange}
    color={missingDataColor}
    oncolorchange={onMissingDataColorChange}
    size={missingDataSize}
    sizeLabel={m.thickness()}
    onsizechange={onMissingDataSizeChange}
    showShapeSelector={false}
    showDashedToggle={true}
    dashed={missingDataDashed}
    dashedPattern={missingDataDashedPattern}
    ondashedchange={onMissingDataDashedChange}
    ondashedpatternchange={onMissingDataDashedPatternChange}
  />
{:else if colorMode === ColorMode.CATEGORIES}
  <div class="field-group">
    <FacetsVariablePicker
      bind:open={categoryPickerOpen}
      titleText={m.color_according()}
      dataFields={dataFields}
      singleSelectItems={selectableCategoryDataFields}
      selectedFieldId={categoryFieldSelection.selectedFieldId}
      selectedFieldIds={facetsSelection.getSelectedFieldIds(
        FACET_SLOT.LINE_CATEGORY
      )}
      isCollectionEnabled={facetsSelection.isActiveForSlot(
        FACET_SLOT.LINE_CATEGORY
      )}
      onSelect={categoryFieldSelection.handleSelect}
      onCollectionChange={(ids) =>
        facetsSelection.updateVariables(
          categoryColumnName,
          FACET_SLOT.LINE_CATEGORY,
          ids
        )}
      onToggleCollection={(en) =>
        facetsSelection.toggle(
          categoryColumnName,
          FACET_SLOT.LINE_CATEGORY,
          en
        )}
    />
  </div>
  <DiscretizationRow
    label={m.category_aspect()}
    value={m.categories_count({ count: categoryCount })}
    settingsIconDescription={m.palette_categories_aspect_title()}
    onsettings={() => {
      categoriesPopoverOpen = true;
    }}
  />
  <PalettePreview
    label={m.color_palette()}
    colors={categoriesPalette}
    selectedPaletteId={classification?.paletteId}
    inverted={classification?.inverted ?? false}
    paletteType={PALETTE_TYPE.QUALITATIVE}
    categoriesMode={true}
    categoriesVariant="lines"
    categoryLabels={categoryLabels}
    bind:categoriesPopoverOpen={categoriesPopoverOpen}
    oninvert={onInvertPalette}
    onClassificationChange={onClassificationChange}
  />
  <MissingDataSection
    show={showMissingData}
    onshowchange={onMissingDataShowChange}
    color={missingDataColor}
    oncolorchange={onMissingDataColorChange}
    size={missingDataSize}
    sizeLabel={m.thickness()}
    onsizechange={onMissingDataSizeChange}
    showShapeSelector={false}
    showDashedToggle={true}
    dashed={missingDataDashed}
    dashedPattern={missingDataDashedPattern}
    ondashedchange={onMissingDataDashedChange}
    ondashedpatternchange={onMissingDataDashedPatternChange}
  />
{/if}

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

<style lang="scss">
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }
</style>
