<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    ColorSelector,
    DiscretizationRow,
    InfoPopover,
    MissingDataSection,
    PalettePreview,
    SectionHeading,
    SliderWithInput,
    ToggleWithLabel,
    VizFilterButton,
    VizFilterSection
  } from './shared';
  import type {
    MissingDataConfig,
    VisualizationConfig,
    VisualizationModes,
    VizDataFilter
  } from '$lib/features/commons/store/visualization.store.svelte';
  import {
    ALL_PRIMITIVE_FILTERS,
    PrimitiveFilterType
  } from '$lib/features/commons/store/visualization.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    DEFAULT_SEQUENTIAL_PREVIEW,
    DEFAULT_QUALITATIVE_PREVIEW
  } from './palette-popover/palette.constants';
  import { Category, Minimize, Subtract, Tag } from 'carbon-icons-svelte';
  import {
    ColorMode,
    DEFAULT_COLORS,
    MissingDataShape,
    ThicknessMode,
    SLIDER_LIMITS,
    VISUALIZATION_DEFAULTS
  } from '../../constants';
  import { Dropdown } from 'carbon-components-svelte';
  import DiscretizationModal from './discretization-modal.svelte';
  import type { ClassificationConfig } from '$lib/features/commons/store/visualization.store.svelte';
  import { resolveDiscretizationLabel } from './discretization.utils';

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
    onRemoveFilter,
    onClearFilters
  }: Props = $props();

  let discretizationModalOpen = $state(false);
  let filterSectionVisible = $state(false);
  const NONE_FIELD_ID = -1;
  let selectedValueFieldId = $state<number>(NONE_FIELD_ID);
  let selectedSizeFieldId = $state<number>(NONE_FIELD_ID);
  let selectedCategoryFieldId = $state<number>(NONE_FIELD_ID);
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);

  $effect(() => {
    if (visualization?.mapping.valueColumn && dataFields.length > 0) {
      const fieldIndex = dataFields.findIndex(
        (f) => f.text === visualization.mapping.valueColumn
      );
      selectedValueFieldId =
        fieldIndex >= 0 ? dataFields[fieldIndex].id : NONE_FIELD_ID;
    } else {
      selectedValueFieldId = NONE_FIELD_ID;
    }

    if (visualization?.mapping.sizeColumn && dataFields.length > 0) {
      const sizeIndex = dataFields.findIndex(
        (f) => f.text === visualization.mapping.sizeColumn
      );
      selectedSizeFieldId =
        sizeIndex >= 0 ? dataFields[sizeIndex].id : NONE_FIELD_ID;
    } else {
      selectedSizeFieldId = NONE_FIELD_ID;
    }

    if (visualization?.mapping.categoryColumn && dataFields.length > 0) {
      const categoryIndex = dataFields.findIndex(
        (f) => f.text === visualization.mapping.categoryColumn
      );
      selectedCategoryFieldId =
        categoryIndex >= 0 ? dataFields[categoryIndex].id : NONE_FIELD_ID;
    } else {
      selectedCategoryFieldId = NONE_FIELD_ID;
    }
  });

  function handleValueFieldSelect(fieldId: number) {
    selectedValueFieldId = fieldId;
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
    selectedSizeFieldId = fieldId;
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
  const qualitativePalette = DEFAULT_QUALITATIVE_PREVIEW;

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
  let missingDataOpacity = $state<number>(VISUALIZATION_DEFAULTS.lineOpacity);
  let missingDataShape = $state<MissingDataShape>(MissingDataShape.CIRCLE);

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
      missingDataOpacity =
        visualization.missingData.opacity !== undefined
          ? Math.round(visualization.missingData.opacity * 100)
          : VISUALIZATION_DEFAULTS.lineOpacity;
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
    thicknessMode = modes[index] || ThicknessMode.UNIQUE;
    onModesChange?.({ thickness: thicknessMode });
  }

  function handleColorModeChange(index: number) {
    const modes = [ColorMode.UNIQUE, ColorMode.CLASSES, ColorMode.CATEGORIES];
    colorMode = modes[index] || ColorMode.UNIQUE;
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

  function handleMissingDataOpacityChange(value: number) {
    missingDataOpacity = value;
    onMissingDataChange?.({ opacity: value / 100 });
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
</script>

<ExpandableSection
  title={m.lines_title()}
  defaultOpen={false}
  showToggle
  actionsEnd
  toggleChecked={enabled}
  disabled={disabled}
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
        <Dropdown
          titleText={m.thickness_according()}
          items={selectableDataFields}
          selectedId={selectedSizeFieldId}
          on:select={(e) => handleSizeFieldSelect(e.detail.selectedId)}
          type="default"
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
        <Dropdown
          titleText={m.thickness_according()}
          items={selectableDataFields}
          selectedId={selectedValueFieldId}
          on:select={(e) => handleValueFieldSelect(e.detail.selectedId)}
          type="default"
        />
      </div>
      <DiscretizationRow
        label={m.discretization()}
        value={discretizationLabel}
        onsettings={handleOpenDiscretization}
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
      <ColorSelector
        label={m.color()}
        value={color}
        onchange={handleColorChange}
      />
    {:else if colorMode === ColorMode.CLASSES}
      <div class="field-group">
        <Dropdown
          titleText={m.color_according()}
          items={selectableDataFields}
          selectedId={selectedValueFieldId}
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
        selectedPaletteId={visualization?.classification?.paletteId}
        inverted={visualization?.classification?.inverted ?? false}
        oninvert={onInvertPalette}
        onClassificationChange={handleClassificationChange}
      />
    {:else if colorMode === ColorMode.CATEGORIES}
      <div class="field-group">
        <Dropdown
          titleText={m.color_according()}
          items={selectableDataFields}
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
        selectedPaletteId={visualization?.classification?.paletteId}
        inverted={visualization?.classification?.inverted ?? false}
        oninvert={onInvertPalette}
        onClassificationChange={handleClassificationChange}
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
      opacity={missingDataOpacity}
      onopacitychange={handleMissingDataOpacityChange}
      shape={missingDataShape}
      onshapechange={handleMissingDataShapeChange}
      showShapeSelector={true}
    />

    {#if filterSectionVisible || filters.length > 0}
      <VizFilterSection
        dataFields={dataFields}
        filters={filters}
        onAddFilter={onAddFilter ?? (() => {})}
        onRemoveFilter={onRemoveFilter ?? (() => {})}
        onClearFilters={onClearFilters ?? (() => {})}
      />
    {/if}
  </div>
</ExpandableSection>

<DiscretizationModal
  bind:open={discretizationModalOpen}
  visualization={visualization}
  onchange={handleClassificationChange}
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
