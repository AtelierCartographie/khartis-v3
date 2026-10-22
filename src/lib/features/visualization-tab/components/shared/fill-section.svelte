<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import PalettePreview from '$lib/features/commons/components/palette-popover/palette-preview.svelte';
  import {
    DEFAULT_SEQUENTIAL_PREVIEW,
    DEFAULT_QUALITATIVE_PREVIEW,
    PALETTE_TYPE,
    resolvePaletteTypeForBreakpoint
  } from '$lib/features/commons/components/palette-popover/palette.constants';
  import type { PatternPaletteConfig } from '$lib/features/commons/constants/pattern.constants';
  import * as m from '$lib/paraglide/messages';
  import {
    formatValue,
    isSingularCount
  } from '$lib/features/commons/utils/format.utils';
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
  import type { FacetMapFill } from '../../hooks/use-facets-variable-selection.svelte';
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
    missingDataPatternConfig?: PatternPaletteConfig;
    showOpacitySlider?: boolean;
    showOpacityBounds?: boolean;
    showMissingDataSection?: boolean;
    opacityInputWidth?: string;
    sectionTitle?: string;
    sectionInfoText?: string;
    densitySnippet?: Snippet;
    uniqueSnippet?: Snippet;
    /** Replaces the variable, aspect and palette rows of the categories mode. */
    categoriesSnippet?: Snippet;
    selectableDataFields: Array<{ id: number; text: string; type?: string }>;
    getFacetsSelectedFieldIds: (slotPath: FacetSlotPath) => number[];
    isFacetsActiveForSlot: (slotPath: FacetSlotPath) => boolean;
    getFacetsMapFills?: (slotPath: FacetSlotPath) => FacetMapFill[];
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
      slotPath: FacetSlotPath,
      enabled: boolean
    ) => void | Promise<void>;
    onFacetsMapFillSelect?: (variable: string, fieldId: number) => void;
    onOpenDiscretization: () => void;
    onClassificationChange: (updates: Partial<ClassificationConfig>) => void;
    onMissingDataShowChange?: (show: boolean) => void;
    onMissingDataColorChange?: (color: string) => void;
    onMissingDataPatternChange?: (pattern: boolean) => void;
    onMissingDataPatternStyleChange?: (config: PatternPaletteConfig) => void;
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
    missingDataPatternConfig,
    showOpacitySlider = true,
    showOpacityBounds = false,
    showMissingDataSection = true,
    opacityInputWidth = '128px',
    sectionTitle,
    sectionInfoText,
    densitySnippet,
    uniqueSnippet,
    categoriesSnippet,
    selectableDataFields,
    getFacetsSelectedFieldIds,
    isFacetsActiveForSlot,
    getFacetsMapFills,
    onFillModeChange,
    onFillColorChange,
    onFillOpacityChange,
    onValueFieldSelect,
    onCategoryFieldSelect,
    onFacetsVariablesChange,
    onFacetsToggle,
    onFacetsMapFillSelect,
    onOpenDiscretization,
    onClassificationChange,
    onMissingDataShowChange,
    onMissingDataColorChange,
    onMissingDataPatternChange,
    onMissingDataPatternStyleChange,
    onInvertPalette
  }: Props = $props();

  const fillModeItems = $derived(buildFillModeItems(availableModes));
  const valueMapFills = $derived(
    getFacetsMapFills?.(facetsValueSlotPath) ?? []
  );
  const categoryMapFills = $derived(
    getFacetsMapFills?.(facetsCategorySlotPath) ?? []
  );
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
      Boolean(visualization?.classification?.pattern),
    patternConfig:
      (categoriesVariant === 'polygons'
        ? visualization?.classification?.pattern
        : undefined) ?? DEFAULT_COMMON_ASPECT.patternConfig
  });
  const selectableValueFields = $derived(
    filterFieldsByKind(
      selectableDataFields,
      'classed-color',
      selectedValueFieldId
    )
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

{#snippet mapFillPickers(
  mapFills: FacetMapFill[],
  items: Array<{ id: number; text: string; type?: string }>
)}
  {#each mapFills as mapFill (mapFill.variable)}
    <div class="field-group">
      <FacetsVariablePicker
        titleText={m.facets_map_fill_label({ title: mapFill.title })}
        dataFields={dataFields}
        singleSelectItems={items}
        selectedFieldId={mapFill.fieldId}
        isCollectionEnabled={false}
        showCollectionFooter={false}
        onSelect={(fieldId) =>
          onFacetsMapFillSelect?.(mapFill.variable, fieldId)}
      />
    </div>
  {/each}
{/snippet}

{#if sectionTitle !== undefined}
  <SectionHeading title={sectionTitle} infoText={sectionInfoText} />
{/if}

<div class="field-group">
  <ToggleTabs
    items={fillModeItems}
    size="md"
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
      allowPattern={categoriesVariant === 'polygons'}
      label={m.color()}
      color={fillColor}
      patternPaletteConfig={categoriesVariant === 'polygons'
        ? visualization?.classification?.pattern
        : undefined}
      onchange={onFillColorChange}
      onpatternchange={(config) => {
        if (categoriesVariant === 'polygons') {
          onClassificationChange({
            pattern: config,
            patternId: undefined,
            patternParams: undefined
          });
        }
      }}
    />
  {/if}
{:else if fillMode === FillMode.DENSITY && densitySnippet}
  {@render densitySnippet()}
{:else if fillMode === FillMode.CLASSES}
  {#if valueMapFills.length > 0}
    {@render mapFillPickers(valueMapFills, selectableValueFields)}
  {:else}
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
        onToggleCollection={(en) => onFacetsToggle(facetsValueSlotPath, en)}
      />
    </div>
  {/if}
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
    categoriesVariant={categoriesVariant}
    oninvert={onInvertPalette}
    onClassificationChange={onClassificationChange}
  />
{:else if fillMode === FillMode.CATEGORIES && categoriesSnippet}
  {@render categoriesSnippet()}
{:else if fillMode === FillMode.CATEGORIES}
  {#if categoryMapFills.length > 0}
    {@render mapFillPickers(categoryMapFills, selectableCategoryFields)}
  {:else}
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
        onToggleCollection={(en) => onFacetsToggle(facetsCategorySlotPath, en)}
      />
    </div>
  {/if}
  <DiscretizationRow
    label={m.category_aspect()}
    value={(isSingularCount(resolvedCategoryCount)
      ? m.categories_count_one
      : m.categories_count)({ count: formatValue(resolvedCategoryCount) })}
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
    classification={visualization?.classification}
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

{#if showMissingDataSection && (fillMode === FillMode.CLASSES || fillMode === FillMode.CATEGORIES || fillMode === FillMode.DENSITY)}
  <MissingDataSection
    bind:show={missingDataShow}
    color={missingDataColor}
    showShapeSelector={false}
    showSizeSlider={false}
    showPatternToggle={categoriesVariant === 'polygons'}
    pattern={missingDataPattern}
    patternConfig={missingDataPatternConfig}
    onshowchange={onMissingDataShowChange ?? (() => {})}
    oncolorchange={onMissingDataColorChange ?? (() => {})}
    onpatternchange={onMissingDataPatternChange ?? (() => {})}
    onpatternstylechange={onMissingDataPatternStyleChange ?? (() => {})}
  />
{/if}
