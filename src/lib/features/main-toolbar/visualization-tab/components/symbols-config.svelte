<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    Column,
    Dropdown,
    Grid,
    RadioButton,
    RadioButtonGroup,
    Row,
    Select,
    SelectItem
  } from 'carbon-components-svelte';
  import {
    Category,
    ChartBubble,
    CircleFilled,
    Filter,
    MisuseOutline,
    SquareOutline,
    Tag
  } from 'carbon-icons-svelte';
  import {
    DEFAULT_COLORS,
    FillMode,
    MissingDataShape,
    ProportionalType,
    ShapeType,
    SLIDER_LIMITS,
    StrokeMode,
    SymbolMode,
    VISUALIZATION_DEFAULTS
  } from '../../constants';
  import type {
    MissingDataConfig,
    VisualizationConfig,
    VisualizationModes
  } from '$lib/features/commons/store/visualization.store.svelte';
  import {
    ColorSelector,
    DiscretizationRow,
    PalettePreview,
    SectionTitle,
    SliderWithInput,
    ToggleWithLabel
  } from './shared';
  import DiscretizationModal from './discretization-modal.svelte';
  import {
    ClassificationMethod,
    type ClassificationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';

  interface Props {
    dataFields?: Array<{ id: number; text: string }>;
    visualization?: VisualizationConfig;
    onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
    onModesChange?: (updates: Partial<VisualizationModes>) => void;
    onSymbolsChange?: (
      updates: Partial<VisualizationConfig['symbols']>
    ) => void;
    onMissingDataChange?: (updates: Partial<MissingDataConfig>) => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
    onInvertPalette?: () => void;
  }

  let {
    dataFields = [],
    visualization,
    onStyleChange,
    onModesChange,
    onSymbolsChange,
    onMissingDataChange,
    onClassificationChange,
    onInvertPalette
  }: Props = $props();

  let discretizationModalOpen = $state(false);

  let symbolMode = $state<SymbolMode>(SymbolMode.UNIQUE);
  let proportionalType = $state<ProportionalType>(ProportionalType.SINGLE);
  let fillMode = $state<FillMode>(FillMode.UNIQUE);
  let strokeMode = $state<StrokeMode>(StrokeMode.NONE);

  let selectedFieldId = $state<number>(0);
  let symbolSize = $state<number>(VISUALIZATION_DEFAULTS.symbolSize);
  let symbolMaxSize = $state<number>(VISUALIZATION_DEFAULTS.symbolMaxSize);
  let symbolOpacity = $state<number>(VISUALIZATION_DEFAULTS.symbolOpacity);
  let strokeWidth = $state<number>(VISUALIZATION_DEFAULTS.strokeWidth);
  let fillOpacity = $state<number>(VISUALIZATION_DEFAULTS.fillOpacity);
  let shapeType = $state<ShapeType>(ShapeType.POINT);
  let showMissingData = $state<boolean>(true);
  let missingDataShape = $state<MissingDataShape>(MissingDataShape.CIRCLE);
  let missingDataSize = $state<number>(2);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);
  let categoryCount = $state<number>(4);
  let strokeColorFieldId = $state<number>(0);
  let strokeCategoryCount = $state<number>(4);
  let fillPattern = $state<boolean>(false);
  let fillColor = $state<string>(DEFAULT_COLORS.fill);
  let strokeColor = $state<string>(DEFAULT_COLORS.stroke);

  $effect(() => {
    if (visualization?.style) {
      fillOpacity =
        visualization.style.fillOpacity !== undefined
          ? Math.round(visualization.style.fillOpacity * 100)
          : VISUALIZATION_DEFAULTS.fillOpacity;
      strokeWidth =
        visualization.style.strokeWidth ?? VISUALIZATION_DEFAULTS.strokeWidth;
      fillColor =
        (visualization.style.fillColor as string) ?? DEFAULT_COLORS.fill;
      strokeColor = visualization.style.strokeColor ?? DEFAULT_COLORS.stroke;
    }
    if (visualization?.symbols) {
      symbolSize =
        visualization.symbols.size ?? VISUALIZATION_DEFAULTS.symbolSize;
      symbolMaxSize =
        visualization.symbols.maxSize ?? VISUALIZATION_DEFAULTS.symbolMaxSize;
      symbolOpacity =
        visualization.symbols.opacity !== undefined
          ? Math.round(visualization.symbols.opacity * 100)
          : VISUALIZATION_DEFAULTS.symbolOpacity;
      shapeType = visualization.symbols.type ?? ShapeType.POINT;
    }
    if (visualization?.modes) {
      symbolMode = visualization.modes.symbol ?? SymbolMode.UNIQUE;
      fillMode = visualization.modes.fill ?? FillMode.UNIQUE;
      strokeMode = visualization.modes.stroke ?? StrokeMode.NONE;
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
  });

  const sequentialPalette = ['#c8ddf0', '#78a9cf', '#2171b5', '#084594'];
  const qualitativePalette = ['#009d9a', '#f1c21b', '#ff832b', '#a56eff'];

  const symbolModeItems = [
    { icon: CircleFilled, label: m.symbol_mode_unique(), iconSize: 16 },
    { icon: ChartBubble, label: m.symbol_mode_proportional(), iconSize: 16 },
    { icon: Category, label: m.symbol_mode_classes(), iconSize: 16 },
    { icon: Tag, label: m.symbol_mode_categories(), iconSize: 16 }
  ];

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

  function handleSymbolModeChange(index: number) {
    const modes = [
      SymbolMode.UNIQUE,
      SymbolMode.PROPORTIONAL,
      SymbolMode.CLASSES,
      SymbolMode.CATEGORIES
    ];
    symbolMode = modes[index] || SymbolMode.UNIQUE;
    onModesChange?.({ symbol: symbolMode });
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

  function handleSymbolSizeChange(value: number) {
    symbolSize = value;
    onSymbolsChange?.({ size: value });
  }

  function _handleSymbolMaxSizeChange(value: number) {
    symbolMaxSize = value;
    onSymbolsChange?.({ maxSize: value });
  }

  function _handleSymbolOpacityChange(value: number) {
    symbolOpacity = value;
    onSymbolsChange?.({ opacity: value / 100 });
  }

  function handleFillOpacityChange(value: number) {
    fillOpacity = value;
    onStyleChange?.({ fillOpacity: value / 100 });
  }

  function handleStrokeWidthChange(value: number) {
    strokeWidth = value;
    onStyleChange?.({ strokeWidth: value });
  }

  function handleShapeTypeChange(value: ShapeType) {
    shapeType = value;
    onSymbolsChange?.({ type: value });
  }

  function handleMissingDataShowChange(value: boolean) {
    showMissingData = value;
    onMissingDataChange?.({ show: value });
  }

  function _handleMissingDataShapeChange(value: MissingDataShape) {
    missingDataShape = value;
    onMissingDataChange?.({ shape: value });
  }

  function _handleMissingDataSizeChange(value: number) {
    missingDataSize = value;
    onMissingDataChange?.({ size: value });
  }

  function handleMissingDataColorChange(value: string) {
    missingDataColor = value;
    onMissingDataChange?.({ color: value });
  }

  function handleFillPatternChange(value: boolean) {
    fillPattern = value;
    onMissingDataChange?.({ pattern: value });
  }

  function handleFillColorChange(value: string) {
    fillColor = value;
    onStyleChange?.({ fillColor: value });
  }

  function handleStrokeColorChange(value: string) {
    strokeColor = value;
    onStyleChange?.({ strokeColor: value });
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
      [ClassificationMethod.STANDARD_DEVIATION]: m.discretization_method_stddev,
      [ClassificationMethod.MANUAL]: m.discretization_method_manual
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

  const symbolModeIndex = $derived(
    [
      SymbolMode.UNIQUE,
      SymbolMode.PROPORTIONAL,
      SymbolMode.CLASSES,
      SymbolMode.CATEGORIES
    ].indexOf(symbolMode)
  );

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
</script>

<ExpandableSection
  title={m.symbols_title()}
  defaultOpen
  showToggle
  toggleChecked={true}
>
  {#snippet icon()}
    <button type="button" class="filter-btn" aria-label={m.filter_data()}>
      <Filter size={16} />
    </button>
  {/snippet}

  <div class="symbols-config">
    <SectionTitle title={m.size_and_shape()} />

    <div class="field-group">
      <span class="field-label">{m.symbols_title()}</span>
      <ToggleTabs
        items={symbolModeItems}
        activeIndex={symbolModeIndex}
        onChange={handleSymbolModeChange}
        hideInactiveLabel={true}
      />
    </div>

    {#if symbolMode === SymbolMode.UNIQUE}
      <SliderWithInput
        label={m.size_label()}
        bind:value={symbolSize}
        min={SLIDER_LIMITS.symbolSize.min}
        max={SLIDER_LIMITS.symbolSize.max}
        onchange={handleSymbolSizeChange}
      />

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

      <SectionTitle title={m.background()} />

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
          onsettings={handleOpenDiscretization}
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

        <div class="missing-data-section">
          <ToggleWithLabel
            label={m.show_missing_data()}
            toggled={showMissingData}
            ontoggle={handleMissingDataShowChange}
          />
          {#if showMissingData}
            <ColorSelector
              label={m.color()}
              value={missingDataColor}
              size="small"
              onchange={handleMissingDataColorChange}
            />
            <ToggleWithLabel
              label={m.pattern()}
              toggled={fillPattern}
              ontoggle={handleFillPatternChange}
            />
          {/if}
        </div>
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
          onsettings={handleOpenDiscretization}
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

        <div class="missing-data-section">
          <ToggleWithLabel
            label={m.show_missing_data()}
            toggled={showMissingData}
            ontoggle={handleMissingDataShowChange}
          />
          {#if showMissingData}
            <ColorSelector
              label={m.color()}
              value={missingDataColor}
              size="small"
              onchange={handleMissingDataColorChange}
            />
            <ToggleWithLabel
              label={m.pattern()}
              toggled={fillPattern}
              ontoggle={handleFillPatternChange}
            />
          {/if}
        </div>
      {/if}

      <SectionTitle title={m.stroke()} />

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
          onsettings={handleOpenDiscretization}
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
          onsettings={handleOpenDiscretization}
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
    {:else if symbolMode === SymbolMode.PROPORTIONAL || symbolMode === SymbolMode.CLASSES}
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

      <SliderWithInput
        label={m.max_size()}
        bind:value={symbolMaxSize}
        min={SLIDER_LIMITS.symbolMaxSize.min}
        max={100}
      />

      {#if symbolMode === SymbolMode.CLASSES}
        <DiscretizationRow
          label={m.discretization()}
          value={discretizationLabel}
          onsettings={handleOpenDiscretization}
        />
      {/if}

      <div class="field-group">
        <Select id="shape-prop" labelText={m.shape()} bind:selected={shapeType}>
          <SelectItem value={ShapeType.POINT} text={m.point()} />
          <SelectItem value={ShapeType.SQUARE} text={m.square()} />
          <SelectItem value={ShapeType.TRIANGLE} text={m.triangle()} />
        </Select>
      </div>

      <div class="missing-data-section">
        <ToggleWithLabel
          label={m.show_missing_data()}
          bind:toggled={showMissingData}
        />
        {#if showMissingData}
          <Grid padding noGutter>
            <Row>
              <Column sm={2} md={4} lg={8}>
                <Select
                  id="missing-shape"
                  labelText={m.missing_data_representation()}
                  bind:selected={missingDataShape}
                  size="sm"
                >
                  <SelectItem
                    value={MissingDataShape.CIRCLE}
                    text={m.missing_data_shape_circle()}
                  />
                  <SelectItem
                    value={MissingDataShape.CROSS}
                    text={m.missing_data_shape_cross()}
                  />
                  <SelectItem
                    value={MissingDataShape.SQUARE}
                    text={m.missing_data_shape_square()}
                  />
                </Select>
              </Column>
              <Column sm={2} md={4} lg={8}>
                <ColorSelector
                  label={m.color()}
                  value={missingDataColor}
                  size="small"
                />
              </Column>
            </Row>
            <Row>
              <Column>
                <div class="slider-compact">
                  <SliderWithInput
                    label={m.size_label()}
                    bind:value={missingDataSize}
                    min={SLIDER_LIMITS.missingDataSize.min}
                    max={SLIDER_LIMITS.missingDataSize.max}
                  />
                </div>
              </Column>
            </Row>
          </Grid>
        {/if}
      </div>
    {:else if symbolMode === SymbolMode.CATEGORIES}
      <SectionTitle title={m.size_and_color()} />

      <div class="field-group">
        <Dropdown
          titleText={m.size_according()}
          items={dataFields}
          bind:selectedId={selectedFieldId}
          type="default"
        />
      </div>

      <DiscretizationRow
        label={m.category_aspect()}
        value={m.categories_count({ count: categoryCount })}
        onsettings={handleOpenDiscretization}
      />
      <PalettePreview
        label={m.color_palette()}
        colors={qualitativePalette}
        oninvert={onInvertPalette}
      />
      <SliderWithInput
        label={m.opacity()}
        bind:value={symbolOpacity}
        min={SLIDER_LIMITS.opacity.min}
        max={SLIDER_LIMITS.opacity.max}
      />

      <div class="missing-data-section">
        <ToggleWithLabel
          label={m.show_missing_data()}
          bind:toggled={showMissingData}
        />
        {#if showMissingData}
          <Grid padding noGutter>
            <Row>
              <Column sm={2} md={4} lg={8}>
                <Select
                  id="missing-shape-cat"
                  labelText={m.missing_data_representation()}
                  bind:selected={missingDataShape}
                  size="sm"
                >
                  <SelectItem
                    value={MissingDataShape.CIRCLE}
                    text={m.missing_data_shape_circle()}
                  />
                  <SelectItem
                    value={MissingDataShape.CROSS}
                    text={m.missing_data_shape_cross()}
                  />
                  <SelectItem
                    value={MissingDataShape.SQUARE}
                    text={m.missing_data_shape_square()}
                  />
                </Select>
              </Column>
              <Column sm={2} md={4} lg={8}>
                <ColorSelector
                  label={m.color()}
                  value={missingDataColor}
                  size="small"
                />
              </Column>
            </Row>
            <Row>
              <Column>
                <div class="slider-compact">
                  <SliderWithInput
                    label={m.size_label()}
                    bind:value={missingDataSize}
                    min={SLIDER_LIMITS.missingDataSize.min}
                    max={SLIDER_LIMITS.missingDataSize.max}
                  />
                </div>
              </Column>
            </Row>
          </Grid>
        {/if}
      </div>
    {/if}
  </div>
</ExpandableSection>

<DiscretizationModal
  bind:open={discretizationModalOpen}
  visualization={visualization}
  onchange={handleClassificationChange}
/>

<style lang="scss">
  .symbols-config {
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

  .field-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }

  .missing-data-section {
    margin-top: var(--cds-spacing-04);
    padding-top: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .slider-compact {
    margin-top: var(--cds-spacing-03);
  }

  .filter-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--cds-spacing-02);
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--cds-icon-01);

    &:hover {
      background: var(--cds-hover-ui);
    }
  }

  :global(.symbols-config .bx--dropdown) {
    max-width: 100%;
  }

  :global(.symbols-config .bx--select) {
    max-width: 100%;
  }

  :global(.symbols-config .bx--radio-button-group) {
    flex-direction: row;
  }
</style>
