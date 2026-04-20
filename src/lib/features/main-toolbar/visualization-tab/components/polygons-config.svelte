<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import type {
    MissingDataConfig,
    VisualizationConfig,
    VisualizationModes
  } from '$lib/features/commons/store/visualization.store.svelte';
  import {
    ALL_PRIMITIVE_FILTERS,
    PrimitiveFilterType
  } from '$lib/features/commons/store/visualization.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    DEFAULT_COLORS,
    FillMode,
    VISUALIZATION_DEFAULTS
  } from '../../constants';
  import { FILL_MODES_WITH_DENSITY } from './shared/fill-mode-presets';
  import FillSection from './shared/fill-section.svelte';
  import {
    InfoPopover,
    StrokeSection,
    VizFilterButton,
    VizFilterPanel
  } from './shared';
  import type { VizDataFilter } from '$lib/features/commons/store/visualization.store.svelte';
  import DiscretizationModal from './discretization-modal.svelte';
  import type { ClassificationConfig } from '$lib/features/commons/store/visualization.store.svelte';
  import { resolveDiscretizationLabel } from './discretization.utils';
  import {
    FACET_SLOT,
    facetsStore,
    type FacetSlotPath
  } from '$lib/features/step-toolbar/tools/facets/facets.store.svelte';
  import { PolygonModeDensity } from './polygons';

  interface Props {
    dataFields?: Array<{ id: number; text: string; type?: string }>;
    visualization?: VisualizationConfig;
    disabled?: boolean;
    onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
    onModesChange?: (updates: Partial<VisualizationModes>) => void;
    onMissingDataChange?: (updates: Partial<MissingDataConfig>) => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
    onStrokeClassificationChange?: (
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
    onStrokeClassificationChange,
    onMappingChange,
    onInvertPalette,
    onToggleVisibility,
    filters = [],
    onAddFilter,
    onUpdateFilter,
    onRemoveFilter
  }: Props = $props();

  let discretizationModalOpen = $state(false);
  let discretizationTarget = $state<'fill' | 'stroke'>('fill');
  let filterSectionVisible = $state(false);
  const NONE_FIELD_ID = -1;
  let selectedFieldId = $state<number>(NONE_FIELD_ID);
  let selectedCategoryFieldId = $state<number>(NONE_FIELD_ID);
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);

  $effect(() => {
    if (visualization?.mapping.valueColumn && dataFields.length > 0) {
      const fieldIndex = dataFields.findIndex(
        (f) => f.text === visualization.mapping.valueColumn
      );
      selectedFieldId =
        fieldIndex >= 0 ? dataFields[fieldIndex].id : NONE_FIELD_ID;
    } else {
      selectedFieldId = NONE_FIELD_ID;
    }

    if (visualization?.mapping.categoryColumn && dataFields.length > 0) {
      const fieldIndex = dataFields.findIndex(
        (f) => f.text === visualization.mapping.categoryColumn
      );
      selectedCategoryFieldId =
        fieldIndex >= 0 ? dataFields[fieldIndex].id : NONE_FIELD_ID;
    } else {
      selectedCategoryFieldId = NONE_FIELD_ID;
    }
  });

  function handleValueFieldSelect(fieldId: number) {
    selectedFieldId = fieldId;
    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ valueColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field && onMappingChange) {
      onMappingChange({ valueColumn: field.text });
    }
  }

  function handleCategoryFieldSelect(fieldId: number) {
    selectedCategoryFieldId = fieldId;
    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ categoryColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field && onMappingChange) {
      onMappingChange({ categoryColumn: field.text });
    }
  }

  const categoryCount = $derived(
    visualization?.classification?.labels?.length ?? 4
  );

  let fillMode = $state<FillMode>(FillMode.UNIQUE);
  let fillColor = $state<string>(DEFAULT_COLORS.fill);
  let fillOpacity = $state<number>(VISUALIZATION_DEFAULTS.fillOpacity);
  let showMissingData = $state<boolean>(true);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);
  const enabled = $derived.by(() => {
    const primitiveFilters =
      visualization?.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;
    return primitiveFilters.includes(PrimitiveFilterType.POLYGON);
  });

  $effect(() => {
    const polygonConfig = visualization?.polygon;
    const fillOp =
      polygonConfig?.fillOpacity ?? visualization?.style.fillOpacity;
    fillOpacity =
      fillOp !== undefined
        ? Math.round(fillOp * 100)
        : VISUALIZATION_DEFAULTS.fillOpacity;
    fillColor =
      (polygonConfig?.fillColor as string | undefined) ??
      (visualization?.style.fillColor as string | undefined) ??
      DEFAULT_COLORS.fill;
    fillMode =
      polygonConfig?.fillMode ?? visualization?.modes?.fill ?? FillMode.UNIQUE;
    if (visualization?.missingData) {
      showMissingData = visualization.missingData.show ?? true;
      missingDataColor =
        visualization.missingData.color ?? DEFAULT_COLORS.missingData;
    }
  });

  const FILL_MODE_ORDER = FILL_MODES_WITH_DENSITY;

  function handleFillModeChange(index: number) {
    const nextFillMode = FILL_MODE_ORDER[index] || FillMode.NONE;
    fillMode = nextFillMode;

    if (nextFillMode === FillMode.NONE) {
      fillColor = DEFAULT_COLORS.fill;
      onStyleChange?.({
        fillOpacity: 0,
        fillColor: DEFAULT_COLORS.fill
      });
      handleClassificationChange?.({
        colors: undefined,
        paletteId: undefined,
        inverted: false,
        patternId: undefined,
        patternParams: undefined,
        labels: undefined
      });
    } else {
      const currentOpacity =
        visualization?.polygon?.fillOpacity ??
        visualization?.style.fillOpacity ??
        1;
      if (currentOpacity <= 0) {
        onStyleChange?.({
          fillOpacity: VISUALIZATION_DEFAULTS.fillOpacity / 100
        });
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

  const selectedVizId = $derived(visualization?.id);

  const activeFacetsSlotPath = $derived.by(() => {
    if (
      !facetsStore.enabled ||
      !selectedVizId ||
      facetsStore.baseVisualizationId !== selectedVizId
    ) {
      return null;
    }
    return facetsStore.primarySlotPath;
  });

  function isFacetsActiveForSlot(slotPath: FacetSlotPath): boolean {
    return activeFacetsSlotPath === slotPath;
  }

  function getFacetsSelectedFieldIds(slotPath: FacetSlotPath): number[] {
    if (!isFacetsActiveForSlot(slotPath)) {
      return [];
    }
    return facetsStore.variables
      .map((name) => dataFields.find((f) => f.text === name)?.id)
      .filter((id): id is number => typeof id === 'number');
  }

  async function handleFacetsVariablesChange(
    baseVariableName: string,
    slotPath: FacetSlotPath,
    fieldIds: number[]
  ) {
    if (!selectedVizId) return;
    const variableNames = fieldIds
      .map((id) => dataFields.find((f) => f.id === id)?.text)
      .filter((name): name is string => Boolean(name));
    const hasBase = Boolean(baseVariableName);
    const merged =
      hasBase && !variableNames.includes(baseVariableName)
        ? [baseVariableName, ...variableNames]
        : variableNames;
    await facetsStore.updateVariables(selectedVizId, merged, slotPath);
  }

  async function handleFacetsToggle(
    baseVariableName: string,
    slotPath: FacetSlotPath,
    enabled: boolean
  ) {
    if (!selectedVizId) return;
    if (!enabled) {
      facetsStore.disable();
      return;
    }

    const available = dataFields
      .map((f) => f.text)
      .filter((name): name is string => Boolean(name));
    const seed = baseVariableName ? [baseVariableName] : [];
    const candidates = seed.slice();
    for (const name of available) {
      if (candidates.length >= 2) break;
      if (!candidates.includes(name)) candidates.push(name);
    }
    if (candidates.length < 2) return;
    await facetsStore.updateVariables(selectedVizId, candidates, slotPath);
  }
</script>

<ExpandableSection
  title={m.polygons_title()}
  defaultOpen={false}
  showToggle
  actionsEnd
  toggleChecked={enabled}
  disabled={disabled}
  onToggleChange={handleToggleChange}
>
  {#snippet icon()}
    <InfoPopover text={m.polygons_section_info()} />
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
      primitive="polygon"
      dataFields={dataFields}
      availableModes={FILL_MODES_WITH_DENSITY}
      fillMode={effectiveFillMode}
      fillColor={fillColor}
      fillOpacity={fillOpacity}
      selectedValueFieldId={selectedFieldId}
      selectedCategoryFieldId={selectedCategoryFieldId}
      discretizationLabel={discretizationLabel}
      categoryCount={categoryCount}
      facetsValueSlotPath={FACET_SLOT.POLYGON_VALUE}
      facetsCategorySlotPath={FACET_SLOT.POLYGON_CATEGORY}
      categoriesVariant="polygons"
      showMissingData={showMissingData}
      missingDataColor={missingDataColor}
      sectionTitle={m.fill()}
      selectableDataFields={selectableDataFields}
      getFacetsSelectedFieldIds={getFacetsSelectedFieldIds}
      isFacetsActiveForSlot={isFacetsActiveForSlot}
      onFillModeChange={(mode) =>
        handleFillModeChange(FILL_MODE_ORDER.indexOf(mode))}
      onFillColorChange={handleFillColorChange}
      onFillOpacityChange={handleFillOpacityChange}
      onValueFieldSelect={handleValueFieldSelect}
      onCategoryFieldSelect={handleCategoryFieldSelect}
      onFacetsVariablesChange={handleFacetsVariablesChange}
      onFacetsToggle={handleFacetsToggle}
      onOpenDiscretization={handleOpenDiscretization}
      onClassificationChange={handleClassificationChange}
      onMissingDataShowChange={handleMissingDataShowChange}
      onMissingDataColorChange={handleMissingDataColorChange}
      onInvertPalette={onInvertPalette}
    >
      {#snippet densitySnippet()}
        <PolygonModeDensity
          dataFields={dataFields}
          visualization={visualization}
          onMappingChange={onMappingChange}
          onStyleChange={onStyleChange}
        />
      {/snippet}
    </FillSection>

    {#if effectiveFillMode !== FillMode.DENSITY}
      <StrokeSection
        visualization={visualization}
        dataFields={dataFields}
        discretizationLabel={strokeDiscretizationLabel}
        onStyleChange={onStyleChange}
        onModesChange={onModesChange}
        onMappingChange={onMappingChange}
        onInvertPalette={onInvertPalette}
        onOpenDiscretization={handleOpenStrokeDiscretization}
        onStrokeClassificationChange={handleStrokeDiscretizationChange}
        strokeClassification={visualization?.polygon?.strokeClassification}
        facetsValueSlotPath={FACET_SLOT.POLYGON_VALUE}
        facetsCategorySlotPath={FACET_SLOT.POLYGON_CATEGORY}
      />
    {/if}
  </div>
</ExpandableSection>

{#if filterSectionVisible}
  <VizFilterPanel
    title={m.polygons_title()}
    dataFields={dataFields}
    filters={filters}
    onAddFilter={onAddFilter ?? (() => {})}
    onUpdateFilter={onUpdateFilter}
    onRemoveFilter={onRemoveFilter ?? (() => {})}
    onClose={() => {
      filterSectionVisible = false;
    }}
  />
{/if}

<DiscretizationModal
  bind:open={discretizationModalOpen}
  visualization={visualization}
  classification={activeDiscretizationClassification}
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

  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }
</style>
