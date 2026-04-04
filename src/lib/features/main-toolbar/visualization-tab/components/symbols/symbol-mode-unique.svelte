<script lang="ts">
  import { Dropdown } from 'carbon-components-svelte';
  import {
    MisuseOutline,
    SquareOutline,
    CircleFilled,
    SquareFill,
    CaretUp,
    Category,
    Tag
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
    VISUALIZATION_DEFAULTS,
    DEFAULT_COLORS
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
  let shapeType = $state<ShapeType>(ShapeType.POINT);
  let fillColor = $state<string>(DEFAULT_COLORS.fill);
  let fillOpacity = $state<number>(VISUALIZATION_DEFAULTS.fillOpacity);
  let showMissingData = $state<boolean>(true);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);
  let fillPattern = $state<boolean>(false);
  let selectedClassFieldId = $state<number>(0);
  let selectedCategoryFieldId = $state<number>(0);
  let categoryCount = $state<number>(4);

  $effect(() => {
    if (visualization?.mapping.valueColumn && dataFields.length > 0) {
      const valueFieldIndex = dataFields.findIndex(
        (field) => field.text === visualization.mapping.valueColumn
      );
      if (valueFieldIndex >= 0) {
        selectedClassFieldId = dataFields[valueFieldIndex].id;
      }
    }

    if (visualization?.mapping.categoryColumn && dataFields.length > 0) {
      const categoryFieldIndex = dataFields.findIndex(
        (field) => field.text === visualization.mapping.categoryColumn
      );
      if (categoryFieldIndex >= 0) {
        selectedCategoryFieldId = dataFields[categoryFieldIndex].id;
      }
    }

    if (visualization?.modes) {
      fillMode = visualization.modes.fill ?? FillMode.UNIQUE;
    }
    if (visualization?.style) {
      fillColor =
        (visualization.style.fillColor as string) ?? DEFAULT_COLORS.fill;
      fillOpacity =
        visualization.style.fillOpacity !== undefined
          ? Math.round(visualization.style.fillOpacity * 100)
          : VISUALIZATION_DEFAULTS.fillOpacity;
    }
    if (visualization?.symbols) {
      symbolSize =
        visualization.symbols.size ?? VISUALIZATION_DEFAULTS.symbolSize;
      shapeType = visualization.symbols.type ?? ShapeType.POINT;
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
    { icon: SquareOutline, label: m.fill_mode_unique(), iconSize: 16 },
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

  const discretizationLabel = $derived.by(() => {
    if (!visualization?.classification) return m.discretization_method_jenks();
    const numClasses =
      visualization.classification.numClasses ??
      visualization.classification.classes ??
      5;
    return `${m.discretization_method_quantile()}, ${numClasses} ${m.discretization_num_classes().toLowerCase()}`;
  });

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
    onStyleChange?.({ fillOpacity: value / 100 });
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
    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onMappingChange?.({ valueColumn: field.text });
    }
  }

  function handleCategoryFieldSelect(fieldId: number) {
    selectedCategoryFieldId = fieldId;
    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onMappingChange?.({ categoryColumn: field.text });
    }
  }

  const shapeItems = [
    { icon: CircleFilled, label: m.point(), iconSize: 16 },
    { icon: SquareFill, label: m.square(), iconSize: 16 },
    { icon: CaretUp, label: m.triangle(), iconSize: 16 }
  ];

  const shapeTypes = [ShapeType.POINT, ShapeType.SQUARE, ShapeType.TRIANGLE];

  const shapeIndex = $derived(shapeTypes.indexOf(shapeType));

  function handleShapeTabChange(index: number) {
    handleShapeTypeChange(shapeTypes[index] || ShapeType.POINT);
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
    {m.viz_symbols_representation()}
    <InfoPopover text={m.shape_info()} />
  </span>
  <ToggleTabs
    items={shapeItems}
    activeIndex={shapeIndex}
    onChange={handleShapeTabChange}
    hideInactiveLabel={true}
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
      items={dataFields}
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
      items={dataFields}
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
