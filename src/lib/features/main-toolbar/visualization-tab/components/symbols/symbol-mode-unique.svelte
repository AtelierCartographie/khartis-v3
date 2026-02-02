<script lang="ts">
  import { Dropdown, Select, SelectItem } from 'carbon-components-svelte';
  import {
    MisuseOutline,
    SquareOutline,
    Category,
    Tag
  } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    FillMode,
    ShapeType,
    StrokeMode,
    SLIDER_LIMITS,
    VISUALIZATION_DEFAULTS,
    DEFAULT_COLORS
  } from '../../../constants';
  import {
    ColorSelector,
    DiscretizationRow,
    PalettePreview,
    SectionHeading,
    SliderWithInput,
    MissingDataSection
  } from '../shared';
  import type { SymbolModeProps } from './types';

  let {
    dataFields = [],
    visualization,
    onStyleChange,
    onModesChange,
    onSymbolsChange,
    onMissingDataChange,
    onInvertPalette,
    onOpenDiscretization
  }: SymbolModeProps = $props();

  const sequentialPalette = ['#c8ddf0', '#78a9cf', '#2171b5', '#084594'];
  const qualitativePalette = ['#009d9a', '#f1c21b', '#ff832b', '#a56eff'];

  let fillMode = $state<FillMode>(FillMode.UNIQUE);
  let strokeMode = $state<StrokeMode>(StrokeMode.NONE);
  let symbolSize = $state<number>(VISUALIZATION_DEFAULTS.symbolSize);
  let shapeType = $state<ShapeType>(ShapeType.POINT);
  let fillColor = $state<string>(DEFAULT_COLORS.fill);
  let fillOpacity = $state<number>(VISUALIZATION_DEFAULTS.fillOpacity);
  let strokeColor = $state<string>(DEFAULT_COLORS.stroke);
  let strokeWidth = $state<number>(VISUALIZATION_DEFAULTS.strokeWidth);
  let showMissingData = $state<boolean>(true);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);
  let fillPattern = $state<boolean>(false);
  let selectedFieldId = $state<number>(0);
  let strokeColorFieldId = $state<number>(0);
  let categoryCount = $state<number>(4);
  let strokeCategoryCount = $state<number>(4);

  $effect(() => {
    if (visualization?.modes) {
      fillMode = visualization.modes.fill ?? FillMode.UNIQUE;
      strokeMode = visualization.modes.stroke ?? StrokeMode.NONE;
    }
    if (visualization?.style) {
      fillColor =
        (visualization.style.fillColor as string) ?? DEFAULT_COLORS.fill;
      fillOpacity =
        visualization.style.fillOpacity !== undefined
          ? Math.round(visualization.style.fillOpacity * 100)
          : VISUALIZATION_DEFAULTS.fillOpacity;
      strokeColor = visualization.style.strokeColor ?? DEFAULT_COLORS.stroke;
      strokeWidth =
        visualization.style.strokeWidth ?? VISUALIZATION_DEFAULTS.strokeWidth;
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
  });

  const fillModeItems = [
    { icon: MisuseOutline, label: m.fill_mode_none(), iconSize: 16 },
    { icon: SquareOutline, label: m.fill_mode_unique(), iconSize: 16 },
    { icon: Category, label: m.fill_mode_classes(), iconSize: 16 },
    { icon: Tag, label: m.fill_mode_categories(), iconSize: 16 }
  ];

  const strokeModeItems = [
    { icon: MisuseOutline, label: m.stroke_mode_none(), iconSize: 16 },
    { icon: SquareOutline, label: m.stroke_mode_unique(), iconSize: 16 },
    { icon: Category, label: m.stroke_mode_classes(), iconSize: 16 },
    { icon: Tag, label: m.stroke_mode_categories(), iconSize: 16 }
  ];

  const fillModeIndex = $derived(
    [
      FillMode.NONE,
      FillMode.UNIQUE,
      FillMode.CLASSES,
      FillMode.CATEGORIES
    ].indexOf(fillMode)
  );

  const strokeModeIndex = $derived(
    [
      StrokeMode.NONE,
      StrokeMode.UNIQUE,
      StrokeMode.CLASSES,
      StrokeMode.CATEGORIES
    ].indexOf(strokeMode)
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

  function handleStrokeModeChange(index: number) {
    const modes = [
      StrokeMode.NONE,
      StrokeMode.UNIQUE,
      StrokeMode.CLASSES,
      StrokeMode.CATEGORIES
    ];
    strokeMode = modes[index] || StrokeMode.NONE;
    onModesChange?.({ stroke: strokeMode });
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

  function handleStrokeColorChange(value: string) {
    strokeColor = value;
    onStyleChange?.({ strokeColor: value });
  }

  function handleStrokeWidthChange(value: number) {
    strokeWidth = value;
    onStyleChange?.({ strokeWidth: value });
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
</script>

<div class="field-row">
  <SliderWithInput
    label={m.size_label()}
    bind:value={symbolSize}
    min={SLIDER_LIMITS.symbolSize.min}
    max={SLIDER_LIMITS.symbolSize.max}
    onchange={handleSymbolSizeChange}
  />
</div>

<div class="field-group">
  <Select
    id="shape-unique"
    labelText={m.shape()}
    selected={shapeType}
    on:change={(e) => {
      const target = e.target as HTMLSelectElement;
      handleShapeTypeChange(target.value as ShapeType);
    }}
  >
    <SelectItem value={ShapeType.POINT} text={m.point()} />
    <SelectItem value={ShapeType.SQUARE} text={m.square()} />
    <SelectItem value={ShapeType.TRIANGLE} text={m.triangle()} />
  </Select>
</div>

<SectionHeading title={m.background()} />

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
      bind:selectedId={selectedFieldId}
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
    oninvert={onInvertPalette}
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
      bind:selectedId={selectedFieldId}
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
    oninvert={onInvertPalette}
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

<SectionHeading title={m.stroke()} />

<div class="field-group">
  <ToggleTabs
    items={strokeModeItems}
    activeIndex={strokeModeIndex}
    onChange={handleStrokeModeChange}
    hideInactiveLabel={true}
  />
</div>

{#if strokeMode === StrokeMode.UNIQUE}
  <SliderWithInput
    label={m.thickness()}
    bind:value={strokeWidth}
    min={1}
    max={SLIDER_LIMITS.strokeWidth.max}
    onchange={handleStrokeWidthChange}
  />
  <ColorSelector
    label={m.color()}
    value={strokeColor}
    onchange={handleStrokeColorChange}
  />
{:else if strokeMode === StrokeMode.CLASSES}
  <div class="field-group">
    <Dropdown
      titleText={m.color_according()}
      items={dataFields}
      bind:selectedId={strokeColorFieldId}
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
    oninvert={onInvertPalette}
  />
  <SliderWithInput
    label={m.thickness()}
    bind:value={strokeWidth}
    min={1}
    max={SLIDER_LIMITS.strokeWidth.max}
  />
{:else if strokeMode === StrokeMode.CATEGORIES}
  <div class="field-group">
    <Dropdown
      titleText={m.color_according()}
      items={dataFields}
      bind:selectedId={strokeColorFieldId}
      type="default"
    />
  </div>
  <DiscretizationRow
    label={m.category_aspect()}
    value={m.categories_count({ count: strokeCategoryCount })}
    onsettings={onOpenDiscretization}
  />
  <PalettePreview
    label={m.color_palette()}
    colors={qualitativePalette}
    oninvert={onInvertPalette}
  />
  <SliderWithInput
    label={m.thickness()}
    bind:value={strokeWidth}
    min={1}
    max={SLIDER_LIMITS.strokeWidth.max}
  />
{/if}

<style lang="scss">
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .field-row {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }
</style>
