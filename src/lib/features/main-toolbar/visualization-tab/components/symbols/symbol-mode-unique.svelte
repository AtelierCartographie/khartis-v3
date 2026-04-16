<script lang="ts">
  import { Dropdown } from 'carbon-components-svelte';
  import {
    MisuseOutline,
    CircleFilled,
    SquareFill,
    Close,
    CaretUp,
    Category,
    Tag,
    StarFilled,
    DiamondFill,
    Checkbox
  } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    DEFAULT_SEQUENTIAL_PREVIEW,
    DEFAULT_QUALITATIVE_PREVIEW
  } from '../palette-popover/palette.constants';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    FillMode,
    ShapeType,
    SLIDER_LIMITS,
    SymbolMode,
    VISUALIZATION_DEFAULTS,
    DEFAULT_COLORS,
    availableShapesForSymbolMode
  } from '../../../constants';
  import {
    ColorSelector,
    DiscretizationRow,
    InfoPopover,
    PalettePreview,
    SectionHeading,
    SliderWithInput,
    MissingDataSection,
    StrokeSection
  } from '../shared';
  import type { SymbolModeProps } from './types';
  import { resolveDiscretizationLabel } from '../discretization.utils';

  let {
    dataFields = [],
    visualization,
    onStyleChange,
    onModesChange,
    onSymbolsChange,
    onMappingChange,
    onMissingDataChange,
    onClassificationChange,
    onInvertPalette,
    onOpenDiscretization
  }: SymbolModeProps = $props();

  const sequentialPalette = DEFAULT_SEQUENTIAL_PREVIEW;
  const qualitativePalette = DEFAULT_QUALITATIVE_PREVIEW;

  let fillMode = $state<FillMode>(FillMode.UNIQUE);
  let symbolSize = $state<number>(VISUALIZATION_DEFAULTS.symbolSize);
  let shapeType = $state<ShapeType>(ShapeType.CIRCLE);
  let fillColor = $state<string>(DEFAULT_COLORS.fill);
  let fillOpacity = $state<number>(VISUALIZATION_DEFAULTS.fillOpacity);
  let showMissingData = $state<boolean>(true);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);
  let fillPattern = $state<boolean>(false);
  const NONE_FIELD_ID = -1;
  let selectedClassFieldId = $state<number>(NONE_FIELD_ID);
  let selectedCategoryFieldId = $state<number>(NONE_FIELD_ID);
  let categoryCount = $state<number>(4);
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);

  $effect(() => {
    if (visualization?.mapping.valueColumn && dataFields.length > 0) {
      const valueFieldIndex = dataFields.findIndex(
        (field) => field.text === visualization.mapping.valueColumn
      );
      selectedClassFieldId =
        valueFieldIndex >= 0 ? dataFields[valueFieldIndex].id : NONE_FIELD_ID;
    } else {
      selectedClassFieldId = NONE_FIELD_ID;
    }

    if (visualization?.mapping.categoryColumn && dataFields.length > 0) {
      const categoryFieldIndex = dataFields.findIndex(
        (field) => field.text === visualization.mapping.categoryColumn
      );
      selectedCategoryFieldId =
        categoryFieldIndex >= 0
          ? dataFields[categoryFieldIndex].id
          : NONE_FIELD_ID;
    } else {
      selectedCategoryFieldId = NONE_FIELD_ID;
    }

    if (visualization?.modes) {
      fillMode = visualization.modes.fill ?? FillMode.UNIQUE;
    }
    if (visualization?.style) {
      fillColor =
        (visualization.style.fillColor as string) ?? DEFAULT_COLORS.fill;
    }
    if (visualization?.symbols) {
      symbolSize =
        visualization.symbols.size ?? VISUALIZATION_DEFAULTS.symbolSize;
      shapeType = visualization.symbols.type ?? ShapeType.CIRCLE;
      fillOpacity =
        visualization.symbols.opacity !== undefined
          ? Math.round(visualization.symbols.opacity * 100)
          : VISUALIZATION_DEFAULTS.symbolOpacity;
    } else {
      fillOpacity = VISUALIZATION_DEFAULTS.symbolOpacity;
    }
    if (visualization?.missingData) {
      showMissingData = visualization.missingData.show ?? true;
      missingDataColor =
        visualization.missingData.color ?? DEFAULT_COLORS.missingData;
      fillPattern = visualization.missingData.pattern ?? false;
    }
    if (visualization?.classification) {
      categoryCount =
        visualization.classification.numClasses ??
        visualization.classification.classes ??
        4;
    }
  });

  const fillModeItems = [
    { icon: MisuseOutline, label: m.fill_mode_none(), iconSize: 16 },
    { icon: SquareFill, label: m.fill_mode_unique(), iconSize: 16 },
    { icon: Category, label: m.fill_mode_classes(), iconSize: 16 },
    { icon: Tag, label: m.fill_mode_categories(), iconSize: 16 }
  ];

  const fillModeIndex = $derived(
    [
      FillMode.NONE,
      FillMode.UNIQUE,
      FillMode.CLASSES,
      FillMode.CATEGORIES
    ].indexOf(fillMode)
  );

  const discretizationLabel = $derived(
    resolveDiscretizationLabel(visualization?.classification)
  );

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

  function handleSymbolSizeChange(value: number) {
    symbolSize = value;
    onSymbolsChange?.({ size: value });
  }

  function handleShapeTypeChange(value: ShapeType) {
    shapeType = value;
    onSymbolsChange?.({ type: value });
  }

  function handleFillColorChange(value: string) {
    fillColor = value;
    onStyleChange?.({ fillColor: value });
  }

  function handleFillOpacityChange(value: number) {
    fillOpacity = value;
    onSymbolsChange?.({ opacity: value / 100 });
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

  function handleClassFieldSelect(fieldId: number) {
    selectedClassFieldId = fieldId;
    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ valueColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onMappingChange?.({ valueColumn: field.text });
    }
  }

  function handleCategoryFieldSelect(fieldId: number) {
    selectedCategoryFieldId = fieldId;
    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ categoryColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onMappingChange?.({ categoryColumn: field.text });
    }
  }

  const shapeDescriptors: Record<
    ShapeType,
    { icon: typeof CircleFilled; label: () => string }
  > = {
    [ShapeType.CIRCLE]: { icon: CircleFilled, label: m.shape_circle },
    [ShapeType.SQUARE]: { icon: SquareFill, label: m.shape_square },
    [ShapeType.BAR]: { icon: SquareFill, label: m.shape_bar },
    [ShapeType.SPIKE]: { icon: CaretUp, label: m.shape_spike },
    [ShapeType.CROSS]: { icon: Close, label: m.shape_cross },
    [ShapeType.DIAMOND]: { icon: DiamondFill, label: m.shape_diamond },
    [ShapeType.TRIANGLE]: { icon: CaretUp, label: m.shape_triangle },
    [ShapeType.STAR]: { icon: StarFilled, label: m.shape_star },
    [ShapeType.RECTANGLE]: { icon: Checkbox, label: m.shape_rectangle }
  };

  const shapeTypes = availableShapesForSymbolMode(SymbolMode.UNIQUE);

  const shapeDropdownItems = $derived(
    shapeTypes.map((type) => ({
      id: type,
      text: shapeDescriptors[type].label()
    }))
  );

  function handleShapeDropdownSelect(value: string | number) {
    const next = shapeTypes.find((type) => type === value) ?? ShapeType.CIRCLE;
    handleShapeTypeChange(next);
  }
</script>

<SliderWithInput
  label={m.size_label()}
  infoText={m.unique_size_info()}
  bind:value={symbolSize}
  min={SLIDER_LIMITS.symbolSize.min}
  max={SLIDER_LIMITS.symbolSize.max}
  onchange={handleSymbolSizeChange}
/>

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

<SectionHeading title={m.background()} infoText={m.fill_section_info()} />

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
  <SliderWithInput
    label={m.opacity()}
    bind:value={fillOpacity}
    min={SLIDER_LIMITS.opacity.min}
    max={SLIDER_LIMITS.opacity.max}
    onchange={handleFillOpacityChange}
  />
{:else if fillMode === FillMode.CLASSES}
  <div class="field-group">
    <Dropdown
      titleText={m.color_according()}
      items={selectableDataFields}
      selectedId={selectedClassFieldId}
      on:select={(e) => handleClassFieldSelect(e.detail.selectedId)}
      type="default"
    />
  </div>
  <DiscretizationRow
    label={m.discretization()}
    value={discretizationLabel}
    onsettings={onOpenDiscretization}
  />
  <PalettePreview
    label={m.color_palette()}
    colors={sequentialPalette}
    selectedPaletteId={visualization?.classification?.paletteId}
    inverted={visualization?.classification?.inverted ?? false}
    oninvert={onInvertPalette}
    onClassificationChange={onClassificationChange}
  />
  <SliderWithInput
    label={m.opacity()}
    bind:value={fillOpacity}
    min={SLIDER_LIMITS.opacity.min}
    max={SLIDER_LIMITS.opacity.max}
    onchange={handleFillOpacityChange}
  />
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
{:else if fillMode === FillMode.CATEGORIES}
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
    value={m.categories_count({ count: categoryCount })}
    onsettings={onOpenDiscretization}
  />
  <PalettePreview
    label={m.color_palette()}
    colors={qualitativePalette}
    inverted={visualization?.classification?.inverted ?? false}
    oninvert={onInvertPalette}
    onClassificationChange={onClassificationChange}
  />
  <SliderWithInput
    label={m.opacity()}
    bind:value={fillOpacity}
    min={SLIDER_LIMITS.opacity.min}
    max={SLIDER_LIMITS.opacity.max}
    onchange={handleFillOpacityChange}
  />
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
  infoText={m.stroke_section_info()}
  showDashed={false}
  discretizationLabel={discretizationLabel}
  onStyleChange={onStyleChange}
  onModesChange={onModesChange}
  onMappingChange={onMappingChange}
  onInvertPalette={onInvertPalette}
  onOpenDiscretization={onOpenDiscretization}
  onClassificationChange={onClassificationChange}
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
</style>
