<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
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
  import { DEFAULT_SEQUENTIAL_PREVIEW } from './palette-popover/palette.constants';
  import {
    Category,
    MisuseOutline,
    SquareFill,
    Tag
  } from 'carbon-icons-svelte';
  import {
    DEFAULT_COLORS,
    FillMode,
    SLIDER_LIMITS,
    VISUALIZATION_DEFAULTS
  } from '../../constants';
  import {
    ColorSelector,
    DiscretizationRow,
    InfoPopover,
    MissingDataSection,
    PalettePreview,
    SectionHeading,
    SliderWithInput,
    StrokeSection,
    VizFilterButton,
    VizFilterPanel
  } from './shared';
  import type { VizDataFilter } from '$lib/features/commons/store/visualization.store.svelte';
  import DiscretizationModal from './discretization-modal.svelte';
  import type { ClassificationConfig } from '$lib/features/commons/store/visualization.store.svelte';
  import { resolveDiscretizationLabel } from './discretization.utils';
  import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
  import { facetsStore } from '$lib/features/step-toolbar/tools/facets/facets.store.svelte';
  import FacetsVariablePicker from './symbols/facets-variable-picker.svelte';

  interface Props {
    dataFields?: Array<{ id: number; text: string; type?: string }>;
    visualization?: VisualizationConfig;
    disabled?: boolean;
    onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
    onModesChange?: (updates: Partial<VisualizationModes>) => void;
    onMissingDataChange?: (updates: Partial<MissingDataConfig>) => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
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
    onMappingChange,
    onInvertPalette,
    onToggleVisibility,
    filters = [],
    onAddFilter,
    onUpdateFilter,
    onRemoveFilter
  }: Props = $props();

  let discretizationModalOpen = $state(false);
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

  const currentPalette = $derived(
    visualization?.classification?.colors ?? DEFAULT_SEQUENTIAL_PREVIEW
  );
  const categoryCount = $derived(
    visualization?.classification?.labels?.length ?? 4
  );

  let fillMode = $state<FillMode>(FillMode.UNIQUE);
  let fillColor = $state<string>(DEFAULT_COLORS.fill);
  let fillOpacity = $state<number>(VISUALIZATION_DEFAULTS.fillOpacity);
  let showMissingData = $state<boolean>(true);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);
  let fillPattern = $state<boolean>(false);
  const enabled = $derived.by(() => {
    const primitiveFilters =
      visualization?.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;
    return primitiveFilters.includes(PrimitiveFilterType.POLYGON);
  });

  $effect(() => {
    if (visualization?.style) {
      const fillOp = visualization.style.fillOpacity;
      fillOpacity =
        fillOp !== undefined
          ? Math.round(fillOp * 100)
          : VISUALIZATION_DEFAULTS.fillOpacity;
      fillColor =
        (visualization.style.fillColor as string) ?? DEFAULT_COLORS.fill;
    }
    if (visualization?.modes) {
      fillMode =
        (visualization.style.fillOpacity ?? 1) <= 0
          ? FillMode.NONE
          : (visualization.modes.fill ?? FillMode.UNIQUE);
    }
    if (visualization?.missingData) {
      showMissingData = visualization.missingData.show ?? true;
      missingDataColor =
        visualization.missingData.color ?? DEFAULT_COLORS.missingData;
      fillPattern = visualization.missingData.pattern ?? false;
    }
  });

  const fillModeItems = [
    { icon: MisuseOutline, label: m.fill_mode_none(), iconSize: 16 },
    { icon: SquareFill, label: m.fill_mode_unique(), iconSize: 16 },
    { icon: Category, label: m.fill_mode_classes(), iconSize: 16 },
    { icon: Tag, label: m.fill_mode_categories(), iconSize: 16 }
  ];

  function handleFillModeChange(index: number) {
    const modes = [
      FillMode.NONE,
      FillMode.UNIQUE,
      FillMode.CLASSES,
      FillMode.CATEGORIES
    ];
    fillMode = modes[index] || FillMode.NONE;
    onModesChange?.({ fill: fillMode });
    if (fillMode === FillMode.NONE) {
      onStyleChange?.({ fillOpacity: 0 });
      return;
    }

    if ((visualization?.style.fillOpacity ?? 1) <= 0) {
      onStyleChange?.({
        fillOpacity: VISUALIZATION_DEFAULTS.fillOpacity / 100
      });
    }
  }

  function handleFillColorChange(value: string) {
    fillColor = value;
    onStyleChange?.({ fillColor: value });
  }

  const fillModeIndex = $derived(
    [
      FillMode.NONE,
      FillMode.UNIQUE,
      FillMode.CLASSES,
      FillMode.CATEGORIES
    ].indexOf(fillMode)
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

  function handleFillPatternChange(value: boolean) {
    fillPattern = value;
    onMissingDataChange?.({ pattern: value });
  }

  function handleOpenDiscretization() {
    discretizationModalOpen = true;
  }

  function handleClassificationChange(
    classification: Partial<ClassificationConfig>
  ) {
    onClassificationChange?.(classification);
  }

  const discretizationLabel = $derived(
    resolveDiscretizationLabel(visualization?.classification)
  );

  const selectedVizId = $derived(visualizationStore.selectedVisualization?.id);

  const isFacetsActiveForViz = $derived(
    facetsStore.enabled &&
      selectedVizId !== undefined &&
      facetsStore.baseVisualizationId === selectedVizId
  );

  const facetsSelectedFieldIds = $derived.by(() => {
    if (!isFacetsActiveForViz) return [] as number[];
    return facetsStore.variables
      .map((name) => dataFields.find((f) => f.text === name)?.id)
      .filter((id): id is number => typeof id === 'number');
  });

  const valueColumnName = $derived(
    dataFields.find((f) => f.id === selectedFieldId)?.text ?? ''
  );

  const categoryColumnName = $derived(
    dataFields.find((f) => f.id === selectedCategoryFieldId)?.text ?? ''
  );

  async function handleFacetsVariablesChange(
    baseVariableName: string,
    fieldIds: number[]
  ) {
    if (!selectedVizId) return;
    const variableNames = fieldIds
      .map((id) => dataFields.find((f) => f.id === id)?.text)
      .filter((name): name is string => Boolean(name));
    const merged = variableNames.includes(baseVariableName)
      ? variableNames
      : [baseVariableName, ...variableNames];
    await facetsStore.updateVariables(selectedVizId, merged);
  }

  async function handleFacetsToggle(
    baseVariableName: string,
    enabled: boolean
  ) {
    if (!selectedVizId) return;
    if (enabled) {
      const seed = baseVariableName ? [baseVariableName] : [];
      const otherColumns = dataFields.filter(
        (f) => f.text !== baseVariableName
      );
      const second = otherColumns[0]?.text;
      const candidates = second ? [...seed, second] : seed;
      if (candidates.length < 2) return;
      await facetsStore.updateVariables(selectedVizId, candidates);
    } else {
      facetsStore.disable();
    }
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
    <SectionHeading title={m.fill()} />

    <div class="field-group">
      <ToggleTabs
        items={fillModeItems}
        activeIndex={fillModeIndex}
        onChange={handleFillModeChange}
        hideInactiveLabel={true}
      />
    </div>

    {#if fillMode === FillMode.UNIQUE}
      <ColorSelector
        label={m.color()}
        value={fillColor}
        onchange={handleFillColorChange}
      />
    {:else if fillMode === FillMode.CLASSES}
      <div class="field-group">
        <FacetsVariablePicker
          titleText={m.color_according()}
          dataFields={dataFields}
          singleSelectItems={selectableDataFields}
          selectedFieldId={selectedFieldId}
          selectedFieldIds={facetsSelectedFieldIds}
          isCollectionEnabled={isFacetsActiveForViz}
          onSelect={handleValueFieldSelect}
          onCollectionChange={(ids) =>
            handleFacetsVariablesChange(valueColumnName, ids)}
          onToggleCollection={(en) => handleFacetsToggle(valueColumnName, en)}
        />
      </div>
      <DiscretizationRow
        label={m.discretization()}
        value={discretizationLabel}
        onsettings={handleOpenDiscretization}
      />
      <PalettePreview
        label={m.color_palette()}
        colors={currentPalette}
        selectedPaletteId={visualization?.classification?.paletteId}
        inverted={visualization?.classification?.inverted ?? false}
        oninvert={onInvertPalette}
        onClassificationChange={handleClassificationChange}
      />
    {:else if fillMode === FillMode.CATEGORIES}
      <div class="field-group">
        <FacetsVariablePicker
          titleText={m.color_according()}
          dataFields={dataFields}
          singleSelectItems={selectableDataFields}
          selectedFieldId={selectedCategoryFieldId}
          selectedFieldIds={facetsSelectedFieldIds}
          isCollectionEnabled={isFacetsActiveForViz}
          onSelect={handleCategoryFieldSelect}
          onCollectionChange={(ids) =>
            handleFacetsVariablesChange(categoryColumnName, ids)}
          onToggleCollection={(en) =>
            handleFacetsToggle(categoryColumnName, en)}
        />
      </div>
      <DiscretizationRow
        label={m.category_aspect()}
        value={m.categories_count({ count: categoryCount })}
        onsettings={handleOpenDiscretization}
      />
      <PalettePreview
        label={m.color_palette()}
        colors={currentPalette}
        selectedPaletteId={visualization?.classification?.paletteId}
        inverted={visualization?.classification?.inverted ?? false}
        oninvert={onInvertPalette}
        onClassificationChange={handleClassificationChange}
      />
    {/if}

    {#if fillMode !== FillMode.NONE}
      <SliderWithInput
        label={m.opacity()}
        min={SLIDER_LIMITS.opacity.min}
        max={SLIDER_LIMITS.opacity.max}
        value={fillOpacity}
        onchange={handleFillOpacityChange}
      />
    {/if}

    {#if fillMode === FillMode.CLASSES || fillMode === FillMode.CATEGORIES}
      <MissingDataSection
        bind:show={showMissingData}
        color={missingDataColor}
        showShapeSelector={false}
        showSizeSlider={false}
        showPattern={true}
        pattern={fillPattern}
        onshowchange={handleMissingDataShowChange}
        oncolorchange={handleMissingDataColorChange}
        onpatternchange={handleFillPatternChange}
      />
    {/if}

    <StrokeSection
      visualization={visualization}
      dataFields={dataFields}
      classesPalette={currentPalette}
      discretizationLabel={discretizationLabel}
      onStyleChange={onStyleChange}
      onModesChange={onModesChange}
      onMappingChange={onMappingChange}
      onInvertPalette={onInvertPalette}
      onOpenDiscretization={handleOpenDiscretization}
      onClassificationChange={handleClassificationChange}
    />
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
  onchange={handleClassificationChange}
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
