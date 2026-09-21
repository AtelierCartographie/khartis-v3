<script lang="ts">
  import {
    ColorMode,
    SLIDER_LIMITS
  } from '$lib/features/commons/constants/visualization.constants';
  import * as m from '$lib/paraglide/messages';
  import { Table, Tag, TextColor } from 'carbon-icons-svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    ColorSelector,
    DiscretizationRow,
    PalettePreview,
    SectionHeading,
    SliderWithInput,
    ToggleWithLabel
  } from '../shared';
  import FacetsVariablePicker from '../shared/facets-variable-picker.svelte';
  import {
    PALETTE_TYPE,
    resolvePaletteTypeForBreakpoint
  } from '$lib/features/commons/components/palette-popover/palette.constants';
  import {
    COLOR_ROLE,
    getColorSuggestions
  } from '$lib/features/commons/services/color-suggestion.service';
  import { FACET_SLOT } from '../../adapters/facets-adapter';
  import type { ClassificationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
  import {
    filterFieldsByKind,
    type FieldSelection
  } from '../../hooks/use-field-selection.svelte';
  import type { FacetsVariableSelection } from '../../hooks/use-facets-variable-selection.svelte';

  interface Props {
    colorMode: ColorMode;
    color: string;
    opacity: number;
    halo: boolean;
    haloColor: string;
    haloWidth: number;
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
    facetsSelection: FacetsVariableSelection;
    onColorModeChange: (index: number) => void;
    onColorChange: (value: string) => void;
    onOpacityChange: (value: number) => void;
    onValueFieldSelect: (fieldId: number) => void;
    onCategoryFieldSelect: (fieldId: number) => void;
    onOpenColorDiscretization: () => void;
    onClassificationChange: (updates: Partial<ClassificationConfig>) => void;
    onInvertPalette?: () => void;
    onHaloToggle: (value: boolean) => void;
    onHaloColorChange: (value: string) => void;
    onHaloWidthChange: (value: number) => void;
  }

  let {
    colorMode,
    color,
    opacity,
    halo,
    haloColor,
    haloWidth,
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
    onOpacityChange,
    onValueFieldSelect,
    onCategoryFieldSelect,
    onOpenColorDiscretization,
    onClassificationChange,
    onInvertPalette,
    onHaloToggle,
    onHaloColorChange,
    onHaloWidthChange
  }: Props = $props();

  const colorModeItems = [
    { icon: TextColor, label: m.color_mode_unique(), iconSize: 16 },
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
</script>

<div class="text-appearance-section">
  <SectionHeading title={m.fill()} />

  <div class="field-group">
    <ToggleTabs
      items={colorModeItems}
      size="lg"
      activeIndex={colorModeIndex}
      onchange={onColorModeChange}
      hideInactiveLabel={true}
    />
  </div>

  {#if colorMode === ColorMode.CLASSES}
    <div class="field-group">
      <FacetsVariablePicker
        bind:open={colorPickerOpen}
        titleText={m.color_according()}
        dataFields={dataFields}
        singleSelectItems={selectableValueDataFields}
        selectedFieldId={valueFieldSelection.selectedFieldId}
        selectedFieldIds={facetsSelection.getSelectedFieldIds(
          FACET_SLOT.TEXT_VALUE
        )}
        isCollectionEnabled={facetsSelection.isActiveForSlot(
          FACET_SLOT.TEXT_VALUE
        )}
        onSelect={onValueFieldSelect}
        onCollectionChange={(ids) =>
          facetsSelection.updateVariables(
            valueColumnName,
            FACET_SLOT.TEXT_VALUE,
            ids
          )}
        onToggleCollection={(enabled, ids) =>
          facetsSelection.toggle(
            valueColumnName,
            FACET_SLOT.TEXT_VALUE,
            enabled,
            ids
          )}
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
  {:else if colorMode === ColorMode.CATEGORIES}
    <div class="field-group">
      <FacetsVariablePicker
        bind:open={categoryPickerOpen}
        titleText={m.color_according()}
        dataFields={dataFields}
        singleSelectItems={selectableCategoryDataFields}
        selectedFieldId={categoryFieldSelection.selectedFieldId}
        selectedFieldIds={facetsSelection.getSelectedFieldIds(
          FACET_SLOT.TEXT_CATEGORY
        )}
        isCollectionEnabled={facetsSelection.isActiveForSlot(
          FACET_SLOT.TEXT_CATEGORY
        )}
        onSelect={onCategoryFieldSelect}
        onCollectionChange={(ids) =>
          facetsSelection.updateVariables(
            categoryColumnName,
            FACET_SLOT.TEXT_CATEGORY,
            ids
          )}
        onToggleCollection={(enabled, ids) =>
          facetsSelection.toggle(
            categoryColumnName,
            FACET_SLOT.TEXT_CATEGORY,
            enabled,
            ids
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
  {:else}
    <div class="field-group">
      <ColorSelector
        exclusive
        label={m.color()}
        value={color}
        presets={getColorSuggestions(COLOR_ROLE.TEXT_FILL)}
        onchange={onColorChange}
      />
    </div>
  {/if}

  <SliderWithInput
    label={m.opacity()}
    min={SLIDER_LIMITS.textOpacity.min}
    max={SLIDER_LIMITS.textOpacity.max}
    step={SLIDER_LIMITS.textOpacity.step}
    value={opacity}
    showMinMax
    inputWidth="64px"
    onchange={onOpacityChange}
  />

  <SectionHeading title={m.stroke()} />

  <ToggleWithLabel label={m.stroke()} toggled={halo} ontoggle={onHaloToggle} />

  {#if halo}
    <div class="field-group">
      <ColorSelector
        exclusive
        label={m.color()}
        value={haloColor}
        presets={getColorSuggestions(COLOR_ROLE.TEXT_STROKE)}
        onchange={onHaloColorChange}
      />
    </div>

    <SliderWithInput
      label={m.thickness()}
      min={SLIDER_LIMITS.haloWidth.min}
      max={SLIDER_LIMITS.haloWidth.max}
      step={SLIDER_LIMITS.haloWidth.step}
      value={haloWidth}
      showMinMax
      inputWidth="64px"
      onchange={onHaloWidthChange}
    />
  {/if}
</div>

<style lang="scss">
  .text-appearance-section {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-param);
  }
</style>
