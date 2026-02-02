<script lang="ts">
  import {
    Dropdown,
    RadioButton,
    RadioButtonGroup,
    Select,
    SelectItem
  } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    MissingDataShape,
    ProportionalType,
    ShapeType,
    SLIDER_LIMITS,
    SymbolMode,
    VISUALIZATION_DEFAULTS,
    DEFAULT_COLORS,
    FillMode,
    StrokeMode
  } from '../../../constants';
  import {
    DiscretizationRow,
    MissingDataSection,
    SectionHeading,
    SliderWithInput,
    ColorSelector,
    PalettePreview,
    ToggleWithLabel
  } from '../shared';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import type { SymbolModeProps } from './types';
  import {
    CircleFilled,
    CircleOutline,
    SquareOutline,
    MisuseOutline,
    Category,
    Tag
  } from 'carbon-icons-svelte';
  import DiscretizationModal from '../discretization-modal.svelte';
  import type { ClassificationConfig } from '$lib/features/commons/store/visualization.store.svelte';

  interface Props extends SymbolModeProps {
    symbolMode: SymbolMode.PROPORTIONAL | SymbolMode.CLASSES;
  }

  let {
    dataFields = [],
    visualization,
    symbolMode,
    onSymbolsChange,
    onMissingDataChange,
    onOpenDiscretization,
    onModesChange,
    onStyleChange,
    onInvertPalette
  }: Props = $props();

  let discretizationModalOpen = $state(false);
  let proportionalType = $state<ProportionalType>(ProportionalType.SINGLE);
  let selectedFieldId = $state<number>(0);
  let symbolMaxSize = $state<number>(VISUALIZATION_DEFAULTS.symbolMaxSize);
  let shapeType = $state<ShapeType>(ShapeType.POINT);
  let showMissingData = $state<boolean>(true);
  let missingDataShape = $state<MissingDataShape>(MissingDataShape.CIRCLE);
  let missingDataSize = $state<number>(2);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);

  // Fill mode states
  let fillMode = $state<FillMode>(FillMode.UNIQUE);
  let fillColor = $state<string>(DEFAULT_COLORS.fill);
  let fillOpacity = $state<number>(VISUALIZATION_DEFAULTS.fillOpacity);

  // Stroke mode states
  let strokeMode = $state<StrokeMode>(StrokeMode.UNIQUE);
  let strokeWidth = $state<number>(VISUALIZATION_DEFAULTS.strokeWidth);
  let strokeColor = $state<string>(DEFAULT_COLORS.stroke);
  let strokeOpacity = $state<number>(VISUALIZATION_DEFAULTS.strokeOpacity);
  let strokeDashed = $state<boolean>(false);

  $effect(() => {
    if (visualization?.symbols) {
      symbolMaxSize =
        visualization.symbols.maxSize ?? VISUALIZATION_DEFAULTS.symbolMaxSize;
      shapeType = visualization.symbols.type ?? ShapeType.POINT;
    }
    if (visualization?.missingData) {
      showMissingData = visualization.missingData.show ?? true;
      missingDataShape =
        visualization.missingData.shape ?? MissingDataShape.CIRCLE;
      missingDataSize = visualization.missingData.size ?? 2;
      missingDataColor =
        visualization.missingData.color ?? DEFAULT_COLORS.missingData;
    }
    if (visualization?.modes) {
      fillMode = visualization.modes.fill ?? FillMode.UNIQUE;
      strokeMode = visualization.modes.stroke ?? StrokeMode.UNIQUE;
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
      strokeOpacity =
        visualization.style.strokeOpacity !== undefined
          ? Math.round(visualization.style.strokeOpacity * 100)
          : VISUALIZATION_DEFAULTS.strokeOpacity;
      strokeDashed = visualization.style.strokeDashed ?? false;
    }
  });

  const discretizationLabel = $derived.by(() => {
    if (!visualization?.classification) return m.discretization_method_jenks();
    const numClasses =
      visualization.classification.numClasses ??
      visualization.classification.classes ??
      5;
    return `${m.discretization_method_quantile()}, ${numClasses} ${m.discretization_num_classes().toLowerCase()}`;
  });

  const sequentialPalette = ['#c8ddf0', '#78a9cf', '#2171b5', '#084594'];
  const qualitativePalette = ['#009d9a', '#f1c21b', '#ff832b', '#a56eff'];

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

  function handleShapeTypeChange(value: ShapeType) {
    shapeType = value;
    onSymbolsChange?.({ type: value });
  }

  function handleMissingDataShowChange(show: boolean) {
    showMissingData = show;
    onMissingDataChange?.({ show });
  }

  function handleMissingDataShapeChange(shape: MissingDataShape) {
    missingDataShape = shape;
    onMissingDataChange?.({ shape });
  }

  function handleMissingDataSizeChange(size: number) {
    missingDataSize = size;
    onMissingDataChange?.({ size });
  }

  function handleMissingDataColorChange(color: string) {
    missingDataColor = color;
    onMissingDataChange?.({ color });
  }

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

  function handleStrokeOpacityChange(value: number) {
    strokeOpacity = value;
    onStyleChange?.({ strokeOpacity: value / 100 });
  }

  function handleStrokeDashedChange(value: boolean) {
    strokeDashed = value;
    onStyleChange?.({ strokeDashed: value });
  }

  function handleFieldSelect(fieldId: number) {
    selectedFieldId = fieldId;
  }

  function handleClassificationChange(
    _classification: Partial<ClassificationConfig>
  ) {
    // This would be implemented if needed
  }
</script>

<SectionHeading title={m.size_and_shape()} />

<div class="field-group">
  <span class="field-label">{m.symbols_title()}</span>
  <ToggleTabs
    items={[
      { icon: CircleFilled, label: m.symbol_mode_unique(), iconSize: 16 },
      {
        icon: CircleOutline,
        label: m.symbol_mode_proportional(),
        iconSize: 16
      },
      { icon: Category, label: m.symbol_mode_classes(), iconSize: 16 },
      { icon: Tag, label: m.symbol_mode_categories(), iconSize: 16 }
    ]}
    activeIndex={[
      SymbolMode.UNIQUE,
      SymbolMode.PROPORTIONAL,
      SymbolMode.CLASSES,
      SymbolMode.CATEGORIES
    ].indexOf(symbolMode)}
    onChange={(index) => {
      const modes = [
        SymbolMode.UNIQUE,
        SymbolMode.PROPORTIONAL,
        SymbolMode.CLASSES,
        SymbolMode.CATEGORIES
      ];
      onModesChange?.({ symbol: modes[index] });
    }}
    hideInactiveLabel={true}
  />
</div>

<SliderWithInput
  label={m.max_size()}
  bind:value={symbolMaxSize}
  min={SLIDER_LIMITS.symbolMaxSize.min}
  max={SLIDER_LIMITS.symbolMaxSize.max}
/>

<div class="field-group">
  <Select
    id="shape-prop"
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

{#if symbolMode === SymbolMode.PROPORTIONAL}
  <div class="field-group">
    <RadioButtonGroup
      legendText={m.proportional_symbols_label()}
      bind:selected={proportionalType}
    >
      <RadioButton
        id="prop-single"
        value={ProportionalType.SINGLE}
        labelText={m.unique()}
      />
      <RadioButton
        id="prop-double"
        value={ProportionalType.DOUBLE}
        labelText={m.double()}
      />
    </RadioButtonGroup>
  </div>

  <div class="field-group">
    <Dropdown
      titleText={m.size_according()}
      items={dataFields}
      bind:selectedId={selectedFieldId}
      type="default"
    />
  </div>
{/if}

{#if symbolMode === SymbolMode.CLASSES}
  <DiscretizationRow
    label={m.discretization()}
    value={discretizationLabel}
    onsettings={onOpenDiscretization}
  />
{/if}

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
    value={m.categories_count({ count: 4 })}
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

{#if strokeMode !== StrokeMode.NONE}
  <SliderWithInput
    label={m.thickness()}
    bind:value={strokeWidth}
    min={1}
    max={SLIDER_LIMITS.strokeWidth.max}
    onchange={handleStrokeWidthChange}
  />

  {#if strokeMode === StrokeMode.UNIQUE}
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
        selectedId={selectedFieldId}
        on:select={(e) => handleFieldSelect(e.detail.selectedId)}
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
  {:else if strokeMode === StrokeMode.CATEGORIES}
    <div class="field-group">
      <Dropdown
        titleText={m.color_according()}
        items={dataFields}
        selectedId={selectedFieldId}
        on:select={(e) => handleFieldSelect(e.detail.selectedId)}
        type="default"
      />
    </div>
    <DiscretizationRow
      label={m.category_aspect()}
      value={m.categories_count({ count: 4 })}
      onsettings={onOpenDiscretization}
    />
    <PalettePreview
      label={m.color_palette()}
      colors={qualitativePalette}
      oninvert={onInvertPalette}
    />
  {/if}

  <ToggleWithLabel
    label={m.dashed()}
    toggled={strokeDashed}
    ontoggle={handleStrokeDashedChange}
  />

  <SliderWithInput
    label={m.opacity()}
    bind:value={strokeOpacity}
    min={SLIDER_LIMITS.opacity.min}
    max={SLIDER_LIMITS.opacity.max}
    onchange={handleStrokeOpacityChange}
  />
{/if}

<MissingDataSection
  bind:show={showMissingData}
  color={missingDataColor}
  shape={missingDataShape}
  size={missingDataSize}
  showShapeSelector={true}
  showSizeSlider={true}
  onshowchange={handleMissingDataShowChange}
  onshapechange={handleMissingDataShapeChange}
  onsizechange={handleMissingDataSizeChange}
  oncolorchange={handleMissingDataColorChange}
/>

<DiscretizationModal
  bind:open={discretizationModalOpen}
  visualization={visualization}
  onchange={handleClassificationChange}
/>

<style lang="scss">
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .field-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }

  :global(.field-group .bx--radio-button-group) {
    flex-direction: row;
  }

  :global(.field-group .bx--dropdown) {
    max-width: 100%;
  }
</style>
