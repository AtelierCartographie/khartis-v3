<script lang="ts">
  import {
    Dropdown,
    RadioButton,
    RadioButtonGroup
  } from 'carbon-components-svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    DEFAULT_SEQUENTIAL_PREVIEW,
    DEFAULT_QUALITATIVE_PREVIEW,
    PALETTE_TYPE
  } from '../palette-popover/palette.constants';
  import {
    MissingDataShape,
    ProportionalType,
    ShapeType,
    SLIDER_LIMITS,
    SymbolMode,
    VISUALIZATION_DEFAULTS,
    DEFAULT_COLORS,
    FillMode,
    availableShapesForSymbolMode
  } from '../../../constants';
  import {
    DiscretizationRow,
    InfoPopover,
    MissingDataSection,
    SectionHeading,
    SliderWithInput,
    PalettePreview,
    StrokeSection
  } from '../shared';
  import SingleColorPreview from '../palette-popover/single-color-preview.svelte';
  import type { SymbolModeProps } from './types';
  import {
    CaretUp,
    CircleFilled,
    SquareFill,
    MisuseOutline,
    Category,
    Tag
  } from 'carbon-icons-svelte';
  import DiscretizationModal from '../discretization-modal.svelte';
  import type { ClassificationConfig } from '$lib/features/commons/store/visualization.store.svelte';
  import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
  import { resolveDiscretizationLabel } from '../discretization.utils';
  import { facetsStore } from '$lib/features/step-toolbar/tools/facets/facets.store.svelte';
  import FacetsVariablePicker from './facets-variable-picker.svelte';

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
  let sizePickerOpen = $state(false);
  let classesPickerOpen = $state(false);
  let proportionalType = $state<ProportionalType>(ProportionalType.SINGLE);
  const NONE_FIELD_ID = -1;
  let selectedFieldId = $state<number>(NONE_FIELD_ID);
  let selectedFieldBId = $state<number>(NONE_FIELD_ID);
  let fillClassFieldId = $state<number>(NONE_FIELD_ID);
  let fillCategoryFieldId = $state<number>(NONE_FIELD_ID);
  let symbolMaxSize = $state<number>(VISUALIZATION_DEFAULTS.symbolMaxSize);
  let shapeType = $state<ShapeType>(ShapeType.CIRCLE);
  let showMissingData = $state<boolean>(true);
  let missingDataShape = $state<MissingDataShape>(MissingDataShape.CIRCLE);
  let missingDataSize = $state<number>(2);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);

  let categoryCount = $state<number>(4);
  let fillMode = $state<FillMode>(FillMode.UNIQUE);
  let fillColor = $state<string>(DEFAULT_COLORS.fill);
  let fillColorB = $state<string>(DEFAULT_COLORS.secondary);
  let fillOpacity = $state<number>(VISUALIZATION_DEFAULTS.fillOpacity);
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);
  let isSyncingFromVisualization = $state(true);
  let syncToken = 0;

  const currentPalette = $derived(
    visualization?.classification?.colors ?? DEFAULT_SEQUENTIAL_PREVIEW
  );
  const currentQualPalette = $derived(
    visualization?.classification?.colors ?? DEFAULT_QUALITATIVE_PREVIEW
  );

  $effect(() => {
    const currentSyncToken = ++syncToken;
    isSyncingFromVisualization = true;

    if (dataFields.length > 0 && visualization?.mapping) {
      const mappedFieldName =
        symbolMode === SymbolMode.PROPORTIONAL
          ? visualization.mapping.sizeColumn
          : visualization.mapping.valueColumn;

      if (mappedFieldName) {
        const fieldIndex = dataFields.findIndex(
          (field) => field.text === mappedFieldName
        );
        selectedFieldId =
          fieldIndex >= 0 ? dataFields[fieldIndex].id : NONE_FIELD_ID;
      } else {
        selectedFieldId = NONE_FIELD_ID;
      }

      if (visualization.mapping.valueColumn) {
        const fieldBIndex = dataFields.findIndex(
          (field) => field.text === visualization.mapping.valueColumn
        );
        selectedFieldBId =
          fieldBIndex >= 0 ? dataFields[fieldBIndex].id : NONE_FIELD_ID;
      } else {
        selectedFieldBId = NONE_FIELD_ID;
      }

      if (visualization.mapping.valueColumn) {
        const valueFieldIndex = dataFields.findIndex(
          (field) => field.text === visualization.mapping.valueColumn
        );
        fillClassFieldId =
          valueFieldIndex >= 0 ? dataFields[valueFieldIndex].id : NONE_FIELD_ID;
      } else {
        fillClassFieldId = NONE_FIELD_ID;
      }

      if (visualization.mapping.categoryColumn) {
        const categoryFieldIndex = dataFields.findIndex(
          (field) => field.text === visualization.mapping.categoryColumn
        );
        fillCategoryFieldId =
          categoryFieldIndex >= 0
            ? dataFields[categoryFieldIndex].id
            : NONE_FIELD_ID;
      } else {
        fillCategoryFieldId = NONE_FIELD_ID;
      }
    }

    if (visualization?.symbols) {
      symbolMaxSize =
        visualization.symbols.maxSize ?? VISUALIZATION_DEFAULTS.symbolMaxSize;
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
      missingDataShape =
        visualization.missingData.shape ?? MissingDataShape.CIRCLE;
      missingDataSize = visualization.missingData.size ?? 2;
      missingDataColor =
        visualization.missingData.color ?? DEFAULT_COLORS.missingData;
    }
    if (visualization?.modes) {
      fillMode = visualization.modes.fill ?? FillMode.UNIQUE;
      proportionalType =
        visualization.modes.proportionalType ?? ProportionalType.SINGLE;
    }
    if (visualization?.style) {
      fillColor =
        (visualization.style.symbolFillColor as string) ?? DEFAULT_COLORS.fill;
      fillColorB = visualization.style.fillColorB ?? DEFAULT_COLORS.secondary;
    }
    if (visualization?.classification) {
      categoryCount =
        visualization.classification.labels?.length ??
        visualization.classification.numClasses ??
        visualization.classification.classes ??
        4;
    }

    queueMicrotask(() => {
      if (syncToken === currentSyncToken) {
        isSyncingFromVisualization = false;
      }
    });
  });

  const discretizationLabel = $derived.by(() =>
    resolveDiscretizationLabel(
      visualization?.classification
        ? { ...visualization.classification }
        : undefined
    )
  );

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

  function handleProportionalTypeChange(type: ProportionalType) {
    if (isSyncingFromVisualization) {
      return;
    }
    if (type === proportionalType) {
      return;
    }
    proportionalType = type;
    onModesChange?.({ proportionalType: type });
  }

  function handleFieldBSelect(fieldId: number) {
    if (isSyncingFromVisualization) {
      return;
    }
    selectedFieldBId = fieldId;
    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ valueColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onMappingChange?.({ valueColumn: field.text });
    }
  }

  function handleFillColorBChange(value: string) {
    if (isSyncingFromVisualization) {
      return;
    }
    fillColorB = value;
    onStyleChange?.({ fillColorB: value });
  }

  const shapeDescriptors: Record<
    ShapeType,
    { icon: typeof CircleFilled; label: () => string }
  > = {
    [ShapeType.CIRCLE]: { icon: CircleFilled, label: m.shape_circle },
    [ShapeType.SQUARE]: { icon: SquareFill, label: m.shape_square },
    [ShapeType.BAR]: { icon: SquareFill, label: m.shape_bar },
    [ShapeType.SPIKE]: { icon: CaretUp, label: m.shape_spike },
    [ShapeType.CROSS]: { icon: CircleFilled, label: m.shape_cross },
    [ShapeType.DIAMOND]: { icon: CircleFilled, label: m.shape_diamond },
    [ShapeType.TRIANGLE]: { icon: CaretUp, label: m.shape_triangle },
    [ShapeType.STAR]: { icon: CircleFilled, label: m.shape_star },
    [ShapeType.RECTANGLE]: { icon: SquareFill, label: m.shape_rectangle }
  };

  const shapeTypes = $derived(availableShapesForSymbolMode(symbolMode));

  const shapeDropdownItems = $derived(
    shapeTypes.map((type) => ({
      id: type,
      text: shapeDescriptors[type].label()
    }))
  );

  function handleShapeTypeChange(value: ShapeType) {
    if (isSyncingFromVisualization) {
      return;
    }
    shapeType = value;
    onSymbolsChange?.({ type: value });
  }

  function handleShapeDropdownSelect(value: string | number) {
    const next = shapeTypes.find((type) => type === value) ?? ShapeType.CIRCLE;
    handleShapeTypeChange(next);
  }

  function handleMissingDataShowChange(show: boolean) {
    if (isSyncingFromVisualization) {
      return;
    }
    showMissingData = show;
    onMissingDataChange?.({ show });
  }

  function handleMissingDataShapeChange(shape: MissingDataShape) {
    if (isSyncingFromVisualization) {
      return;
    }
    missingDataShape = shape;
    onMissingDataChange?.({ shape });
  }

  function handleMissingDataSizeChange(size: number) {
    if (isSyncingFromVisualization) {
      return;
    }
    missingDataSize = size;
    onMissingDataChange?.({ size });
  }

  function handleMissingDataColorChange(color: string) {
    if (isSyncingFromVisualization) {
      return;
    }
    missingDataColor = color;
    onMissingDataChange?.({ color });
  }

  function handleFillModeChange(index: number) {
    if (isSyncingFromVisualization) {
      return;
    }
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
    if (isSyncingFromVisualization) {
      return;
    }
    fillColor = value;
    onStyleChange?.({ symbolFillColor: value });
  }

  function handleFillOpacityChange(value: number) {
    if (isSyncingFromVisualization) {
      return;
    }
    fillOpacity = value;
    onSymbolsChange?.({ opacity: value / 100 });
  }

  function handleSymbolMaxSizeChange(value: number) {
    if (isSyncingFromVisualization) {
      return;
    }
    symbolMaxSize = value;
    onSymbolsChange?.({ maxSize: value });
  }

  function handleFieldSelect(fieldId: number) {
    if (isSyncingFromVisualization) {
      return;
    }
    selectedFieldId = fieldId;
    if (fieldId === NONE_FIELD_ID) {
      if (symbolMode === SymbolMode.PROPORTIONAL) {
        onMappingChange?.({ sizeColumn: undefined });
      } else {
        onMappingChange?.({ valueColumn: undefined });
      }
      return;
    }

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
    if (isSyncingFromVisualization) {
      return;
    }
    onClassificationChange?.(classification);
  }

  function handleFillClassFieldSelect(fieldId: number) {
    if (isSyncingFromVisualization) {
      return;
    }
    fillClassFieldId = fieldId;
    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ valueColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onMappingChange?.({ valueColumn: field.text });
    }
  }

  function handleFillCategoryFieldSelect(fieldId: number) {
    if (isSyncingFromVisualization) {
      return;
    }
    fillCategoryFieldId = fieldId;
    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ categoryColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onMappingChange?.({ categoryColumn: field.text });
    }
  }

  const selectedVizId = $derived(visualizationStore.selectedVisualization?.id);

  const isFacetsActiveForViz = $derived(
    facetsStore.enabled &&
      selectedVizId !== undefined &&
      facetsStore.baseVisualizationId === selectedVizId
  );

  const facetsSelectedFieldIds = $derived.by(() => {
    if (!isFacetsActiveForViz) {
      return [] as number[];
    }
    return facetsStore.variables
      .map((name) => dataFields.find((f) => f.text === name)?.id)
      .filter((id): id is number => typeof id === 'number');
  });

  const sizeColumnName = $derived(
    dataFields.find((f) => f.id === selectedFieldId)?.text ?? ''
  );

  const valueColumnName = $derived(
    dataFields.find((f) => f.id === fillClassFieldId)?.text ?? ''
  );

  async function handleFacetsVariablesChange(
    baseVariableName: string,
    fieldIds: number[]
  ) {
    if (!selectedVizId) return;
    const variableNames = fieldIds
      .map((id) => dataFields.find((f) => f.id === id)?.text)
      .filter((name): name is string => Boolean(name));

    const hasBase = Boolean(baseVariableName);
    const merged =
      hasBase && !variableNames.includes(baseVariableName)
        ? [baseVariableName, ...variableNames]
        : variableNames;

    await facetsStore.updateVariables(selectedVizId, merged);
  }

  async function handleFacetsToggle(
    baseVariableName: string,
    enabled: boolean
  ) {
    if (!selectedVizId) return;
    if (!enabled) {
      facetsStore.disable();
      return;
    }

    const available = dataFields
      .map((f) => f.text)
      .filter((name): name is string => Boolean(name));
    const seed = baseVariableName ? [baseVariableName] : [];
    const candidates = seed.slice();
    for (const name of available) {
      if (candidates.length >= 2) break;
      if (!candidates.includes(name)) candidates.push(name);
    }
    if (candidates.length < 2) return;
    await facetsStore.updateVariables(selectedVizId, candidates);
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
    {#if proportionalType === ProportionalType.DOUBLE}
      <Dropdown
        items={selectableDataFields}
        selectedId={selectedFieldId}
        on:select={(e) => handleFieldSelect(e.detail.selectedId)}
        type="default"
      />
    {:else}
      <FacetsVariablePicker
        bind:open={sizePickerOpen}
        dataFields={dataFields}
        singleSelectItems={selectableDataFields}
        selectedFieldId={selectedFieldId}
        selectedFieldIds={facetsSelectedFieldIds}
        isCollectionEnabled={isFacetsActiveForViz}
        onSelect={handleFieldSelect}
        onCollectionChange={(ids) =>
          handleFacetsVariablesChange(sizeColumnName, ids)}
        onToggleCollection={(enabled) =>
          handleFacetsToggle(sizeColumnName, enabled)}
      />
    {/if}
  </div>

  {#if proportionalType === ProportionalType.DOUBLE}
    <div class="field-group">
      <span class="field-label">
        {m.symbol_variable_b()}
      </span>
      <Dropdown
        items={selectableDataFields}
        selectedId={selectedFieldBId}
        on:select={(e) => handleFieldBSelect(e.detail.selectedId)}
        type="default"
      />
    </div>
  {/if}
{/if}

{#if symbolMode === SymbolMode.CLASSES}
  <div class="field-group">
    <span class="field-label">
      {m.size_according()}
      <InfoPopover text={m.size_according_info()} />
    </span>
    <FacetsVariablePicker
      bind:open={classesPickerOpen}
      dataFields={dataFields}
      singleSelectItems={selectableDataFields}
      selectedFieldId={selectedFieldId}
      selectedFieldIds={facetsSelectedFieldIds}
      isCollectionEnabled={isFacetsActiveForViz}
      onSelect={handleFieldSelect}
      onCollectionChange={(ids) =>
        handleFacetsVariablesChange(valueColumnName, ids)}
      onToggleCollection={(enabled) =>
        handleFacetsToggle(valueColumnName, enabled)}
    />
  </div>
  <SliderWithInput
    label={m.max_size()}
    infoText={m.max_size_info()}
    bind:value={symbolMaxSize}
    min={SLIDER_LIMITS.symbolMaxSize.min}
    max={SLIDER_LIMITS.symbolMaxSize.max}
    onchange={handleSymbolMaxSizeChange}
  />
  <DiscretizationRow
    label={m.discretization()}
    value={discretizationLabel}
    onsettings={onOpenDiscretization}
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
        <SingleColorPreview
          label={m.symbol_color_a()}
          color={fillColor}
          onchange={handleFillColorChange}
        />
      </div>
      <div class="double-color-item double-color-b">
        <SingleColorPreview
          label={m.symbol_color_b()}
          color={fillColorB}
          onchange={handleFillColorBChange}
        />
      </div>
    </div>
  {:else}
    <SingleColorPreview
      label={m.color()}
      color={fillColor}
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
      items={selectableDataFields}
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
    paletteType={PALETTE_TYPE.SEQUENTIAL}
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
    onshowchange={handleMissingDataShowChange}
    oncolorchange={handleMissingDataColorChange}
  />
{:else if fillMode === FillMode.CATEGORIES}
  <div class="field-group">
    <Dropdown
      titleText={m.color_according()}
      items={selectableDataFields}
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
    paletteType={PALETTE_TYPE.QUALITATIVE}
    categoriesMode={true}
    categoryLabels={visualization?.classification?.labels ?? []}
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
    onshowchange={handleMissingDataShowChange}
    oncolorchange={handleMissingDataColorChange}
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
