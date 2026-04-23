<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    DiscretizationRow,
    InfoPopover,
    MissingDataSection,
    PalettePreview,
    SectionHeading,
    SliderWithInput,
    ToggleWithLabel,
    VizFilterButton,
    VizFilterPanel
  } from './shared';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import type {
    MissingDataConfig,
    VisualizationConfig,
    VisualizationModes,
    VizDataFilter
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    ALL_PRIMITIVE_FILTERS,
    PrimitiveFilterType
  } from '$lib/features/commons/store/visualization.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    DEFAULT_SEQUENTIAL_PREVIEW,
    DEFAULT_QUALITATIVE_PREVIEW,
    PALETTE_TYPE,
    resolvePaletteTypeForBreakpoint
  } from '$lib/features/commons/components/palette-popover/palette.constants';
  import { Category, Minimize, Subtract, Tag } from 'carbon-icons-svelte';
  import {
    ColorMode,
    DEFAULT_COLORS,
    MissingDataShape,
    ThicknessMode,
    SLIDER_LIMITS,
    VISUALIZATION_DEFAULTS
  } from '../../constants';
  import DiscretizationModal from './discretization-modal.svelte';
  import type { ClassificationConfig } from '$lib/features/commons/store/visualization.store.svelte';
  import { resolveDiscretizationLabel } from './discretization.utils';
  import { FACET_SLOT } from '../facets-adapter.svelte';
  import FacetsVariablePicker from './symbols/facets-variable-picker.svelte';
  import {
    NONE_FIELD_ID,
    useFieldSelection
  } from '../use-field-selection.svelte';
  import { useCategoryLabels } from '../use-category-labels.svelte';
  import { useFacetsVariableSelection } from '../use-facets-variable-selection.svelte';

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
  const valueFieldSelection = useFieldSelection(() => dataFields);
  const sizeFieldSelection = useFieldSelection(() => dataFields);
  const categoryFieldSelection = useFieldSelection(() => dataFields);
  const facetsSelection = useFacetsVariableSelection({
    getVisualizationId: () => visualization?.id,
    getDataFields: () => dataFields
  });

  $effect(() => {
    valueFieldSelection.sync(visualization?.mapping.valueColumn);
    sizeFieldSelection.sync(visualization?.mapping.sizeColumn);
    categoryFieldSelection.sync(visualization?.mapping.categoryColumn);
  });

  function handleValueFieldSelect(fieldId: number) {
    valueFieldSelection.set(fieldId);
    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ valueColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field && onMappingChange) {
      onMappingChange({ valueColumn: field.text });
    }
  }

  function handleSizeFieldSelect(fieldId: number) {
    sizeFieldSelection.set(fieldId);
    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ sizeColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field && onMappingChange) {
      onMappingChange({ sizeColumn: field.text });
    }
  }

  function handleCategoryFieldSelect(fieldId: number) {
    categoryFieldSelection.set(fieldId);
    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ categoryColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field && onMappingChange) {
      onMappingChange({ categoryColumn: field.text });
    }
  }

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
  let showMissingData = $state<boolean>(true);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);
  let missingDataShape = $state<MissingDataShape>(MissingDataShape.CIRCLE);
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
      const lineOpacity = visualization.style.lineOpacity;
      opacity =
        lineOpacity !== undefined
          ? lineOpacity <= 1
            ? Math.round(lineOpacity * 100)
            : lineOpacity
          : VISUALIZATION_DEFAULTS.lineOpacity;
      color = (visualization.style.lineColor as string) ?? DEFAULT_COLORS.line;
      dashed = visualization.style.lineDashed ?? false;
    }
    if (visualization?.modes) {
      thicknessMode = visualization.modes.thickness ?? ThicknessMode.UNIQUE;
      colorMode = visualization.modes.color ?? ColorMode.UNIQUE;
    }
    if (visualization?.missingData) {
      showMissingData = visualization.missingData.show ?? true;
      missingDataColor =
        visualization.missingData.color ?? DEFAULT_COLORS.missingData;
      missingDataShape =
        visualization.missingData.shape ?? MissingDataShape.CIRCLE;
    }
  });

  const thicknessModeItems = [
    { icon: Subtract, label: m.thickness_mode_unique(), iconSize: 16 },
    { icon: Minimize, label: m.thickness_mode_proportional(), iconSize: 16 },
    { icon: Category, label: m.thickness_mode_classes(), iconSize: 16 }
  ];

  const colorModeItems = [
    { icon: Subtract, label: m.color_mode_unique(), iconSize: 16 },
    { icon: Category, label: m.color_mode_classes(), iconSize: 16 },
    { icon: Tag, label: m.color_mode_categories(), iconSize: 16 }
  ];

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
    onStyleChange?.({ lineDashed: value });
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

  function handleMissingDataShapeChange(shape: string) {
    missingDataShape = shape as MissingDataShape;
    onMissingDataChange?.({ shape: shape as MissingDataShape });
  }

  const thicknessModeIndex = $derived(
    [
      ThicknessMode.UNIQUE,
      ThicknessMode.PROPORTIONAL,
      ThicknessMode.CLASSES
    ].indexOf(thicknessMode)
  );

  const colorModeIndex = $derived(
    [ColorMode.UNIQUE, ColorMode.CLASSES, ColorMode.CATEGORIES].indexOf(
      colorMode
    )
  );

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
    <InfoPopover text={m.lines_section_info()} />
    <VizFilterButton
      active={filterSectionVisible || filters.length > 0}
      count={filters.length}
      onToggle={() => {
        filterSectionVisible = !filterSectionVisible;
      }}
    />
  {/snippet}

  <div class="lines-config">
    <SectionHeading title={m.thickness()} />

    <div class="field-group">
      <ToggleTabs
        items={thicknessModeItems}
        activeIndex={thicknessModeIndex}
        onChange={handleThicknessModeChange}
        hideInactiveLabel={true}
      />
    </div>

    {#if thicknessMode === ThicknessMode.UNIQUE}
      <SliderWithInput
        label={m.thickness()}
        min={SLIDER_LIMITS.lineWidth.min}
        max={SLIDER_LIMITS.lineWidth.max}
        value={thickness}
        showMinMax
        inputWidth="128px"
        onchange={handleThicknessChange}
      />
    {:else if thicknessMode === ThicknessMode.PROPORTIONAL}
      <div class="field-group">
        <FacetsVariablePicker
          bind:open={thicknessPickerOpen}
          titleText={m.thickness_according()}
          dataFields={dataFields}
          singleSelectItems={selectableDataFields}
          selectedFieldId={sizeFieldSelection.selectedFieldId}
          selectedFieldIds={facetsSelection.getSelectedFieldIds(
            FACET_SLOT.LINE_SIZE
          )}
          isCollectionEnabled={facetsSelection.isActiveForSlot(
            FACET_SLOT.LINE_SIZE
          )}
          onSelect={handleSizeFieldSelect}
          onCollectionChange={(ids) =>
            facetsSelection.updateVariables(
              sizeColumnName,
              FACET_SLOT.LINE_SIZE,
              ids
            )}
          onToggleCollection={(en) =>
            facetsSelection.toggle(sizeColumnName, FACET_SLOT.LINE_SIZE, en)}
        />
      </div>
      <SliderWithInput
        label={m.max_thickness()}
        min={1}
        max={SLIDER_LIMITS.lineMaxWidth.max}
        value={maxThickness}
        showMinMax
        inputWidth="128px"
        onchange={handleMaxThicknessChange}
      />
    {:else if thicknessMode === ThicknessMode.CLASSES}
      <div class="field-group">
        <FacetsVariablePicker
          bind:open={thicknessPickerOpen}
          titleText={m.thickness_according()}
          dataFields={dataFields}
          singleSelectItems={selectableDataFields}
          selectedFieldId={valueFieldSelection.selectedFieldId}
          selectedFieldIds={facetsSelection.getSelectedFieldIds(
            FACET_SLOT.LINE_VALUE
          )}
          isCollectionEnabled={facetsSelection.isActiveForSlot(
            FACET_SLOT.LINE_VALUE
          )}
          onSelect={handleValueFieldSelect}
          onCollectionChange={(ids) =>
            facetsSelection.updateVariables(
              valueColumnName,
              FACET_SLOT.LINE_VALUE,
              ids
            )}
          onToggleCollection={(en) =>
            facetsSelection.toggle(valueColumnName, FACET_SLOT.LINE_VALUE, en)}
        />
      </div>
      <DiscretizationRow
        label={m.discretization()}
        value={thicknessDiscretizationLabel}
        onsettings={handleOpenThicknessDiscretization}
      />
      <SliderWithInput
        label={m.max_thickness()}
        min={1}
        max={SLIDER_LIMITS.lineMaxWidth.max}
        value={maxThickness}
        showMinMax
        inputWidth="128px"
        onchange={handleMaxThicknessChange}
      />
    {/if}

    <SectionHeading title={m.color()} />

    <div class="field-group">
      <ToggleTabs
        items={colorModeItems}
        activeIndex={colorModeIndex}
        onChange={handleColorModeChange}
        hideInactiveLabel={true}
      />
    </div>

    {#if colorMode === ColorMode.UNIQUE}
      <SingleColorPreview
        exclusive
        label={m.color()}
        color={color}
        onchange={handleColorChange}
      />
    {:else if colorMode === ColorMode.CLASSES}
      <div class="field-group">
        <FacetsVariablePicker
          bind:open={colorPickerOpen}
          titleText={m.color_according()}
          dataFields={dataFields}
          singleSelectItems={selectableDataFields}
          selectedFieldId={valueFieldSelection.selectedFieldId}
          selectedFieldIds={facetsSelection.getSelectedFieldIds(
            FACET_SLOT.LINE_VALUE
          )}
          isCollectionEnabled={facetsSelection.isActiveForSlot(
            FACET_SLOT.LINE_VALUE
          )}
          onSelect={handleValueFieldSelect}
          onCollectionChange={(ids) =>
            facetsSelection.updateVariables(
              valueColumnName,
              FACET_SLOT.LINE_VALUE,
              ids
            )}
          onToggleCollection={(en) =>
            facetsSelection.toggle(valueColumnName, FACET_SLOT.LINE_VALUE, en)}
        />
      </div>
      <DiscretizationRow
        label={m.discretization()}
        value={colorDiscretizationLabel}
        onsettings={handleOpenColorDiscretization}
      />
      <PalettePreview
        label={m.color_palette()}
        colors={currentPalette}
        selectedPaletteId={lineColorClassification?.paletteId}
        inverted={lineColorClassification?.inverted ?? false}
        paletteType={resolvePaletteTypeForBreakpoint(lineColorClassification)}
        classification={lineColorClassification}
        oninvert={onInvertPalette}
        onClassificationChange={handleColorClassificationChange}
      />
    {:else if colorMode === ColorMode.CATEGORIES}
      <div class="field-group">
        <FacetsVariablePicker
          bind:open={categoryPickerOpen}
          titleText={m.color_according()}
          dataFields={dataFields}
          singleSelectItems={selectableDataFields}
          selectedFieldId={categoryFieldSelection.selectedFieldId}
          selectedFieldIds={facetsSelection.getSelectedFieldIds(
            FACET_SLOT.LINE_CATEGORY
          )}
          isCollectionEnabled={facetsSelection.isActiveForSlot(
            FACET_SLOT.LINE_CATEGORY
          )}
          onSelect={handleCategoryFieldSelect}
          onCollectionChange={(ids) =>
            facetsSelection.updateVariables(
              categoryColumnName,
              FACET_SLOT.LINE_CATEGORY,
              ids
            )}
          onToggleCollection={(en) =>
            facetsSelection.toggle(
              categoryColumnName,
              FACET_SLOT.LINE_CATEGORY,
              en
            )}
        />
      </div>
      <DiscretizationRow
        label={m.category_aspect()}
        value={m.categories_count({ count: categoryCount })}
        settingsIconDescription={m.palette_categories_aspect_title()}
        onsettings={() => {
          colorCategoriesPopoverOpen = true;
        }}
      />
      <PalettePreview
        label={m.color_palette()}
        colors={categoriesPalette}
        selectedPaletteId={lineColorClassification?.paletteId}
        inverted={lineColorClassification?.inverted ?? false}
        paletteType={PALETTE_TYPE.QUALITATIVE}
        categoriesMode={true}
        categoriesVariant="lines"
        categoryLabels={categoryLabels.labels}
        bind:categoriesPopoverOpen={colorCategoriesPopoverOpen}
        oninvert={onInvertPalette}
        onClassificationChange={handleColorClassificationChange}
      />
    {/if}

    <SliderWithInput
      label={m.opacity()}
      min={SLIDER_LIMITS.lineOpacity.min}
      max={SLIDER_LIMITS.lineOpacity.max}
      value={opacity}
      showMinMax
      inputWidth="128px"
      onchange={handleOpacityChange}
    />

    <ToggleWithLabel
      label={m.dashed()}
      toggled={dashed}
      ontoggle={handleDashedChange}
    />

    <MissingDataSection
      show={showMissingData}
      onshowchange={handleMissingDataToggle}
      color={missingDataColor}
      oncolorchange={handleMissingDataColorChange}
      shape={missingDataShape}
      onshapechange={handleMissingDataShapeChange}
      showShapeSelector={true}
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
  onchange={discretizationTarget === 'thickness'
    ? handleThicknessClassificationChange
    : handleColorClassificationChange}
/>

<style lang="scss">
  .lines-config {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
    padding: var(--cds-spacing-04) var(--cds-spacing-03) var(--cds-spacing-05);
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }
</style>
