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
    VizFilterSection
  } from './shared';
  import type { VizDataFilter } from '$lib/features/commons/store/visualization.store.svelte';
  import DiscretizationModal from './discretization-modal.svelte';
  import {
    ClassificationMethod,
    type ClassificationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { Dropdown } from 'carbon-components-svelte';

  interface Props {
    dataFields?: Array<{ id: number; text: string }>;
    discretizationMethods?: Array<{ id: number; text: string }>;
    visualization?: VisualizationConfig;
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
    onRemoveFilter?: (filterId: string) => void;
    onClearFilters?: () => void;
  }

  let {
    dataFields = [],
    discretizationMethods: _discretizationMethods = [],
    visualization,
    onStyleChange,
    onModesChange,
    onMissingDataChange,
    onClassificationChange,
    onMappingChange,
    onInvertPalette,
    onToggleVisibility,
    filters = [],
    onAddFilter = () => {},
    onRemoveFilter = () => {},
    onClearFilters = () => {}
  }: Props = $props();

  let discretizationModalOpen = $state(false);
  let selectedFieldId = $state<number>(0);
  let selectedCategoryFieldId = $state<number>(0);

  $effect(() => {
    if (visualization?.mapping.valueColumn && dataFields.length > 0) {
      const fieldIndex = dataFields.findIndex(
        (f) => f.text === visualization.mapping.valueColumn
      );
      if (fieldIndex >= 0) {
        selectedFieldId = dataFields[fieldIndex].id;
      }
    }

    if (visualization?.mapping.categoryColumn && dataFields.length > 0) {
      const fieldIndex = dataFields.findIndex(
        (f) => f.text === visualization.mapping.categoryColumn
      );
      if (fieldIndex >= 0) {
        selectedCategoryFieldId = dataFields[fieldIndex].id;
      }
    }
  });

  function handleValueFieldSelect(fieldId: number) {
    selectedFieldId = fieldId;
    const field = dataFields.find((item) => item.id === fieldId);
    if (field && onMappingChange) {
      onMappingChange({ valueColumn: field.text });
    }
  }

  function handleCategoryFieldSelect(fieldId: number) {
    selectedCategoryFieldId = fieldId;
    const field = dataFields.find((item) => item.id === fieldId);
    if (field && onMappingChange) {
      onMappingChange({ categoryColumn: field.text });
    }
  }

  const currentPalette = $derived(
    visualization?.classification?.colors ?? [
      '#c8ddf0',
      '#78a9cf',
      '#2171b5',
      '#084594'
    ]
  );
  const qualitativePalette = ['#009d9a', '#f1c21b', '#ff832b', '#a56eff'];

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
      fillMode = visualization.modes.fill ?? FillMode.UNIQUE;
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

  const discretizationLabel = $derived.by(() => {
    if (!visualization?.classification) return m.discretization_method_jenks();
    const methodLabels: Record<ClassificationMethod, () => string> = {
      [ClassificationMethod.JENKS]: m.discretization_method_jenks,
      [ClassificationMethod.QUANTILES]: m.discretization_method_quantile,
      [ClassificationMethod.EQUAL_INTERVAL]:
        m.discretization_method_equal_interval,
      [ClassificationMethod.STANDARD_DEVIATION]:
        m.discretization_method_nested_means,
      [ClassificationMethod.MANUAL]: m.discretization_method_manual,
      [ClassificationMethod.Q6]: m.discretization_method_q6,
      [ClassificationMethod.NESTED_MEANS]: m.discretization_method_nested_means,
      [ClassificationMethod.HEAD_TAIL]: m.discretization_method_head_tail
    };
    const method =
      visualization.classification.method ?? ClassificationMethod.QUANTILES;
    const numClasses =
      visualization.classification.numClasses ??
      visualization.classification.classes ??
      5;
    const methodLabel = methodLabels[method]?.() ?? String(method);
    return `${methodLabel}, ${numClasses} ${m.discretization_num_classes().toLowerCase()}`;
  });
</script>

<ExpandableSection
  title={m.polygons_title()}
  defaultOpen={false}
  showToggle
  toggleChecked={enabled}
  onToggleChange={handleToggleChange}
>
  {#snippet icon()}
    <InfoPopover text={m.polygons_section_info()} />
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
        <Dropdown
          titleText={m.color_according()}
          items={dataFields}
          selectedId={selectedFieldId}
          on:select={(e) => handleValueFieldSelect(e.detail.selectedId)}
          type="default"
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
        oninvert={onInvertPalette}
        onClassificationChange={handleClassificationChange}
      />
    {:else if fillMode === FillMode.CATEGORIES}
      <div class="field-group">
        <Dropdown
          titleText={m.color_according()}
          items={dataFields}
          selectedId={selectedCategoryFieldId}
          on:select={(e) => handleCategoryFieldSelect(e.detail.selectedId)}
          type="default"
        />
      </div>
      <DiscretizationRow
        label={m.category_aspect()}
        value={m.categories_count({ count: 4 })}
        onsettings={handleOpenDiscretization}
      />
      <PalettePreview
        label={m.color_palette()}
        colors={qualitativePalette}
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
      onInvertPalette={onInvertPalette}
      onOpenDiscretization={handleOpenDiscretization}
      onClassificationChange={handleClassificationChange}
    />

    <VizFilterSection
      dataFields={dataFields}
      filters={filters}
      onAddFilter={onAddFilter}
      onRemoveFilter={onRemoveFilter}
      onClearFilters={onClearFilters}
    />
  </div>
</ExpandableSection>

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
