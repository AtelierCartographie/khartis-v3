<script lang="ts">
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import {
    getTextPrimitive,
    type ClassificationConfig,
    type VisualizationConfig,
    type VisualizationModes
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import {
    DEFAULT_COLORS,
    FillMode,
    SLIDER_LIMITS,
    VISUALIZATION_DEFAULTS
  } from '$lib/features/commons/constants/visualization.constants';
  import * as m from '$lib/paraglide/messages';
  import DiscretizationModal from '../discretization/discretization-modal.svelte';
  import { resolveDiscretizationLabel } from '../discretization/discretization.utils';
  import FillSection from '../shared/fill-section.svelte';
  import {
    ColorSelector,
    SectionHeading,
    SliderWithInput,
    StrokeSection,
    ToggleWithLabel
  } from '../shared';
  import { resetVisualClassification } from '../shared/classification-reset.utils';
  import { FILL_MODES_FOR_SYMBOLS } from '../shared/fill-mode-presets';
  import { FACET_SLOT } from '../../adapters/facets-adapter';
  import {
    NONE_FIELD_ID,
    useFieldSelectionHandler
  } from '../../hooks/use-field-selection.svelte';
  import { useCategoryLabels } from '../../hooks/use-category-labels.svelte';
  import { useFacetsVariableSelection } from '../../hooks/use-facets-variable-selection.svelte';
  import { coerceString, parseOpacityToSlider } from '../../utils/coerce.utils';

  interface Props {
    visualization?: VisualizationConfig;
    dataFields?: Array<{ id: number; text: string; type?: string }>;
    color: string;
    opacity: number;
    halo: boolean;
    haloColor: string;
    haloWidth: number;
    onColorChange: (value: string) => void;
    onOpacityChange: (value: number) => void;
    onHaloToggle: (value: boolean) => void;
    onHaloColorChange: (value: string) => void;
    onHaloWidthChange: (value: number) => void;
    onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
    onModesChange?: (updates: Partial<VisualizationModes>) => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
    onStrokeClassificationChange?: (
      updates: Partial<ClassificationConfig>
    ) => void;
    onMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
    onStrokeMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
    onInvertPalette?: () => void;
    onStrokeInvertPalette?: () => void;
  }

  let {
    visualization,
    dataFields = [],
    color,
    opacity,
    halo,
    haloColor,
    haloWidth,
    onColorChange,
    onOpacityChange,
    onHaloToggle,
    onHaloColorChange,
    onHaloWidthChange,
    onStyleChange,
    onModesChange,
    onClassificationChange,
    onStrokeClassificationChange,
    onMappingChange,
    onStrokeMappingChange,
    onInvertPalette,
    onStrokeInvertPalette
  }: Props = $props();

  const TEXT_BACKGROUND_FILL_MODES = FILL_MODES_FOR_SYMBOLS;

  let discretizationModalOpen = $state(false);
  let discretizationTarget = $state<'fill' | 'stroke'>('fill');
  let fillMode = $state<FillMode>(FillMode.NONE);
  let fillColor = $state<string>(DEFAULT_COLORS.fill);
  let fillOpacity = $state<number>(VISUALIZATION_DEFAULTS.fillOpacity);

  const textBackground = $derived(getTextPrimitive(visualization)?.background);
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);
  const valueFieldSelection = useFieldSelectionHandler({
    getDataFields: () => dataFields,
    columnKey: 'valueColumn',
    onMappingChange: (updates) => onMappingChange?.(updates)
  });
  const categoryFieldSelection = useFieldSelectionHandler({
    getDataFields: () => dataFields,
    columnKey: 'categoryColumn',
    onMappingChange: (updates) => onMappingChange?.(updates)
  });
  const facetsSelection = useFacetsVariableSelection({
    getVisualizationId: () => visualization?.id,
    getDataFields: () => dataFields
  });
  const dataset = $derived(
    visualization
      ? (datasetsStore.datasets.find((d) => d.id === visualization.datasetId) ??
          datasetsStore.selectedDataset)
      : datasetsStore.selectedDataset
  );
  const categoryColumnName = $derived(
    categoryFieldSelection.selectedFieldName ?? ''
  );
  const categoryLabels = useCategoryLabels({
    enabled: () => fillMode === FillMode.CATEGORIES,
    getDataset: () => dataset,
    getColumnName: () =>
      textBackground?.categoryColumn ??
      visualization?.mapping.categoryColumn ??
      categoryColumnName,
    getClassification: () => visualization?.classification,
    fallbackCount: 4
  });
  const categoryCount = $derived(categoryLabels.count);

  $effect(() => {
    const background = textBackground;
    fillMode =
      background?.fillMode ?? visualization?.modes?.fill ?? FillMode.NONE;
    fillColor =
      coerceString(background?.fillColor) ??
      coerceString(visualization?.style.fillColor) ??
      DEFAULT_COLORS.fill;
    fillOpacity = parseOpacityToSlider(
      background?.fillOpacity ?? visualization?.style.fillOpacity,
      VISUALIZATION_DEFAULTS.fillOpacity
    );
    valueFieldSelection.sync(
      background?.valueColumn ?? visualization?.mapping.valueColumn
    );
    categoryFieldSelection.sync(
      background?.categoryColumn ?? visualization?.mapping.categoryColumn
    );
  });

  const discretizationLabel = $derived.by(() =>
    resolveDiscretizationLabel(
      visualization?.classification
        ? { ...visualization.classification }
        : undefined
    )
  );
  const strokeDiscretizationLabel = $derived.by(() =>
    resolveDiscretizationLabel(
      textBackground?.strokeClassification
        ? { ...textBackground.strokeClassification }
        : undefined
    )
  );
  const activeDiscretizationClassification = $derived.by(() =>
    discretizationTarget === 'stroke'
      ? textBackground?.strokeClassification
      : visualization?.classification
  );
  const activeDiscretizationValueColumn = $derived.by(() =>
    discretizationTarget === 'stroke'
      ? textBackground?.strokeValueColumn
      : textBackground?.valueColumn
  );
  const discretizationOnchange = $derived(
    discretizationTarget === 'stroke'
      ? (onStrokeClassificationChange ?? (() => {}))
      : (onClassificationChange ?? (() => {}))
  );

  function handleFillModeChange(mode: FillMode) {
    const previousFillMode = fillMode;
    fillMode = mode;

    if (mode === FillMode.NONE) {
      onModesChange?.({ fill: mode });
      onClassificationChange?.(resetVisualClassification());
      return;
    }

    const currentOpacity = textBackground?.fillOpacity ?? 0;
    const updates: Partial<VisualizationConfig['style']> = {};

    if (textBackground?.fillColor === undefined) {
      updates.fillColor = fillColor;
    }
    if (currentOpacity <= 0) {
      fillOpacity = VISUALIZATION_DEFAULTS.fillOpacity;
      updates.fillOpacity = VISUALIZATION_DEFAULTS.fillOpacity / 100;
    }
    if (mode === FillMode.CLASSES && previousFillMode !== FillMode.CLASSES) {
      fillOpacity = VISUALIZATION_DEFAULTS.fillOpacity;
      updates.fillOpacity = VISUALIZATION_DEFAULTS.fillOpacity / 100;
    }

    if (Object.keys(updates).length > 0) {
      onStyleChange?.(updates);
    }
    onModesChange?.({ fill: mode });
  }

  function handleFillColorChange(value: string) {
    fillColor = value;
    const updates: Partial<VisualizationConfig['style']> = { fillColor: value };
    if ((textBackground?.fillOpacity ?? 0) <= 0) {
      fillOpacity = VISUALIZATION_DEFAULTS.fillOpacity;
      updates.fillOpacity = VISUALIZATION_DEFAULTS.fillOpacity / 100;
    }
    onStyleChange?.(updates);
  }

  function handleFillOpacityChange(value: number) {
    fillOpacity = value;
    onStyleChange?.({ fillOpacity: value / 100 });
  }

  function handleOpenFillDiscretization() {
    discretizationTarget = 'fill';
    discretizationModalOpen = true;
  }

  function handleOpenStrokeDiscretization() {
    discretizationTarget = 'stroke';
    discretizationModalOpen = true;
  }
</script>

<div class="text-background-section">
  <SectionHeading title={m.text_style_primary_title()} />

  <div class="field-group">
    <ColorSelector
      exclusive
      label={m.color()}
      value={color}
      onchange={onColorChange}
    />
  </div>

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

  <SectionHeading title={m.background()} />

  <FillSection
    visualization={visualization}
    dataFields={dataFields}
    availableModes={TEXT_BACKGROUND_FILL_MODES}
    fillMode={fillMode}
    fillColor={fillColor}
    fillOpacity={fillOpacity}
    selectedValueFieldId={valueFieldSelection.selectedFieldId}
    selectedCategoryFieldId={categoryFieldSelection.selectedFieldId}
    discretizationLabel={discretizationLabel}
    categoryCount={categoryCount}
    facetsValueSlotPath={FACET_SLOT.TEXT_BACKGROUND_VALUE}
    facetsCategorySlotPath={FACET_SLOT.TEXT_BACKGROUND_CATEGORY}
    categoriesVariant="texts"
    sectionTitle={m.fill()}
    showMissingDataSection={false}
    selectableDataFields={selectableDataFields}
    getFacetsSelectedFieldIds={facetsSelection.getSelectedFieldIds}
    isFacetsActiveForSlot={facetsSelection.isActiveForSlot}
    onFillModeChange={handleFillModeChange}
    onFillColorChange={handleFillColorChange}
    onFillOpacityChange={handleFillOpacityChange}
    onValueFieldSelect={valueFieldSelection.handleSelect}
    onCategoryFieldSelect={categoryFieldSelection.handleSelect}
    onFacetsVariablesChange={facetsSelection.updateVariables}
    onFacetsToggle={facetsSelection.toggle}
    onOpenDiscretization={handleOpenFillDiscretization}
    onClassificationChange={onClassificationChange ?? (() => {})}
    onInvertPalette={onInvertPalette}
  />

  <StrokeSection
    visualization={visualization}
    dataFields={dataFields}
    discretizationLabel={strokeDiscretizationLabel}
    onStyleChange={onStyleChange}
    onModesChange={onModesChange}
    onMappingChange={onMappingChange}
    onStrokeMappingChange={onStrokeMappingChange}
    onInvertPalette={onStrokeInvertPalette}
    onOpenDiscretization={handleOpenStrokeDiscretization}
    onStrokeClassificationChange={onStrokeClassificationChange ?? (() => {})}
    strokeClassification={textBackground?.strokeClassification}
    strokeValueColumn={textBackground?.strokeValueColumn}
    strokeCategoryColumn={textBackground?.strokeCategoryColumn}
    showMissingDataSection={false}
    facetsValueSlotPath={FACET_SLOT.TEXT_BACKGROUND_STROKE_VALUE}
    facetsCategorySlotPath={FACET_SLOT.TEXT_BACKGROUND_STROKE_CATEGORY}
  />
</div>

<DiscretizationModal
  bind:open={discretizationModalOpen}
  visualization={visualization}
  classification={activeDiscretizationClassification}
  valueColumn={activeDiscretizationValueColumn}
  role={discretizationTarget}
  onchange={discretizationOnchange}
/>

<style lang="scss">
  .text-background-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }
</style>
