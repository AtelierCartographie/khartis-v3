<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import type {
    MissingDataConfig,
    VisualizationConfig,
    VisualizationModes
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import {
    ALL_PRIMITIVE_FILTERS,
    PrimitiveFilterType
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    DEFAULT_COLORS,
    FillMode,
    type DensityConfig,
    VISUALIZATION_DEFAULTS
  } from '$lib/features/commons/constants/visualization.constants';
  import { FILL_MODES_WITH_DENSITY } from '../shared/fill-mode-presets';
  import FillSection from '../shared/fill-section.svelte';
  import { StrokeSection, VizFilterButton, VizFilterPanel } from '../shared';
  import type { VizDataFilter } from '$lib/features/commons/stores/visualization.store.svelte';
  import type { FilterStats } from '$lib/features/duckdb';
  import DiscretizationModal from '../discretization/discretization-modal.svelte';
  import type { ClassificationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
  import { resolveDiscretizationLabel } from '../discretization/discretization.utils';
  import { FACET_SLOT } from '../../adapters/facets-adapter';
  import { PolygonModeDensity } from '.';
  import {
    NONE_FIELD_ID,
    useFieldSelectionHandler
  } from '../../hooks/use-field-selection.svelte';
  import { useCategoryLabels } from '../../hooks/use-category-labels.svelte';
  import { useFacetsVariableSelection } from '../../hooks/use-facets-variable-selection.svelte';
  import { resetVisualClassification } from '../shared/classification-reset.utils';
  import { coerceString, parseOpacityToSlider } from '../../utils/coerce.utils';
  import { mapPatternTypeToPatternId } from '$lib/features/commons/components/palette-popover/palette.constants';
  import { patternPaletteFromLegacy } from '$lib/features/commons/services/pattern-palette.service';
  import type { PatternPaletteConfig } from '$lib/features/commons/constants/pattern.constants';

  const DEFAULT_MISSING_DATA_PATTERN_CONFIG: PatternPaletteConfig = {
    shape: 'line',
    angle: 45,
    scale: 0.7,
    color: '#000000'
  };

  interface Props {
    dataFields?: Array<{ id: number; text: string; type?: string }>;
    visualization?: VisualizationConfig;
    disabled?: boolean;
    onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
    onModesChange?: (updates: Partial<VisualizationModes>) => void;
    onDensityChange?: (updates: Partial<DensityConfig>) => void;
    onMissingDataChange?: (updates: Partial<MissingDataConfig>) => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
    onStrokeClassificationChange?: (
      updates: Partial<ClassificationConfig>
    ) => void;
    onStrokeMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
    onMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
    onInvertPalette?: () => void;
    onStrokeInvertPalette?: () => void;
    onToggleVisibility?: (checked: boolean) => void;
    filters?: VizDataFilter[];
    filterStats?: FilterStats;
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
    onDensityChange,
    onMissingDataChange,
    onClassificationChange,
    onStrokeClassificationChange,
    onStrokeMappingChange,
    onMappingChange,
    onInvertPalette,
    onStrokeInvertPalette,
    onToggleVisibility,
    filters = [],
    filterStats,
    onAddFilter,
    onUpdateFilter,
    onRemoveFilter,
    onClearFilters
  }: Props = $props();

  let discretizationModalOpen = $state(false);
  let discretizationTarget = $state<'fill' | 'stroke'>('fill');
  let filterSectionVisible = $state(false);
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

  $effect(() => {
    valueFieldSelection.sync(visualization?.mapping.valueColumn);
    categoryFieldSelection.sync(visualization?.mapping.categoryColumn);
  });

  const categoryColumnName = $derived(
    categoryFieldSelection.selectedFieldName ?? ''
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
    getColumnName: () =>
      visualization?.mapping.categoryColumn ?? categoryColumnName,
    getClassification: () => visualization?.classification,
    fallbackCount: 4
  });
  const categoryCount = $derived(categoryLabels.count);

  let fillMode = $state<FillMode>(FillMode.UNIQUE);
  let fillColor = $state<string>(DEFAULT_COLORS.fill);
  let fillOpacity = $state<number>(VISUALIZATION_DEFAULTS.fillOpacity);
  let showMissingData = $state<boolean>(true);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);
  let missingDataPattern = $state<boolean>(false);
  let missingDataPatternConfig = $state<PatternPaletteConfig>(
    DEFAULT_MISSING_DATA_PATTERN_CONFIG
  );
  const enabled = $derived.by(() => {
    const primitiveFilters =
      visualization?.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;
    return primitiveFilters.includes(PrimitiveFilterType.POLYGON);
  });

  $effect(() => {
    const polygonConfig = visualization?.polygon;
    const fillOp =
      polygonConfig?.fillOpacity ?? visualization?.style.fillOpacity;
    fillOpacity = parseOpacityToSlider(
      fillOp,
      VISUALIZATION_DEFAULTS.fillOpacity
    );
    fillColor =
      coerceString(polygonConfig?.fillColor) ??
      coerceString(visualization?.style.fillColor) ??
      DEFAULT_COLORS.fill;
    fillMode =
      polygonConfig?.fillMode ?? visualization?.modes?.fill ?? FillMode.UNIQUE;
    const missingData =
      polygonConfig?.missingData ?? visualization?.missingData;
    if (missingData) {
      showMissingData = missingData.show ?? true;
      missingDataColor = missingData.color ?? DEFAULT_COLORS.missingData;
      missingDataPattern = missingData.pattern ?? false;
      missingDataPatternConfig =
        missingData.patternConfig ??
        patternPaletteFromLegacy(
          missingData.patternId ??
            mapPatternTypeToPatternId(missingData.patternType, 'diagonal'),
          missingData.patternParams
        ) ??
        DEFAULT_MISSING_DATA_PATTERN_CONFIG;
    }
  });

  const FILL_MODE_ORDER = FILL_MODES_WITH_DENSITY;
  const POLYGON_STROKE_WIDTH_MAX = 10;
  const POLYGON_CLASSES_FILL_OPACITY = VISUALIZATION_DEFAULTS.fillOpacity / 100;

  function handleFillModeChange(index: number) {
    const nextFillMode = FILL_MODE_ORDER[index] || FillMode.NONE;
    const previousFillMode = fillMode;
    fillMode = nextFillMode;

    if (nextFillMode === FillMode.NONE) {
      fillColor = DEFAULT_COLORS.fill;
      onStyleChange?.({
        fillOpacity: 0,
        fillColor: DEFAULT_COLORS.fill
      });
      handleClassificationChange(resetVisualClassification());
    } else {
      const currentOpacity =
        visualization?.polygon?.fillOpacity ??
        visualization?.style.fillOpacity ??
        1;
      const updates: Partial<VisualizationConfig['style']> = {};
      if (
        visualization?.polygon?.fillColor === undefined &&
        visualization?.style.fillColor === undefined
      ) {
        updates.fillColor = fillColor;
      }
      if (currentOpacity <= 0) {
        updates.fillOpacity = VISUALIZATION_DEFAULTS.fillOpacity / 100;
      }
      if (
        nextFillMode === FillMode.CLASSES &&
        previousFillMode !== FillMode.CLASSES
      ) {
        updates.fillOpacity = POLYGON_CLASSES_FILL_OPACITY;
      }
      if (Object.keys(updates).length > 0) {
        onStyleChange?.(updates);
      }
    }
    onModesChange?.({ fill: nextFillMode });
  }

  function handleFillColorChange(value: string) {
    fillColor = value;
    const updates: Partial<VisualizationConfig['style']> = { fillColor: value };
    const currentOpacity =
      visualization?.polygon?.fillOpacity ??
      visualization?.style.fillOpacity ??
      1;
    if (currentOpacity <= 0) {
      updates.fillOpacity = VISUALIZATION_DEFAULTS.fillOpacity / 100;
      fillOpacity = VISUALIZATION_DEFAULTS.fillOpacity;
    }
    onStyleChange?.(updates);
  }

  const effectiveFillMode = $derived.by(() => {
    const storedMode = fillMode;
    const opacity =
      visualization?.polygon?.fillOpacity ??
      visualization?.style.fillOpacity ??
      1;
    if (opacity <= 0) return FillMode.NONE;
    return storedMode;
  });

  const strokeReferenceFill = $derived(
    effectiveFillMode === FillMode.UNIQUE
      ? fillColor
      : (visualization?.classification?.colors ?? fillColor)
  );

  function handleFillOpacityChange(value: number) {
    fillOpacity = value;
    onStyleChange?.({ fillOpacity: value / 100 });
  }

  function handleToggleChange(checked: boolean) {
    onToggleVisibility?.(checked);
  }

  function handleMissingDataShowChange(value: boolean) {
    showMissingData = value;
    onMissingDataChange?.({ show: value });
  }

  function handleMissingDataColorChange(value: string) {
    missingDataColor = value;
    onMissingDataChange?.({ color: value });
  }

  function handleMissingDataPatternChange(value: boolean) {
    missingDataPattern = value;
    onMissingDataChange?.({ pattern: value });
  }

  function handleMissingDataPatternStyleChange(config: PatternPaletteConfig) {
    missingDataPatternConfig = config;
    onMissingDataChange?.({ patternConfig: config });
  }

  function handleOpenDiscretization() {
    discretizationTarget = 'fill';
    discretizationModalOpen = true;
  }

  function handleOpenStrokeDiscretization() {
    discretizationTarget = 'stroke';
    discretizationModalOpen = true;
  }

  function handleClassificationChange(
    classification: Partial<ClassificationConfig>
  ) {
    onClassificationChange?.(classification);
  }

  function handleStrokeDiscretizationChange(
    classification: Partial<ClassificationConfig>
  ) {
    onStrokeClassificationChange?.(classification);
  }

  const activeDiscretizationClassification = $derived.by(() =>
    discretizationTarget === 'stroke'
      ? visualization?.polygon?.strokeClassification
      : visualization?.classification
  );
  const activeDiscretizationValueColumn = $derived.by(() =>
    discretizationTarget === 'stroke'
      ? visualization?.polygon?.strokeValueColumn
      : (visualization?.polygon?.valueColumn ??
        visualization?.mapping.valueColumn)
  );

  const discretizationOnchange = $derived(
    discretizationTarget === 'stroke'
      ? handleStrokeDiscretizationChange
      : handleClassificationChange
  );

  const discretizationLabel = $derived.by(() =>
    resolveDiscretizationLabel(
      visualization?.classification
        ? { ...visualization.classification }
        : undefined
    )
  );

  const strokeDiscretizationLabel = $derived.by(() =>
    resolveDiscretizationLabel(
      visualization?.polygon?.strokeClassification
        ? { ...visualization.polygon.strokeClassification }
        : undefined
    )
  );
</script>

<ExpandableSection
  title={m.polygons_title()}
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

  <div class="polygons-config">
    <FillSection
      visualization={visualization}
      dataFields={dataFields}
      availableModes={FILL_MODES_WITH_DENSITY}
      fillMode={effectiveFillMode}
      fillColor={fillColor}
      fillOpacity={fillOpacity}
      selectedValueFieldId={valueFieldSelection.selectedFieldId}
      selectedCategoryFieldId={categoryFieldSelection.selectedFieldId}
      discretizationLabel={discretizationLabel}
      categoryCount={categoryCount}
      facetsValueSlotPath={FACET_SLOT.POLYGON_VALUE}
      facetsCategorySlotPath={FACET_SLOT.POLYGON_CATEGORY}
      categoriesVariant="polygons"
      showMissingData={showMissingData}
      missingDataColor={missingDataColor}
      missingDataPattern={missingDataPattern}
      missingDataPatternConfig={missingDataPatternConfig}
      sectionTitle={m.fill()}
      selectableDataFields={selectableDataFields}
      getFacetsSelectedFieldIds={facetsSelection.getSelectedFieldIds}
      isFacetsActiveForSlot={facetsSelection.isActiveForSlot}
      onFillModeChange={(mode) =>
        handleFillModeChange(FILL_MODE_ORDER.indexOf(mode))}
      onFillColorChange={handleFillColorChange}
      onFillOpacityChange={handleFillOpacityChange}
      onValueFieldSelect={valueFieldSelection.handleSelect}
      onCategoryFieldSelect={categoryFieldSelection.handleSelect}
      onFacetsVariablesChange={facetsSelection.updateVariables}
      onFacetsToggle={facetsSelection.toggle}
      onOpenDiscretization={handleOpenDiscretization}
      onClassificationChange={handleClassificationChange}
      onMissingDataShowChange={handleMissingDataShowChange}
      onMissingDataColorChange={handleMissingDataColorChange}
      onMissingDataPatternChange={handleMissingDataPatternChange}
      onMissingDataPatternStyleChange={handleMissingDataPatternStyleChange}
      onInvertPalette={onInvertPalette}
    >
      {#snippet densitySnippet()}
        <PolygonModeDensity
          dataFields={dataFields}
          visualization={visualization}
          onDensityChange={onDensityChange}
          onStyleChange={onStyleChange}
        />
      {/snippet}
    </FillSection>

    {#if effectiveFillMode !== FillMode.DENSITY}
      <StrokeSection
        visualization={visualization}
        fillColor={strokeReferenceFill}
        dataFields={dataFields}
        discretizationLabel={strokeDiscretizationLabel}
        onStyleChange={onStyleChange}
        onModesChange={onModesChange}
        onMappingChange={onMappingChange}
        onStrokeMappingChange={onStrokeMappingChange}
        onInvertPalette={onStrokeInvertPalette}
        onOpenDiscretization={handleOpenStrokeDiscretization}
        onStrokeClassificationChange={handleStrokeDiscretizationChange}
        strokeClassification={visualization?.polygon?.strokeClassification}
        strokeValueColumn={visualization?.polygon?.strokeValueColumn}
        strokeCategoryColumn={visualization?.polygon?.strokeCategoryColumn}
        maxStrokeWidth={POLYGON_STROKE_WIDTH_MAX}
        showMissingData={showMissingData}
        missingDataColor={missingDataColor}
        facetsValueSlotPath={FACET_SLOT.POLYGON_STROKE_VALUE}
        facetsCategorySlotPath={FACET_SLOT.POLYGON_STROKE_CATEGORY}
        onMissingDataShowChange={handleMissingDataShowChange}
        onMissingDataColorChange={handleMissingDataColorChange}
      />
    {/if}
  </div>
</ExpandableSection>

{#if filterSectionVisible}
  <VizFilterPanel
    title={m.polygons_title()}
    dataFields={dataFields}
    filters={filters}
    stats={filterStats}
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
  classification={activeDiscretizationClassification}
  valueColumn={activeDiscretizationValueColumn}
  role={discretizationTarget}
  onchange={discretizationOnchange}
/>

<style lang="scss">
  .polygons-config {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    padding: var(--cds-spacing-03);
  }
</style>
