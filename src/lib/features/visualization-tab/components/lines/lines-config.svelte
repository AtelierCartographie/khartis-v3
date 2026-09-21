<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { SliderWithInput, VizFilterButton, VizFilterPanel } from '../shared';
  import LineThicknessSection from './line-thickness-section.svelte';
  import LineColorSection from './line-color-section.svelte';
  import type {
    MissingDataConfig,
    VisualizationConfig,
    VisualizationModes,
    VizDataFilter
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import {
    ALL_PRIMITIVE_FILTERS,
    PrimitiveFilterType
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    DEFAULT_SEQUENTIAL_PREVIEW,
    DEFAULT_QUALITATIVE_PREVIEW
  } from '$lib/features/commons/components/palette-popover/palette.constants';
  import {
    BasemapDottedPattern,
    ColorMode,
    DEFAULT_COLORS,
    ThicknessMode,
    SLIDER_LIMITS,
    VISUALIZATION_DEFAULTS
  } from '$lib/features/commons/constants/visualization.constants';
  import DiscretizationModal from '../discretization/discretization-modal.svelte';
  import type { ClassificationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
  import { resolveDiscretizationLabel } from '../discretization/discretization.utils';
  import {
    NONE_FIELD_ID,
    useFieldSelectionHandler
  } from '../../hooks/use-field-selection.svelte';
  import { useCategoryLabels } from '../../hooks/use-category-labels.svelte';
  import { useFacetsVariableSelection } from '../../hooks/use-facets-variable-selection.svelte';
  import { coerceString, parseOpacityToSlider } from '../../utils/coerce.utils';
  import { coerceDashedPattern } from '../shared/dashed-pattern.utils';

  interface Props {
    dataFields?: Array<{ id: number; text: string; type?: string }>;
    visualization?: VisualizationConfig;
    disabled?: boolean;
    onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
    onModesChange?: (updates: Partial<VisualizationModes>) => void;
    onMissingDataChange?: (updates: Partial<MissingDataConfig>) => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
    onThicknessClassificationChange?: (
      updates: Partial<ClassificationConfig>
    ) => void;
    onMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
    onInvertPalette?: () => void;
    onToggleVisibility?: (checked: boolean) => void;
    filters?: VizDataFilter[];
    onAddFilter?: (filter: Omit<VizDataFilter, 'id'>) => void;
    onUpdateFilter?: (
      filterId: string,
      updates: Partial<Omit<VizDataFilter, 'id'>>
    ) => void;
    onRemoveFilter?: (filterId: string) => void;
    onClearFilters?: () => void;
  }

  let {
    dataFields = [],
    visualization,
    disabled = false,
    onStyleChange,
    onModesChange,
    onMissingDataChange,
    onClassificationChange,
    onThicknessClassificationChange,
    onMappingChange,
    onInvertPalette,
    onToggleVisibility,
    filters = [],
    onAddFilter,
    onUpdateFilter,
    onRemoveFilter,
    onClearFilters
  }: Props = $props();

  let discretizationModalOpen = $state(false);
  let discretizationTarget = $state<'color' | 'thickness'>('color');
  let filterSectionVisible = $state(false);
  let thicknessPickerOpen = $state(false);
  let colorPickerOpen = $state(false);
  let categoryPickerOpen = $state(false);
  let colorCategoriesPopoverOpen = $state(false);
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);
  const valueFieldSelection = useFieldSelectionHandler({
    getDataFields: () => dataFields,
    columnKey: 'valueColumn',
    onMappingChange: (updates) => onMappingChange?.(updates)
  });
  const sizeFieldSelection = useFieldSelectionHandler({
    getDataFields: () => dataFields,
    columnKey: 'sizeColumn',
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

  $effect(() => {
    valueFieldSelection.sync(visualization?.mapping.valueColumn);
    sizeFieldSelection.sync(visualization?.mapping.sizeColumn);
    categoryFieldSelection.sync(visualization?.mapping.categoryColumn);
  });

  const lineColorClassification = $derived.by(
    () =>
      visualization?.line?.classification ??
      visualization?.lineClassification ??
      visualization?.classification
  );
  const lineThicknessClassification = $derived.by(
    () =>
      visualization?.line?.thicknessClassification ??
      visualization?.lineThicknessClassification
  );
  const currentPalette = $derived(
    lineColorClassification?.colors ?? DEFAULT_SEQUENTIAL_PREVIEW
  );
  const categoriesPalette = $derived(
    lineColorClassification?.colors ?? DEFAULT_QUALITATIVE_PREVIEW
  );
  const dataset = $derived(
    visualization
      ? (datasetsStore.datasets.find((d) => d.id === visualization.datasetId) ??
          datasetsStore.selectedDataset)
      : datasetsStore.selectedDataset
  );
  const categoryLabels = useCategoryLabels({
    enabled: () => colorMode === ColorMode.CATEGORIES,
    getDataset: () => dataset,
    getColumnName: () => currentCategoryColumnName,
    getClassification: () => lineColorClassification,
    fallbackCount: 4
  });
  const categoryCount = $derived(categoryLabels.count);

  let thicknessMode = $state<ThicknessMode>(ThicknessMode.UNIQUE);
  let colorMode = $state<ColorMode>(ColorMode.UNIQUE);
  let thickness = $state<number>(VISUALIZATION_DEFAULTS.lineWidth);
  let maxThickness = $state<number>(VISUALIZATION_DEFAULTS.lineMaxWidth);
  let color = $state<string>(DEFAULT_COLORS.line);
  let opacity = $state<number>(VISUALIZATION_DEFAULTS.lineOpacity);
  const enabled = $derived.by(() => {
    const primitiveFilters =
      visualization?.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;
    return primitiveFilters.includes(PrimitiveFilterType.LINE);
  });
  let dashed = $state<boolean>(false);
  let dashedPattern = $state<BasemapDottedPattern>(BasemapDottedPattern.DOTS);
  let showMissingData = $state<boolean>(true);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);
  let missingDataSize = $state<number>(2);
  let missingDataDashed = $state<boolean>(false);
  let missingDataDashedPattern = $state<BasemapDottedPattern>(
    BasemapDottedPattern.DOTS
  );
  const categoryColumnName = $derived(
    categoryFieldSelection.selectedFieldName ?? ''
  );
  const currentCategoryColumnName = $derived(
    visualization?.mapping.categoryColumn ?? categoryColumnName
  );

  $effect(() => {
    if (visualization?.style) {
      thickness =
        visualization.style.lineWidth ?? VISUALIZATION_DEFAULTS.lineWidth;
      maxThickness =
        visualization.style.lineMaxWidth ?? VISUALIZATION_DEFAULTS.lineMaxWidth;
      opacity = parseOpacityToSlider(
        visualization.style.lineOpacity,
        VISUALIZATION_DEFAULTS.lineOpacity
      );
      color =
        coerceString(visualization.style.lineColor) ?? DEFAULT_COLORS.line;
      dashed = visualization.style.lineDashed ?? false;
      dashedPattern =
        visualization.line?.dashedPattern ??
        visualization.style.lineDashedPattern ??
        BasemapDottedPattern.DOTS;
    }
    if (visualization?.modes) {
      thicknessMode = visualization.modes.thickness ?? ThicknessMode.UNIQUE;
      colorMode = visualization.modes.color ?? ColorMode.UNIQUE;
    }
    const missingData =
      visualization?.line?.missingData ?? visualization?.missingData;
    if (missingData) {
      showMissingData = missingData.show ?? true;
      missingDataColor = missingData.color ?? DEFAULT_COLORS.missingData;
      missingDataSize = missingData.size ?? 2;
      missingDataDashed = missingData.dashed ?? false;
      missingDataDashedPattern =
        missingData.dashedPattern ?? BasemapDottedPattern.DOTS;
    }
  });

  function handleThicknessModeChange(index: number) {
    const modes = [
      ThicknessMode.UNIQUE,
      ThicknessMode.PROPORTIONAL,
      ThicknessMode.CLASSES
    ];
    const next = modes[index] || ThicknessMode.UNIQUE;
    if (next === thicknessMode) return;
    thicknessMode = next;
    onModesChange?.({ thickness: thicknessMode });
  }

  function handleColorModeChange(index: number) {
    const modes = [ColorMode.UNIQUE, ColorMode.CLASSES, ColorMode.CATEGORIES];
    const nextMode = modes[index] || ColorMode.UNIQUE;
    if (nextMode === colorMode) return;
    colorMode = nextMode;
    onModesChange?.({ color: colorMode });
  }

  function handleThicknessChange(value: number) {
    thickness = value;
    onStyleChange?.({ lineWidth: value });
  }

  function handleMaxThicknessChange(value: number) {
    maxThickness = value;
    onStyleChange?.({ lineMaxWidth: value });
  }

  function handleColorChange(value: string) {
    color = value;
    onStyleChange?.({ lineColor: value });
  }

  function handleOpacityChange(value: number) {
    opacity = value;
    onStyleChange?.({ lineOpacity: value / 100 });
  }

  function handleDashedChange(value: boolean) {
    dashed = value;
    onStyleChange?.({
      lineDashed: value,
      ...(value ? { lineDashedPattern: dashedPattern } : {})
    });
  }

  function handleDashedPatternChange(value: BasemapDottedPattern) {
    const next = coerceDashedPattern(value);
    dashedPattern = next;
    onStyleChange?.({ lineDashedPattern: next });
  }

  function handleToggleChange(checked: boolean) {
    onToggleVisibility?.(checked);
  }

  function handleMissingDataToggle(checked: boolean) {
    showMissingData = checked;
    onMissingDataChange?.({ show: checked });
  }

  function handleMissingDataColorChange(value: string) {
    missingDataColor = value;
    onMissingDataChange?.({ color: value });
  }

  function handleMissingDataSizeChange(value: number) {
    missingDataSize = value;
    onMissingDataChange?.({ size: value });
  }

  function handleMissingDataDashedChange(value: boolean) {
    missingDataDashed = value;
    onMissingDataChange?.({
      dashed: value,
      ...(value ? { dashedPattern: missingDataDashedPattern } : {})
    });
  }

  function handleMissingDataDashedPatternChange(value: BasemapDottedPattern) {
    const next = coerceDashedPattern(value);
    missingDataDashedPattern = next;
    onMissingDataChange?.({ dashedPattern: next });
  }

  function handleOpenColorDiscretization() {
    discretizationTarget = 'color';
    discretizationModalOpen = true;
  }

  function handleOpenThicknessDiscretization() {
    discretizationTarget = 'thickness';
    discretizationModalOpen = true;
  }

  function handleColorClassificationChange(
    classification: Partial<ClassificationConfig>
  ) {
    onClassificationChange?.(classification);
  }

  function handleThicknessClassificationChange(
    classification: Partial<ClassificationConfig>
  ) {
    onThicknessClassificationChange?.(classification);
  }

  const colorDiscretizationLabel = $derived.by(() =>
    resolveDiscretizationLabel(
      lineColorClassification ? { ...lineColorClassification } : undefined
    )
  );

  const thicknessDiscretizationLabel = $derived.by(() =>
    resolveDiscretizationLabel(
      lineThicknessClassification
        ? { ...lineThicknessClassification }
        : undefined
    )
  );

  const valueColumnName = $derived(valueFieldSelection.selectedFieldName ?? '');

  const sizeColumnName = $derived(sizeFieldSelection.selectedFieldName ?? '');
</script>

<ExpandableSection
  title={m.lines_title()}
  description={disabled ? m.primitive_unavailable() : undefined}
  defaultOpen={false}
  showToggle
  toggleVariant="suggestions"
  actionsEnd
  toggleChecked={enabled}
  disabled={disabled}
  disabledReason={disabled ? m.primitive_unavailable_reason() : undefined}
  onToggleChange={handleToggleChange}
>
  {#snippet icon()}
    <VizFilterButton
      active={filterSectionVisible || filters.length > 0}
      count={filters.length}
      onToggle={() => {
        filterSectionVisible = !filterSectionVisible;
      }}
    />
  {/snippet}

  <div class="lines-config">
    <LineThicknessSection
      thicknessMode={thicknessMode}
      thickness={thickness}
      maxThickness={maxThickness}
      dashed={dashed}
      dashedPattern={dashedPattern}
      showMissingData={showMissingData}
      missingDataColor={missingDataColor}
      missingDataDashed={missingDataDashed}
      missingDataDashedPattern={missingDataDashedPattern}
      thicknessDiscretizationLabel={thicknessDiscretizationLabel}
      valueColumnName={valueColumnName}
      sizeColumnName={sizeColumnName}
      bind:pickerOpen={thicknessPickerOpen}
      dataFields={dataFields}
      selectableDataFields={selectableDataFields}
      valueFieldSelection={valueFieldSelection}
      sizeFieldSelection={sizeFieldSelection}
      facetsSelection={facetsSelection}
      onThicknessModeChange={handleThicknessModeChange}
      onThicknessChange={handleThicknessChange}
      onMaxThicknessChange={handleMaxThicknessChange}
      onDashedChange={handleDashedChange}
      onDashedPatternChange={handleDashedPatternChange}
      onMissingDataShowChange={handleMissingDataToggle}
      onMissingDataColorChange={handleMissingDataColorChange}
      onMissingDataDashedChange={handleMissingDataDashedChange}
      onMissingDataDashedPatternChange={handleMissingDataDashedPatternChange}
      onOpenThicknessDiscretization={handleOpenThicknessDiscretization}
    />

    <LineColorSection
      colorMode={colorMode}
      color={color}
      dashed={dashed}
      dashedPattern={dashedPattern}
      showMissingData={showMissingData}
      missingDataColor={missingDataColor}
      missingDataSize={missingDataSize}
      missingDataDashed={missingDataDashed}
      missingDataDashedPattern={missingDataDashedPattern}
      valueColumnName={valueColumnName}
      categoryColumnName={categoryColumnName}
      colorDiscretizationLabel={colorDiscretizationLabel}
      classification={lineColorClassification}
      palette={currentPalette}
      categoriesPalette={categoriesPalette}
      categoryLabels={categoryLabels.labels}
      categoryCount={categoryCount}
      bind:colorPickerOpen={colorPickerOpen}
      bind:categoryPickerOpen={categoryPickerOpen}
      bind:categoriesPopoverOpen={colorCategoriesPopoverOpen}
      dataFields={dataFields}
      selectableDataFields={selectableDataFields}
      valueFieldSelection={valueFieldSelection}
      categoryFieldSelection={categoryFieldSelection}
      facetsSelection={facetsSelection}
      onColorModeChange={handleColorModeChange}
      onColorChange={handleColorChange}
      onDashedChange={handleDashedChange}
      onDashedPatternChange={handleDashedPatternChange}
      onMissingDataShowChange={handleMissingDataToggle}
      onMissingDataColorChange={handleMissingDataColorChange}
      onMissingDataSizeChange={handleMissingDataSizeChange}
      onMissingDataDashedChange={handleMissingDataDashedChange}
      onMissingDataDashedPatternChange={handleMissingDataDashedPatternChange}
      onOpenColorDiscretization={handleOpenColorDiscretization}
      onClassificationChange={handleColorClassificationChange}
      onInvertPalette={onInvertPalette}
    />

    <SliderWithInput
      label={m.opacity()}
      min={SLIDER_LIMITS.lineOpacity.min}
      max={SLIDER_LIMITS.lineOpacity.max}
      step={SLIDER_LIMITS.lineOpacity.step}
      value={opacity}
      showMinMax
      inputWidth="128px"
      onchange={handleOpacityChange}
    />
  </div>
</ExpandableSection>

{#if filterSectionVisible}
  <VizFilterPanel
    title={m.lines_title()}
    dataFields={dataFields}
    filters={filters}
    onAddFilter={onAddFilter ?? (() => {})}
    onUpdateFilter={onUpdateFilter}
    onRemoveFilter={onRemoveFilter ?? (() => {})}
    onClearFilters={onClearFilters}
    onClose={() => {
      filterSectionVisible = false;
    }}
  />
{/if}

<DiscretizationModal
  bind:open={discretizationModalOpen}
  visualization={visualization}
  classification={discretizationTarget === 'thickness'
    ? lineThicknessClassification
    : lineColorClassification}
  valueColumn={visualization?.mapping.valueColumn}
  role={discretizationTarget === 'thickness' ? 'size' : 'fill'}
  showBreakpointControls={discretizationTarget === 'color'}
  onchange={discretizationTarget === 'thickness'
    ? handleThicknessClassificationChange
    : handleColorClassificationChange}
/>

<style lang="scss">
  .lines-config {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-param);
    padding: var(--cds-spacing-03);
  }

  :global(.field-group) {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-label);
  }
</style>
