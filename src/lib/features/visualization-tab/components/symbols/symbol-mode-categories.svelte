<script lang="ts">
  import { untrack } from 'svelte';
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import { Dropdown } from 'carbon-components-svelte';
  import SimpleRadioGroup from '$lib/features/commons/components/simple-radio-group.svelte';
  import { Settings } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    DEFAULT_QUALITATIVE_PREVIEW,
    PALETTE_TYPE
  } from '$lib/features/commons/components/palette-popover/palette.constants';
  import {
    CategoryShapeMode,
    MissingDataShape,
    ShapeType,
    SLIDER_LIMITS,
    StrokeMode,
    SymbolMode,
    DEFAULT_COLORS,
    VISUALIZATION_DEFAULTS
  } from '$lib/features/commons/constants/visualization.constants';
  import {
    DEFAULT_COMMON_ASPECT,
    type CategoriesAspectVariant,
    type CategoriesCommonAspect,
    type CategoryDraft
  } from '$lib/features/commons/components/palette-popover/categories-aspect-popover.types';
  import {
    InfoPopover,
    MissingDataSection,
    PalettePreview,
    SliderWithInput,
    StrokeSection
  } from '../shared';
  import { resolveCategoryPreviewCount } from '../shared/categorical-preview.utils';
  import type { SymbolModeProps } from '../../types/symbol.types';
  import DiscretizationModal from '../discretization/discretization-modal.svelte';
  import { resolveDiscretizationLabel } from '../discretization/discretization.utils';
  import { FACET_SLOT } from '../../adapters/facets-adapter';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import FacetsVariablePicker from '../shared/facets-variable-picker.svelte';
  import { useCategoryLabels } from '../../hooks/use-category-labels.svelte';
  import {
    NONE_FIELD_ID,
    filterFieldsByKind,
    useFieldSelectionHandler
  } from '../../hooks/use-field-selection.svelte';
  import { useFacetsVariableSelection } from '../../hooks/use-facets-variable-selection.svelte';
  import {
    coerceShapeType,
    parseOpacityToSlider
  } from '../../utils/coerce.utils';
  import { resetCategoryVisualClassification } from '../shared/classification-reset.utils';
  import {
    buildSymbolShapeDropdownItems,
    getSymbolShapeTypes
  } from './symbol-shape-options';
  import { getDefaultScaleForShape } from './scale-by-shape.utils';

  const AUTO_CATEGORY_STROKE_COLOR = '#000000';
  const AUTO_CATEGORY_STROKE_OPACITY = 0.6;

  let {
    dataFields = [],
    visualization,
    onStyleChange,
    onMappingChange,
    onStrokeMappingChange,
    onSymbolsChange,
    onSymbolPrimitiveChange,
    onModesChange,
    onMissingDataChange,
    onClassificationChange,
    onStrokeClassificationChange,
    onStrokeInvertPalette
  }: SymbolModeProps = $props();

  const currentPalette = $derived(
    visualization?.symbol?.classification?.colors ??
      visualization?.symbolClassification?.colors ??
      DEFAULT_QUALITATIVE_PREVIEW
  );
  const symbolClassification = $derived(
    visualization?.symbol?.classification ?? visualization?.symbolClassification
  );
  const dataset = $derived(
    visualization
      ? (datasetsStore.datasets.find((d) => d.id === visualization.datasetId) ??
          datasetsStore.selectedDataset)
      : datasetsStore.selectedDataset
  );

  let strokeDiscretizationModalOpen = $state(false);
  let categoryPickerOpen = $state(false);
  let categoryCount = $state<number>(4);
  let categoriesAspectOpen = $state(false);
  let symbolOpacity = $state<number>(100);
  let shapeType = $state<ShapeType>(ShapeType.CIRCLE);
  let categoryShapeMode = $state<CategoryShapeMode>(CategoryShapeMode.UNIQUE);
  let showMissingData = $state<boolean>(true);
  let missingDataShape = $state<MissingDataShape>(MissingDataShape.CIRCLE);
  let missingDataSize = $state<number>(2);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);
  const categoryFieldSelection = useFieldSelectionHandler({
    getDataFields: () => dataFields,
    columnKey: 'categoryColumn',
    onMappingChange: (updates) => onMappingChange?.(updates)
  });
  const facetsSelection = useFacetsVariableSelection({
    getVisualizationId: () => visualization?.id,
    getDataFields: () => dataFields
  });
  const categoryColumnName = $derived(
    categoryFieldSelection.selectedFieldName ?? ''
  );
  const selectableCategoryFields = $derived(
    filterFieldsByKind(
      selectableDataFields,
      'textual',
      categoryFieldSelection.selectedFieldId
    )
  );
  const categoryLabels = useCategoryLabels({
    getDataset: () => dataset,
    getColumnName: () =>
      visualization?.symbol?.categoryColumn ??
      visualization?.mapping.categoryColumn,
    getClassification: () => symbolClassification,
    fallbackCount: 4,
    onResolvedLabels: syncFetchedCategoryLabels
  });
  const resolvedCategoryLabels = $derived(categoryLabels.labels);

  const availableShapes = getSymbolShapeTypes(SymbolMode.CATEGORIES);
  const shapeDropdownItems = $derived(
    buildSymbolShapeDropdownItems(SymbolMode.CATEGORIES)
  );

  function coerceCategoryShapeMode(
    mode: CategoryShapeMode | undefined
  ): CategoryShapeMode {
    if (!mode || mode === CategoryShapeMode.ORDERED) {
      return CategoryShapeMode.UNIQUE;
    }
    return mode;
  }

  function syncFetchedCategoryLabels(nextLabels: string[]) {
    const persistedLabels = symbolClassification?.labels ?? [];
    if (
      !onClassificationChange ||
      nextLabels.length === 0 ||
      (persistedLabels.length === nextLabels.length &&
        persistedLabels.every((label, index) => label === nextLabels[index]))
    ) {
      return;
    }

    onClassificationChange({ labels: nextLabels });
  }

  function handleShapeDropdownSelect(value: string | number) {
    const next =
      availableShapes.find((type) => type === value) ?? ShapeType.CIRCLE;
    shapeType = next;
    onSymbolsChange?.({
      type: next,
      sizeScale: getDefaultScaleForShape(next)
    });
  }

  function handleCategoryShapeModeChange(next: CategoryShapeMode) {
    if (next === categoryShapeMode) return;
    categoryShapeMode = next;
    onModesChange?.({ categoryShape: next });
    if (next === CategoryShapeMode.UNIQUE) {
      onClassificationChange?.({ categoryShapes: undefined });
    } else if (next === CategoryShapeMode.DIFFERENT) {
      onClassificationChange?.({ categoryShapes: undefined });
    }
  }

  const categoriesVariant = $derived<CategoriesAspectVariant>(
    categoryShapeMode === CategoryShapeMode.DIFFERENT
      ? 'symbols-different'
      : 'symbols-unique'
  );

  const categoriesCommonAspect = $derived<CategoriesCommonAspect>({
    ...DEFAULT_COMMON_ASPECT,
    size:
      visualization?.symbol?.size ??
      visualization?.symbols?.size ??
      DEFAULT_COMMON_ASPECT.size,
    stroke:
      (visualization?.symbol?.strokeMode ?? StrokeMode.NONE) !==
        StrokeMode.NONE && (visualization?.symbol?.strokeWidth ?? 0) > 0,
    autoColor:
      (visualization?.symbol?.strokeMode ?? StrokeMode.NONE) ===
      StrokeMode.UNIQUE,
    strokeUnique:
      !visualization?.symbol?.strokeClassification?.categoryStrokeWidths,
    strokeSize: Math.max(
      1,
      visualization?.symbol?.strokeWidth ?? DEFAULT_COMMON_ASPECT.strokeSize
    ),
    pattern: Boolean(symbolClassification?.patternId),
    patternId:
      symbolClassification?.patternId ?? DEFAULT_COMMON_ASPECT.patternId,
    patternParams:
      symbolClassification?.patternParams ??
      DEFAULT_COMMON_ASPECT.patternParams,
    shape: visualization?.symbol?.shape ?? DEFAULT_COMMON_ASPECT.shape,
    color: currentPalette[0] ?? DEFAULT_COMMON_ASPECT.color
  });

  $effect(() => {
    const categoryCol =
      visualization?.symbol?.categoryColumn ??
      visualization?.mapping.categoryColumn;
    categoryFieldSelection.sync(categoryCol);

    const symbolConfig = visualization?.symbol;
    if (symbolConfig) {
      symbolOpacity = parseOpacityToSlider(
        symbolConfig.opacity,
        VISUALIZATION_DEFAULTS.symbolOpacity
      );
      const persistedShape =
        coerceShapeType(symbolConfig.shape) ?? ShapeType.CIRCLE;
      shapeType = availableShapes.includes(persistedShape)
        ? persistedShape
        : ShapeType.CIRCLE;
      const nextCategoryShapeMode = coerceCategoryShapeMode(
        symbolConfig.categoryShape ?? untrack(() => categoryShapeMode)
      );
      categoryShapeMode = nextCategoryShapeMode;
      if (symbolConfig.categoryShape === CategoryShapeMode.ORDERED) {
        queueMicrotask(() =>
          onModesChange?.({ categoryShape: nextCategoryShapeMode })
        );
      }
    } else if (visualization?.symbols) {
      symbolOpacity = parseOpacityToSlider(
        visualization.symbols.opacity,
        VISUALIZATION_DEFAULTS.symbolOpacity
      );
      const persistedShape = visualization.symbols.type ?? ShapeType.CIRCLE;
      shapeType = availableShapes.includes(persistedShape)
        ? persistedShape
        : ShapeType.CIRCLE;
      if (visualization?.modes?.categoryShape) {
        const nextCategoryShapeMode = coerceCategoryShapeMode(
          visualization.modes.categoryShape
        );
        categoryShapeMode = nextCategoryShapeMode;
        if (visualization.modes.categoryShape === CategoryShapeMode.ORDERED) {
          queueMicrotask(() =>
            onModesChange?.({ categoryShape: nextCategoryShapeMode })
          );
        }
      }
    } else {
      symbolOpacity = 100;
      if (visualization?.modes?.categoryShape) {
        const nextCategoryShapeMode = coerceCategoryShapeMode(
          visualization.modes.categoryShape
        );
        categoryShapeMode = nextCategoryShapeMode;
        if (visualization.modes.categoryShape === CategoryShapeMode.ORDERED) {
          queueMicrotask(() =>
            onModesChange?.({ categoryShape: nextCategoryShapeMode })
          );
        }
      }
    }
    if (visualization?.missingData) {
      showMissingData = visualization.missingData.show ?? true;
      missingDataShape =
        visualization.missingData.shape ?? MissingDataShape.CIRCLE;
      missingDataSize = visualization.missingData.size ?? 2;
      missingDataColor =
        visualization.missingData.color ?? DEFAULT_COLORS.missingData;
    }

    categoryCount = resolveCategoryPreviewCount(
      symbolClassification,
      4,
      resolvedCategoryLabels
    );
  });

  function handleMissingDataShowChange(show: boolean) {
    showMissingData = show;
    onMissingDataChange?.({ show });
  }

  function handleMissingDataShapeChange(shape: MissingDataShape) {
    missingDataShape = shape;
    onMissingDataChange?.({ shape });
  }

  function handleMissingDataSizeChange(size: number) {
    missingDataSize = size;
    onMissingDataChange?.({ size });
  }

  function handleMissingDataColorChange(color: string) {
    missingDataColor = color;
    onMissingDataChange?.({ color });
  }

  function handleOpacityChange(value: number) {
    symbolOpacity = value;
    onSymbolsChange?.({ opacity: value / 100 });
  }

  const strokeDiscretizationLabel = $derived.by(() =>
    resolveDiscretizationLabel(
      visualization?.symbol?.strokeClassification
        ? { ...visualization.symbol.strokeClassification }
        : undefined
    )
  );

  function handleCategoriesCommonAspectChange(
    commonAspect: CategoriesCommonAspect,
    nextCategories: CategoryDraft[]
  ) {
    const symbolUpdates: Partial<
      NonNullable<Parameters<NonNullable<typeof onSymbolPrimitiveChange>>[0]>
    > = {};
    const useCategoryStrokeColors =
      !commonAspect.stroke || !commonAspect.autoColor;
    const useCategoryStrokeWidths =
      !commonAspect.stroke || commonAspect.strokeUnique === false;
    const useStroke =
      commonAspect.stroke || useCategoryStrokeColors || useCategoryStrokeWidths;

    if (commonAspect.sizeUnique) {
      symbolUpdates.size = commonAspect.size;
    }

    if (useStroke) {
      symbolUpdates.strokeMode = useCategoryStrokeColors
        ? StrokeMode.CATEGORIES
        : commonAspect.autoColor
          ? StrokeMode.UNIQUE
          : StrokeMode.CATEGORIES;
      if (commonAspect.autoColor) {
        symbolUpdates.strokeColor = AUTO_CATEGORY_STROKE_COLOR;
        symbolUpdates.strokeOpacity = AUTO_CATEGORY_STROKE_OPACITY;
      }
      symbolUpdates.strokeWidth = Math.max(1, commonAspect.strokeSize);
    } else {
      symbolUpdates.strokeMode = StrokeMode.NONE;
      symbolUpdates.strokeWidth = 0;
    }

    if (Object.keys(symbolUpdates).length > 0) {
      onSymbolPrimitiveChange?.(symbolUpdates);
    }

    if (useCategoryStrokeColors || useCategoryStrokeWidths) {
      onStrokeClassificationChange?.({
        colors: useCategoryStrokeColors
          ? nextCategories.map(
              (category) => category.strokeColor ?? AUTO_CATEGORY_STROKE_COLOR
            )
          : nextCategories.map(() => AUTO_CATEGORY_STROKE_COLOR),
        labels: nextCategories.map((category) => category.label),
        categoryValues: nextCategories.map(
          (category) => category.value ?? category.label
        ),
        disabledLabels: nextCategories
          .filter((category) => !category.enabled)
          .map((category) => category.value ?? category.label),
        categoryStrokeWidths: useCategoryStrokeWidths
          ? nextCategories.map(
              (category) =>
                category.customStrokeWidth ?? commonAspect.strokeSize
            )
          : undefined,
        paletteId: undefined,
        inverted: false,
        patternId: undefined,
        patternParams: undefined
      });
    } else {
      onStrokeClassificationChange?.(resetCategoryVisualClassification());
    }
  }

  async function handleFacetsVariablesChange(fieldIds: number[]) {
    await facetsSelection.updateVariables(
      categoryColumnName,
      FACET_SLOT.SYMBOL_CATEGORY,
      fieldIds
    );
  }

  async function handleFacetsToggle(enabled: boolean, fieldIds?: number[]) {
    await facetsSelection.toggle(
      categoryColumnName,
      FACET_SLOT.SYMBOL_CATEGORY,
      enabled,
      fieldIds
    );
  }
</script>

<div class="field-group">
  <span class="field-label">
    {m.aspect_according()}
    <InfoPopover text={m.category_variable_info()} />
  </span>
  <FacetsVariablePicker
    bind:open={categoryPickerOpen}
    dataFields={dataFields}
    singleSelectItems={selectableCategoryFields}
    selectedFieldId={categoryFieldSelection.selectedFieldId}
    selectedFieldIds={facetsSelection.getSelectedFieldIds(
      FACET_SLOT.SYMBOL_CATEGORY
    )}
    isCollectionEnabled={facetsSelection.isActiveForSlot(
      FACET_SLOT.SYMBOL_CATEGORY
    )}
    onSelect={categoryFieldSelection.handleSelect}
    onCollectionChange={handleFacetsVariablesChange}
    onToggleCollection={handleFacetsToggle}
  />
</div>

<div class="field-group">
  <span class="field-label">
    {m.category_shape_mode_label()}
    <InfoPopover text={m.category_shape_mode_info()} />
  </span>
  <SimpleRadioGroup
    name="cat-shape-mode"
    items={[
      {
        value: CategoryShapeMode.UNIQUE,
        labelText: m.category_shape_mode_unique()
      },
      {
        value: CategoryShapeMode.DIFFERENT,
        labelText: m.category_shape_mode_different()
      }
    ]}
    selected={categoryShapeMode}
    onchange={(value) => handleCategoryShapeModeChange(value)}
  />
</div>

{#if categoryShapeMode === CategoryShapeMode.UNIQUE}
  <div class="field-group">
    <span class="field-label">
      {m.shape()}
      <InfoPopover text={m.shape_info()} />
    </span>
    <Dropdown
      items={shapeDropdownItems}
      selectedId={shapeType}
      on:select={(e) => handleShapeDropdownSelect(e.detail.selectedId)}
      type="default"
    />
  </div>
{/if}

<div class="categories-aspect-row">
  <span class="field-label">{m.category_aspect()}</span>
  <div class="categories-aspect-value">
    <span>{m.categories_count({ count: categoryCount })}</span>
    <Button
      class="categories-aspect-settings"
      kind="ghost"
      size="small"
      icon={Settings}
      iconDescription={m.palette_categories_aspect_title()}
      aria-label={m.palette_categories_aspect_title()}
      on:click={(event: MouseEvent) => {
        event.stopPropagation();
        categoriesAspectOpen = true;
      }}
    />
  </div>
</div>
<PalettePreview
  label={m.color_palette()}
  colors={currentPalette}
  selectedPaletteId={visualization?.symbol?.classification?.paletteId ??
    visualization?.symbolClassification?.paletteId}
  inverted={visualization?.symbol?.classification?.inverted ??
    visualization?.symbolClassification?.inverted ??
    false}
  paletteType={PALETTE_TYPE.QUALITATIVE}
  categoriesMode={true}
  categoriesVariant={categoriesVariant}
  classification={visualization?.symbol?.classification ??
    visualization?.symbolClassification}
  categoryLabels={(
    visualization?.symbol?.classification ?? visualization?.symbolClassification
  )?.categoryValues ?? resolvedCategoryLabels}
  disabledCategoryLabels={visualization?.symbol?.classification
    ?.disabledLabels ??
    visualization?.symbolClassification?.disabledLabels ??
    []}
  categoriesCommonAspect={categoriesCommonAspect}
  showCategoriesCommonAspect={true}
  bind:categoriesPopoverOpen={categoriesAspectOpen}
  onClassificationChange={onClassificationChange}
  onCategoriesCommonAspectChange={handleCategoriesCommonAspectChange}
/>
<SliderWithInput
  label={m.opacity()}
  bind:value={symbolOpacity}
  min={SLIDER_LIMITS.opacity.min}
  max={SLIDER_LIMITS.opacity.max}
  step={SLIDER_LIMITS.opacity.step}
  onchange={handleOpacityChange}
/>

<MissingDataSection
  bind:show={showMissingData}
  color={missingDataColor}
  shape={missingDataShape}
  size={missingDataSize}
  sizeMin={SLIDER_LIMITS.missingDataSymbolSize.min}
  sizeMax={SLIDER_LIMITS.missingDataSymbolSize.max}
  sizeStep={SLIDER_LIMITS.missingDataSymbolSize.step}
  onshowchange={handleMissingDataShowChange}
  onshapechange={handleMissingDataShapeChange}
  onsizechange={handleMissingDataSizeChange}
  oncolorchange={handleMissingDataColorChange}
/>

<StrokeSection
  visualization={visualization}
  dataFields={dataFields}
  infoText={m.stroke_section_info()}
  showDashed={true}
  discretizationLabel={strokeDiscretizationLabel}
  onStyleChange={onStyleChange}
  onModesChange={onModesChange}
  onMappingChange={onMappingChange}
  onStrokeMappingChange={onStrokeMappingChange}
  onInvertPalette={onStrokeInvertPalette}
  onOpenDiscretization={() => {
    strokeDiscretizationModalOpen = true;
  }}
  onStrokeClassificationChange={onStrokeClassificationChange ?? (() => {})}
  strokeClassification={visualization?.symbol?.strokeClassification}
  strokeValueColumn={visualization?.symbol?.strokeValueColumn}
  strokeCategoryColumn={visualization?.symbol?.strokeCategoryColumn}
  showMissingData={showMissingData}
  missingDataColor={missingDataColor}
  facetsValueSlotPath={FACET_SLOT.SYMBOL_STROKE_VALUE}
  facetsCategorySlotPath={FACET_SLOT.SYMBOL_STROKE_CATEGORY}
  onMissingDataShowChange={handleMissingDataShowChange}
  onMissingDataColorChange={handleMissingDataColorChange}
/>

<DiscretizationModal
  bind:open={strokeDiscretizationModalOpen}
  visualization={visualization}
  classification={visualization?.symbol?.strokeClassification}
  valueColumn={visualization?.symbol?.strokeValueColumn}
  role="stroke"
  onchange={onStrokeClassificationChange ?? (() => {})}
/>

<style lang="scss">
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .field-label {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }

  .categories-aspect-row {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-03) 0;
    border-bottom: 1px solid var(--cds-border-subtle);
    gap: var(--cds-spacing-02);
  }

  .categories-aspect-value {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);

    span {
      font-size: 0.875rem;
      color: var(--cds-text-primary);
    }
  }

  :global(.categories-aspect-settings) {
    min-width: 32px;
    min-height: 32px;
    padding: 8px;
  }
</style>
