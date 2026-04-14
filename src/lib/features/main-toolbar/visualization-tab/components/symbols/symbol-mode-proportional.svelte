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
    DEFAULT_SEQUENTIAL_PREVIEW,
    DEFAULT_QUALITATIVE_PREVIEW
  } from '../palette-popover/palette.constants';
  import {
    MissingDataShape,
    ProportionalType,
    ShapeType,
    SLIDER_LIMITS,
    SymbolMode,
    VISUALIZATION_DEFAULTS,
    DEFAULT_COLORS,
    FillMode
  } from '../../../constants';
  import { ScaleType } from '$lib/features/commons/store/visualization.store.svelte';
  import {
    DiscretizationRow,
    InfoPopover,
    MissingDataSection,
    SectionHeading,
    SliderWithInput,
    ColorSelector,
    PalettePreview,
    StrokeSection
  } from '../shared';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import type { SymbolModeProps } from './types';
  import {
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
    onMappingChange,
    onClassificationChange,
    onMissingDataChange,
    onOpenDiscretization,
    onModesChange,
    onStyleChange,
    onInvertPalette
  }: Props = $props();

  let discretizationModalOpen = $state(false);
  let proportionalType = $state<ProportionalType>(ProportionalType.SINGLE);
  let selectedFieldId = $state<number>(0);
  let selectedFieldBId = $state<number>(0);
  let fillClassFieldId = $state<number>(0);
  let fillCategoryFieldId = $state<number>(0);
  let symbolMaxSize = $state<number>(VISUALIZATION_DEFAULTS.symbolMaxSize);
  let shapeType = $state<ShapeType>(ShapeType.CIRCLE);
  let sizeScale = $state<ScaleType>(ScaleType.SQRT);
  let showMissingData = $state<boolean>(true);
  let missingDataShape = $state<MissingDataShape>(MissingDataShape.CIRCLE);
  let missingDataSize = $state<number>(2);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);

  // Fill mode states
  let categoryCount = $state<number>(4);
  let fillMode = $state<FillMode>(FillMode.UNIQUE);
  let fillColor = $state<string>(DEFAULT_COLORS.fill);
  let fillColorB = $state<string>('#ff832b');
  let fillOpacity = $state<number>(VISUALIZATION_DEFAULTS.fillOpacity);
  let fillPattern = $state<boolean>(false);

  const currentPalette = $derived(
    visualization?.classification?.colors ?? DEFAULT_SEQUENTIAL_PREVIEW
  );
  const currentQualPalette = $derived(
    visualization?.classification?.colors ?? DEFAULT_QUALITATIVE_PREVIEW
  );

  $effect(() => {
    if (dataFields.length > 0 && visualization?.mapping) {
      const mappedFieldName =
        symbolMode === SymbolMode.PROPORTIONAL
          ? visualization.mapping.sizeColumn
          : visualization.mapping.valueColumn;

      if (mappedFieldName) {
        const fieldIndex = dataFields.findIndex(
          (field) => field.text === mappedFieldName
        );
        if (fieldIndex >= 0) {
          selectedFieldId = dataFields[fieldIndex].id;
        }
      }

      if (visualization.mapping.valueColumn) {
        const fieldBIndex = dataFields.findIndex(
          (field) => field.text === visualization.mapping.valueColumn
        );
        if (fieldBIndex >= 0) {
          selectedFieldBId = dataFields[fieldBIndex].id;
        }
      }

      if (visualization.mapping.valueColumn) {
        const valueFieldIndex = dataFields.findIndex(
          (field) => field.text === visualization.mapping.valueColumn
        );
        if (valueFieldIndex >= 0) {
          fillClassFieldId = dataFields[valueFieldIndex].id;
        }
      }

      if (visualization.mapping.categoryColumn) {
        const categoryFieldIndex = dataFields.findIndex(
          (field) => field.text === visualization.mapping.categoryColumn
        );
        if (categoryFieldIndex >= 0) {
          fillCategoryFieldId = dataFields[categoryFieldIndex].id;
        }
      }
    }

    if (visualization?.symbols) {
      symbolMaxSize =
        visualization.symbols.maxSize ?? VISUALIZATION_DEFAULTS.symbolMaxSize;
      shapeType = visualization.symbols.type ?? ShapeType.CIRCLE;
      sizeScale = visualization.symbols.sizeScale ?? ScaleType.SQRT;
    }
    if (visualization?.missingData) {
      showMissingData = visualization.missingData.show ?? true;
      missingDataShape =
        visualization.missingData.shape ?? MissingDataShape.CIRCLE;
      missingDataSize = visualization.missingData.size ?? 2;
      missingDataColor =
        visualization.missingData.color ?? DEFAULT_COLORS.missingData;
      fillPattern = visualization.missingData.pattern ?? false;
    }
    if (visualization?.modes) {
      fillMode = visualization.modes.fill ?? FillMode.UNIQUE;
      proportionalType =
        visualization.modes.proportionalType ?? ProportionalType.SINGLE;
    }
    if (visualization?.style) {
      fillColor =
        (visualization.style.fillColor as string) ?? DEFAULT_COLORS.fill;
      fillColorB = visualization.style.fillColorB ?? '#ff832b';
      fillOpacity =
        visualization.style.fillOpacity !== undefined
          ? Math.round(visualization.style.fillOpacity * 100)
          : VISUALIZATION_DEFAULTS.fillOpacity;
    }
    if (visualization?.classification) {
      categoryCount =
        visualization.classification.labels?.length ??
        visualization.classification.numClasses ??
        visualization.classification.classes ??
        4;
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

  function handleProportionalTypeChange(type: ProportionalType) {
    proportionalType = type;
    onModesChange?.({ proportionalType: type });
  }

  function handleFieldBSelect(fieldId: number) {
    selectedFieldBId = fieldId;
    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onMappingChange?.({ valueColumn: field.text });
    }
  }

  function handleFillColorBChange(value: string) {
    fillColorB = value;
    onStyleChange?.({ fillColorB: value });
  }

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

  function handleFillPatternChange(value: boolean) {
    fillPattern = value;
    onMissingDataChange?.({ pattern: value });
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

  function handleFillColorChange(value: string) {
    fillColor = value;
    onStyleChange?.({ fillColor: value });
  }

  function handleFillOpacityChange(value: number) {
    fillOpacity = value;
    onStyleChange?.({ fillOpacity: value / 100 });
  }

  function handleSymbolMaxSizeChange(value: number) {
    symbolMaxSize = value;
    onSymbolsChange?.({ maxSize: value });
  }

  function handleFieldSelect(fieldId: number) {
    selectedFieldId = fieldId;
    const field = dataFields.find((f) => f.id === fieldId);
    if (field) {
      if (symbolMode === SymbolMode.PROPORTIONAL) {
        onMappingChange?.({ sizeColumn: field.text });
      } else {
        onMappingChange?.({ valueColumn: field.text });
      }
    }
  }

  function handleClassificationChange(
    classification: Partial<ClassificationConfig>
  ) {
    onClassificationChange?.(classification);
  }

  function handleFillClassFieldSelect(fieldId: number) {
    fillClassFieldId = fieldId;
    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onMappingChange?.({ valueColumn: field.text });
    }
  }

  function handleFillCategoryFieldSelect(fieldId: number) {
    fillCategoryFieldId = fieldId;
    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onMappingChange?.({ categoryColumn: field.text });
    }
  }

  function handleShapeSelectChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    handleShapeTypeChange(target.value as ShapeType);
  }

  function handleScaleTypeChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    sizeScale = target.value as ScaleType;
    onSymbolsChange?.({ sizeScale });
  }
</script>

{#if symbolMode === SymbolMode.PROPORTIONAL}
  <div class="field-group">
    <span class="field-label">
      {m.proportional_symbols_label()}
      <InfoPopover text={m.proportional_type_info()} />
    </span>
    <RadioButtonGroup
      selected={proportionalType}
      on:change={(e) =>
        handleProportionalTypeChange(e.detail as ProportionalType)}
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
    <span class="field-label">
      {proportionalType === ProportionalType.DOUBLE
        ? m.symbol_variable_a()
        : m.size_according()}
      <InfoPopover text={m.size_according_info()} />
    </span>
    <Dropdown
      items={dataFields}
      selectedId={selectedFieldId}
      on:select={(e) => handleFieldSelect(e.detail.selectedId)}
      type="default"
    />
  </div>

  {#if proportionalType === ProportionalType.DOUBLE}
    <div class="field-group">
      <span class="field-label">
        {m.symbol_variable_b()}
      </span>
      <Dropdown
        items={dataFields}
        selectedId={selectedFieldBId}
        on:select={(e) => handleFieldBSelect(e.detail.selectedId)}
        type="default"
      />
    </div>
  {/if}
{/if}

<SliderWithInput
  label={m.max_size()}
  infoText={m.max_size_info()}
  bind:value={symbolMaxSize}
  min={SLIDER_LIMITS.symbolMaxSize.min}
  max={SLIDER_LIMITS.symbolMaxSize.max}
  onchange={handleSymbolMaxSizeChange}
/>

{#if symbolMode === SymbolMode.PROPORTIONAL}
  <div class="field-group">
    <span class="field-label">
      {m.scale_type()}
      <InfoPopover text={m.scale_type_info()} />
    </span>
    <Select
      id="scale-type"
      hideLabel
      selected={sizeScale}
      size="sm"
      on:change={handleScaleTypeChange}
    >
      <SelectItem value={ScaleType.LINEAR} text={m.scale_linear()} />
      <SelectItem value={ScaleType.SQRT} text={m.scale_sqrt()} />
      <SelectItem value={ScaleType.LOG} text={m.scale_log()} />
    </Select>
  </div>
{/if}

{#if symbolMode === SymbolMode.CLASSES}
  <div class="field-group">
    <span class="field-label">
      {m.size_according()}
      <InfoPopover text={m.size_according_info()} />
    </span>
    <Dropdown
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
{/if}

<div class="field-group">
  <span class="field-label">
    {m.shape()}
    <InfoPopover text={m.shape_info()} />
  </span>
  <Select
    id="shape-type"
    hideLabel
    selected={shapeType}
    size="sm"
    on:change={handleShapeSelectChange}
  >
    <SelectItem value={ShapeType.CIRCLE} text={m.shape_circle()} />
    <SelectItem value={ShapeType.SQUARE} text={m.shape_square()} />
    <SelectItem value={ShapeType.BAR} text={m.shape_bar()} />
    <SelectItem value={ShapeType.SPIKE} text={m.shape_spike()} />
  </Select>
</div>

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
  {#if proportionalType === ProportionalType.DOUBLE}
    <div class="double-color-row">
      <div class="double-color-item double-color-a">
        <ColorSelector
          label={m.symbol_color_a()}
          value={fillColor}
          onchange={handleFillColorChange}
        />
      </div>
      <div class="double-color-item double-color-b">
        <ColorSelector
          label={m.symbol_color_b()}
          value={fillColorB}
          onchange={handleFillColorBChange}
        />
      </div>
    </div>
  {:else}
    <ColorSelector
      label={m.color()}
      value={fillColor}
      onchange={handleFillColorChange}
    />
  {/if}
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
      selectedId={fillClassFieldId}
      on:select={(e) => handleFillClassFieldSelect(e.detail.selectedId)}
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
    colors={currentPalette}
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
      selectedId={fillCategoryFieldId}
      on:select={(e) => handleFillCategoryFieldSelect(e.detail.selectedId)}
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
    colors={currentQualPalette}
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
  onOpenDiscretization={() => (discretizationModalOpen = true)}
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

  .double-color-row {
    display: flex;
    gap: var(--cds-spacing-03);
  }

  .double-color-item {
    flex: 1;
    min-width: 0;
  }

  .double-color-a :global(.color-selector-label) {
    color: var(--cds-interactive);
  }

  .double-color-b :global(.color-selector-label) {
    color: #ff832b;
  }

  .field-label {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
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

  :global(.field-group .bx--select) {
    max-width: 100%;
  }
</style>
