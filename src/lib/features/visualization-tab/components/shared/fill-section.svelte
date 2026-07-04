<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import PalettePreview from '$lib/features/commons/components/palette-popover/palette-preview.svelte';
  import {
    DEFAULT_SEQUENTIAL_PREVIEW,
    DEFAULT_QUALITATIVE_PREVIEW,
    PALETTE_TYPE,
    resolvePaletteTypeForBreakpoint,
    type PatternParams
  } from '$lib/features/commons/components/palette-popover/palette.constants';
  import * as m from '$lib/paraglide/messages';
  import type {
    ClassificationConfig,
    VisualizationConfig
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import {
    SectionHeading,
    SliderWithInput
  } from '$lib/features/commons/components/viz-controls';
  import {
    DEFAULT_COLORS,
    FillMode,
    SLIDER_LIMITS
  } from '$lib/features/commons/constants/visualization.constants';
  import type { FacetSlotPath } from '../../types/facets-contract.types';
  import DiscretizationRow from './discretization-row.svelte';
  import MissingDataSection from './missing-data-section.svelte';
  import FacetsVariablePicker from './facets-variable-picker.svelte';
  import { buildFillModeItems } from './fill-mode-presets';
  import {
    DEFAULT_COMMON_ASPECT,
    type CategoriesAspectVariant,
    type CategoriesCommonAspect
  } from '$lib/features/commons/components/palette-popover/categories-aspect-popover.types';
  import { useCategoryLabels } from '../../hooks/use-category-labels.svelte';
  import { filterFieldsByKind } from '../../hooks/use-field-selection.svelte';

  interface Props {
    visualization?: VisualizationConfig;
    dataFields: Array<{ id: number; text: string; type?: string }>;
    availableModes: readonly FillMode[];
    fillMode: FillMode;
    fillColor: string;
    fillOpacity: number;
    selectedValueFieldId: number;
    selectedCategoryFieldId: number;
    discretizationLabel: string;
    categoryCount: number;
    facetsValueSlotPath: FacetSlotPath;
    facetsCategorySlotPath: FacetSlotPath;
    categoriesVariant: CategoriesAspectVariant;
    showMissingData?: boolean;
    missingDataColor?: string;
    missingDataPattern?: boolean;
    missingDataPatternId?: string;
    missingDataPatternParams?: PatternParams;
    showOpacitySlider?: boolean;
    showOpacityBounds?: boolean;
    showMissingDataSection?: boolean;
    opacityInputWidth?: string;
    sectionTitle?: string;
    sectionInfoText?: string;
    densitySnippet?: Snippet;
    uniqueSnippet?: Snippet;
    selectableDataFields: Array<{ id: number; text: string; type?: string }>;
    getFacetsSelectedFieldIds: (slotPath: FacetSlotPath) => number[];
    isFacetsActiveForSlot: (slotPath: FacetSlotPath) => boolean;
    onFillModeChange: (mode: FillMode) => void;
    onFillColorChange: (color: string) => void;
    onFillOpacityChange: (opacity: number) => void;
    onValueFieldSelect: (fieldId: number) => void;
    onCategoryFieldSelect: (fieldId: number) => void;
    onFacetsVariablesChange: (
      baseVariableName: string,
      slotPath: FacetSlotPath,
      fieldIds: number[]
    ) => void | Promise<void>;
    onFacetsToggle: (
      baseVariableName: string,
      slotPath: FacetSlotPath,
      enabled: boolean,
      fieldIds?: number[]
    ) => void | Promise<void>;
    onOpenDiscretization: () => void;
    onClassificationChange: (updates: Partial<ClassificationConfig>) => void;
    onMissingDataShowChange?: (show: boolean) => void;
    onMissingDataColorChange?: (color: string) => void;
    onMissingDataPatternChange?: (pattern: boolean) => void;
    onMissingDataPatternStyleChange?: (
      patternId: string,
      params: PatternParams
    ) => void;
    onInvertPalette?: () => void;
  }

  let {
    visualization,
    dataFields,
    availableModes,
    fillMode,
    fillColor,
    fillOpacity,
    selectedValueFieldId,
    selectedCategoryFieldId,
    discretizationLabel,
    categoryCount,
    facetsValueSlotPath,
    facetsCategorySlotPath,
    categoriesVariant,
    showMissingData = true,
    missingDataColor = DEFAULT_COLORS.missingData,
    missingDataPattern = false,
    missingDataPatternId = 'diagonal',
    missingDataPatternParams = { size: 4, scale: 8 },
    showOpacitySlider = true,
    showOpacityBounds = false,
    showMissingDataSection = true,
    opacityInputWidth = '128px',
    sectionTitle,
    sectionInfoText,
    densitySnippet,
    uniqueSnippet,
    selectableDataFields,
    getFacetsSelectedFieldIds,
    isFacetsActiveForSlot,
    onFillModeChange,
    onFillColorChange,
    onFillOpacityChange,
    onValueFieldSelect,
    onCategoryFieldSelect,
    onFacetsVariablesChange,
    onFacetsToggle,
    onOpenDiscretization,
    onClassificationChange,
    onMissingDataShowChange,
    onMissingDataColorChange,
    onMissingDataPatternChange,
    onMissingDataPatternStyleChange,
    onInvertPalette
  }: Props = $props();

  const fillModeItems = $derived(buildFillModeItems(availableModes));
  const fillModeIndex = $derived(availableModes.indexOf(fillMode));

  let valuePickerOpen = $state(false);
  let categoryPickerOpen = $state(false);
  let categoriesPopoverOpen = $state(false);

  const currentPalette = $derived(
    visualization?.classification?.colors ?? DEFAULT_SEQUENTIAL_PREVIEW
  );
  const currentQualPalette = $derived(
    visualization?.classification?.colors ?? DEFAULT_QUALITATIVE_PREVIEW
  );

  const valueColumnName = $derived(
    dataFields.find((f) => f.id === selectedValueFieldId)?.text ?? ''
  );
  const categoryColumnName = $derived(
    dataFields.find((f) => f.id === selectedCategoryFieldId)?.text ?? ''
  );
  const currentCategoryColumnName = $derived(
    visualization?.mapping.categoryColumn ?? categoryColumnName
  );
  const dataset = $derived(
    visualization
      ? (datasetsStore.datasets.find((d) => d.id === visualization.datasetId) ??
          datasetsStore.selectedDataset)
      : datasetsStore.selectedDataset
  );
  const categoryLabels = useCategoryLabels({
    enabled: () => fillMode === FillMode.CATEGORIES,
    getDataset: () => dataset,
    getColumnName: () => currentCategoryColumnName,
    getClassification: () => visualization?.classification,
    fallbackCount: () => categoryCount || 4
  });
  const resolvedCategoryCount = $derived(categoryLabels.count);
  const categoriesCommonAspect = $derived<CategoriesCommonAspect>({
    ...DEFAULT_COMMON_ASPECT,
    pattern:
      categoriesVariant === 'polygons' &&
      Boolean(visualization?.classification?.patternId),
    patternId:
      (categoriesVariant === 'polygons'
        ? visualization?.classification?.patternId
        : undefined) ?? DEFAULT_COMMON_ASPECT.patternId,
    patternParams:
      (categoriesVariant === 'polygons'
        ? visualization?.classification?.patternParams
        : undefined) ?? DEFAULT_COMMON_ASPECT.patternParams
  });
  const selectableValueFields = $derived(
    filterFieldsByKind(selectableDataFields, 'numeric', selectedValueFieldId)
  );
  const selectableCategoryFields = $derived(
    filterFieldsByKind(selectableDataFields, 'textual', selectedCategoryFieldId)
  );

  function handleToggleChange(index: number) {
    const nextMode = availableModes[index] ?? FillMode.NONE;
    if (nextMode === fillMode) {
      return;
    }

    onFillModeChange(nextMode);
  }

  function resolveMissingDataShow(): boolean {
    return showMissingData;
  }

  let missingDataShow = $state(resolveMissingDataShow());

  $effect(() => {
    const next = resolveMissingDataShow();
    untrack(() => {
      missingDataShow = next;
    });
  });
</script>

{#if sectionTitle !== undefined}
  <SectionHeading title={sectionTitle} infoText={sectionInfoText} />
{/if}

<div class="field-group">
  <ToggleTabs
    items={fillModeItems}
    activeIndex={fillModeIndex}
    onchange={handleToggleChange}
    hideInactiveLabel={true}
  />
</div>

{#if fillMode === FillMode.UNIQUE}
  {#if uniqueSnippet}
    {@render uniqueSnippet()}
  {:else}
    <SingleColorPreview
      exclusive
      label={m.color()}
      color={fillColor}
      patternId={categoriesVariant === 'polygons'
        ? visualization?.classification?.patternId
        : undefined}
      onchange={onFillColorChange}
      onpatternchange={(patternId, patternParams) => {
        if (categoriesVariant === 'polygons') {
          onClassificationChange({
            patternId,
            patternParams: patternId ? patternParams : undefined
          });
        }
      }}
    />
  {/if}
{:else if fillMode === FillMode.DENSITY && densitySnippet}
  {@render densitySnippet()}
{:else if fillMode === FillMode.CLASSES}
  <div class="field-group">
    <FacetsVariablePicker
      bind:open={valuePickerOpen}
      titleText={m.color_according()}
      dataFields={dataFields}
      singleSelectItems={selectableValueFields}
      selectedFieldId={selectedValueFieldId}
      selectedFieldIds={getFacetsSelectedFieldIds(facetsValueSlotPath)}
      isCollectionEnabled={isFacetsActiveForSlot(facetsValueSlotPath)}
      onSelect={onValueFieldSelect}
      onCollectionChange={(ids) =>
        onFacetsVariablesChange(valueColumnName, facetsValueSlotPath, ids)}
      onToggleCollection={(en, ids) =>
        onFacetsToggle(valueColumnName, facetsValueSlotPath, en, ids)}
    />
  </div>
  <DiscretizationRow
    label={m.discretization()}
    value={discretizationLabel}
    onsettings={onOpenDiscretization}
  />
  <PalettePreview
    label={m.color_palette()}
    colors={currentPalette}
    selectedPaletteId={visualization?.classification?.paletteId}
    inverted={visualization?.classification?.inverted ?? false}
    showInvertButton={false}
    paletteType={resolvePaletteTypeForBreakpoint(visualization?.classification)}
    classification={visualization?.classification}
    oninvert={onInvertPalette}
    onClassificationChange={onClassificationChange}
  />
{:else if fillMode === FillMode.CATEGORIES}
  <div class="field-group">
    <FacetsVariablePicker
      bind:open={categoryPickerOpen}
      titleText={m.color_according()}
      dataFields={dataFields}
      singleSelectItems={selectableCategoryFields}
      selectedFieldId={selectedCategoryFieldId}
      selectedFieldIds={getFacetsSelectedFieldIds(facetsCategorySlotPath)}
      isCollectionEnabled={isFacetsActiveForSlot(facetsCategorySlotPath)}
      onSelect={onCategoryFieldSelect}
      onCollectionChange={(ids) =>
        onFacetsVariablesChange(
          categoryColumnName,
          facetsCategorySlotPath,
          ids
        )}
      onToggleCollection={(en, ids) =>
        onFacetsToggle(categoryColumnName, facetsCategorySlotPath, en, ids)}
    />
  </div>
  <DiscretizationRow
    label={m.category_aspect()}
    value={m.categories_count({ count: resolvedCategoryCount })}
    settingsIconDescription={m.palette_categories_aspect_title()}
    onsettings={() => {
      categoriesPopoverOpen = true;
    }}
  />
  <PalettePreview
    label={m.color_palette()}
    colors={currentQualPalette}
    selectedPaletteId={visualization?.classification?.paletteId}
    inverted={visualization?.classification?.inverted ?? false}
    paletteType={PALETTE_TYPE.QUALITATIVE}
    categoriesMode={true}
    categoriesVariant={categoriesVariant}
    categoriesCommonAspect={categoriesCommonAspect}
    showCategoriesCommonAspect={categoriesVariant === 'polygons'}
    categoryLabels={categoryLabels.labels}
    bind:categoriesPopoverOpen={categoriesPopoverOpen}
    oninvert={onInvertPalette}
    onClassificationChange={onClassificationChange}
  />
{/if}

{#if showOpacitySlider && fillMode !== FillMode.NONE && fillMode !== FillMode.DENSITY}
  <SliderWithInput
    label={m.opacity()}
    min={SLIDER_LIMITS.opacity.min}
    max={SLIDER_LIMITS.opacity.max}
    step={SLIDER_LIMITS.opacity.step}
    value={fillOpacity}
    showMinMax={showOpacityBounds}
    inputWidth={opacityInputWidth}
    onchange={onFillOpacityChange}
  />
{/if}

{#if showMissingDataSection && (fillMode === FillMode.CLASSES || fillMode === FillMode.CATEGORIES)}
  <MissingDataSection
    bind:show={missingDataShow}
    color={missingDataColor}
    showShapeSelector={false}
    showSizeSlider={false}
    showPatternToggle={categoriesVariant === 'polygons'}
    pattern={missingDataPattern}
    patternId={missingDataPatternId}
    patternParams={missingDataPatternParams}
    onshowchange={onMissingDataShowChange ?? (() => {})}
    oncolorchange={onMissingDataColorChange ?? (() => {})}
    onpatternchange={onMissingDataPatternChange ?? (() => {})}
    onpatternstylechange={onMissingDataPatternStyleChange ?? (() => {})}
  />
{/if}

<style lang="scss">
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }
</style>
