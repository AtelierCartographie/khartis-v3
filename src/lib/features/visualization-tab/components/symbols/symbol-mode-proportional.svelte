<script lang="ts">
  import SimpleRadioGroup from '$lib/features/commons/components/simple-radio-group.svelte';
  import DoubleModeControls from './proportional/double-mode-controls.svelte';
  import ProportionalScaleSection from './proportional/proportional-scale-section.svelte';
  import ProportionalDoubleSection from './proportional/proportional-double-section.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    MissingDataShape,
    ProportionalType,
    ShapeType,
    SLIDER_LIMITS,
    SymbolDoublePosition,
    SymbolMode,
    VISUALIZATION_DEFAULTS,
    DEFAULT_COLORS,
    FillMode,
    DEFAULT_LINEAR_SYMBOL_BAR_WIDTH,
    isLinearShape
  } from '$lib/features/commons/constants/visualization.constants';
  import {
    DiscretizationRow,
    InfoPopover,
    MissingDataSection,
    SliderWithInput,
    StrokeSection
  } from '../shared';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import type { SymbolModeProps } from '../../types/symbol.types';
  import FillSection from '../shared/fill-section.svelte';
  import { FILL_MODES_FOR_SYMBOLS } from '../shared/fill-mode-presets';
  import DiscretizationModal from '../discretization/discretization-modal.svelte';
  import type { ClassificationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
  import { resolveDiscretizationLabel } from '../discretization/discretization.utils';
  import { FACET_SLOT } from '../../adapters/facets-adapter';
  import {
    NONE_FIELD_ID,
    filterFieldsByKind,
    useFieldSelectionHandler
  } from '../../hooks/use-field-selection.svelte';
  import { useFacetsVariableSelection } from '../../hooks/use-facets-variable-selection.svelte';
  import { resetVisualClassification } from '../shared/classification-reset.utils';
  import {
    buildSymbolShapeDropdownItems,
    getSymbolShapeTypes
  } from './symbol-shape-options';
  import {
    coerceShapeType,
    coerceString,
    parseOpacityToSlider
  } from '../../utils/coerce.utils';
  import { getDefaultScaleForShape } from './scale-by-shape.utils';

  interface Props extends SymbolModeProps {
    symbolMode: SymbolMode.PROPORTIONAL | SymbolMode.CLASSES;
  }

  let {
    dataFields = [],
    visualization,
    fillVisualization,
    symbolMode,
    onSymbolsChange,
    onSymbolPrimitiveChange,
    onMappingChange,
    onFillMappingChange,
    onStrokeMappingChange,
    onFillClassificationChange,
    onStrokeClassificationChange,
    onMissingDataChange,
    onOpenSizeDiscretization,
    onOpenFillDiscretization,
    onModesChange,
    onStyleChange,
    onFillInvertPalette,
    onStrokeInvertPalette
  }: Props = $props();

  let discretizationModalOpen = $state(false);
  let sizePickerOpen = $state(false);
  let fieldBPickerOpen = $state(false);
  let classesPickerOpen = $state(false);
  let proportionalType = $state<ProportionalType>(ProportionalType.SINGLE);
  let symbolMaxSize = $state<number>(VISUALIZATION_DEFAULTS.symbolMaxSize);
  let barWidth = $state<number>(DEFAULT_LINEAR_SYMBOL_BAR_WIDTH);
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
  let commonScale = $state<boolean>(true);
  let positionMode = $state<SymbolDoublePosition>(SymbolDoublePosition.OVERLAY);
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);
  const primaryFieldSelection = useFieldSelectionHandler({
    getDataFields: () => dataFields,
    columnKey: () =>
      symbolMode === SymbolMode.PROPORTIONAL ? 'sizeColumn' : 'valueColumn',
    onMappingChange: (updates) =>
      runUserChange(() => onMappingChange?.(updates))
  });
  const secondaryValueFieldSelection = useFieldSelectionHandler({
    getDataFields: () => dataFields,
    columnKey: 'valueColumn',
    onMappingChange: (updates) =>
      runUserChange(() => onMappingChange?.(updates))
  });
  const fillClassFieldSelection = useFieldSelectionHandler({
    getDataFields: () => dataFields,
    columnKey: 'valueColumn',
    onMappingChange: (updates) =>
      runUserChange(() => onFillMappingChange?.(updates))
  });
  const fillCategoryFieldSelection = useFieldSelectionHandler({
    getDataFields: () => dataFields,
    columnKey: 'categoryColumn',
    onMappingChange: (updates) =>
      runUserChange(() => onFillMappingChange?.(updates))
  });
  const selectableNumericDataFields = $derived(
    filterFieldsByKind(
      selectableDataFields,
      'numeric',
      primaryFieldSelection.selectedFieldId
    )
  );
  const selectableSecondaryNumericDataFields = $derived(
    filterFieldsByKind(
      selectableDataFields,
      'numeric',
      secondaryValueFieldSelection.selectedFieldId
    )
  );
  const facetsSelection = useFacetsVariableSelection({
    getVisualizationId: () => visualization?.id,
    getDataFields: () => dataFields
  });
  let isSyncingFromVisualization = $state(true);
  let syncToken = 0;

  function runUserChange<T>(callback: () => T): T | undefined {
    if (isSyncingFromVisualization) {
      return undefined;
    }
    return callback();
  }

  $effect(() => {
    const currentSyncToken = ++syncToken;
    isSyncingFromVisualization = true;

    if (dataFields.length > 0 && visualization?.mapping) {
      const sym = visualization.symbol;
      const sizeCol = sym?.sizeColumn ?? visualization.mapping.sizeColumn;
      const valueCol = sym?.valueColumn ?? visualization.mapping.valueColumn;
      const mappedFieldName =
        symbolMode === SymbolMode.PROPORTIONAL ? sizeCol : valueCol;

      primaryFieldSelection.sync(mappedFieldName);
      secondaryValueFieldSelection.sync(valueCol);
      fillClassFieldSelection.sync(fillVisualization?.mapping.valueColumn);
      fillCategoryFieldSelection.sync(
        fillVisualization?.mapping.categoryColumn
      );
    }

    const symbolConfig = visualization?.symbol;
    if (symbolConfig) {
      symbolMaxSize =
        symbolConfig.maxSize ?? VISUALIZATION_DEFAULTS.symbolMaxSize;
      barWidth = symbolConfig.barWidth ?? DEFAULT_LINEAR_SYMBOL_BAR_WIDTH;
      shapeType = coerceShapeType(symbolConfig.shape) ?? ShapeType.CIRCLE;
      fillOpacity = parseOpacityToSlider(
        symbolConfig.opacity,
        VISUALIZATION_DEFAULTS.symbolOpacity
      );
    } else if (visualization?.symbols) {
      symbolMaxSize =
        visualization.symbols.maxSize ?? VISUALIZATION_DEFAULTS.symbolMaxSize;
      barWidth =
        visualization.symbols.barWidth ?? DEFAULT_LINEAR_SYMBOL_BAR_WIDTH;
      shapeType = visualization.symbols.type ?? ShapeType.CIRCLE;
      fillOpacity = parseOpacityToSlider(
        visualization.symbols.opacity,
        VISUALIZATION_DEFAULTS.symbolOpacity
      );
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
    if (symbolConfig) {
      fillMode = symbolConfig.fillMode ?? FillMode.UNIQUE;
      proportionalType =
        symbolConfig.proportionalType ?? ProportionalType.SINGLE;
      fillColor = coerceString(symbolConfig.fillColor) ?? DEFAULT_COLORS.fill;
      fillColorB =
        coerceString(symbolConfig.fillColorB) ?? DEFAULT_COLORS.secondary;
    } else {
      if (visualization?.modes) {
        fillMode = visualization.modes.fill ?? FillMode.UNIQUE;
        proportionalType =
          visualization.modes.proportionalType ?? ProportionalType.SINGLE;
      }
      if (visualization?.style) {
        fillColor =
          coerceString(visualization.style.symbolFillColor) ??
          DEFAULT_COLORS.fill;
        fillColorB = visualization.style.fillColorB ?? DEFAULT_COLORS.secondary;
      }
    }
    if (fillVisualization?.classification) {
      categoryCount =
        fillVisualization.classification.labels?.length ??
        fillVisualization.classification.numClasses ??
        fillVisualization.classification.classes ??
        4;
    }
    if (visualization?.symbol) {
      commonScale = visualization.symbol.commonScale ?? true;
      const nextPositionMode =
        visualization.symbol.positionMode ?? SymbolDoublePosition.OVERLAY;
      positionMode =
        nextPositionMode === SymbolDoublePosition.JUXTAPOSITION
          ? SymbolDoublePosition.OVERLAY
          : nextPositionMode;
      if (
        nextPositionMode === SymbolDoublePosition.JUXTAPOSITION &&
        (visualization.symbol.proportionalType ?? proportionalType) ===
          ProportionalType.DOUBLE
      ) {
        queueMicrotask(() => {
          onSymbolPrimitiveChange?.({
            positionMode: SymbolDoublePosition.OVERLAY
          });
        });
      }
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

  const fillDiscretizationLabel = $derived.by(() =>
    resolveDiscretizationLabel(
      fillVisualization?.classification
        ? { ...fillVisualization.classification }
        : undefined
    )
  );

  const strokeDiscretizationLabel = $derived.by(() =>
    resolveDiscretizationLabel(
      visualization?.symbol?.strokeClassification
        ? { ...visualization.symbol.strokeClassification }
        : undefined
    )
  );

  function handleProportionalTypeChange(type: ProportionalType) {
    runUserChange(() => {
      if (type === proportionalType) {
        return;
      }
      proportionalType = type;
      onModesChange?.({ proportionalType: type });
      if (type === ProportionalType.SINGLE) {
        onMappingChange?.({ valueColumn: undefined });
        secondaryValueFieldSelection.set(NONE_FIELD_ID);
        fillColorB = DEFAULT_COLORS.secondary;
        onSymbolPrimitiveChange?.({
          commonScale: true,
          positionMode: SymbolDoublePosition.OVERLAY,
          breakValueA: null,
          breakValueB: null
        });
        onStyleChange?.({ fillColorB: DEFAULT_COLORS.secondary });
      } else {
        if (isLinearShape(shapeType)) {
          handleShapeTypeChange(ShapeType.CIRCLE);
        }
        if (positionMode === SymbolDoublePosition.JUXTAPOSITION) {
          positionMode = SymbolDoublePosition.OVERLAY;
          onSymbolPrimitiveChange?.({
            positionMode: SymbolDoublePosition.OVERLAY
          });
        }
      }
    });
  }

  function handleFillColorBChange(value: string) {
    runUserChange(() => {
      fillColorB = value;
      onStyleChange?.({ fillColorB: value });
    });
  }

  const shapeTypes = $derived(
    getSymbolShapeTypes(symbolMode, proportionalType)
  );
  const shapeDropdownItems = $derived(
    buildSymbolShapeDropdownItems(symbolMode, proportionalType)
  );
  const showBarWidthControl = $derived(isLinearShape(shapeType));

  function handleShapeTypeChange(value: ShapeType) {
    runUserChange(() => {
      shapeType = value;
      onSymbolsChange?.({
        type: value,
        sizeScale: getDefaultScaleForShape(value),
        ...(isLinearShape(value) ? { barWidth } : {})
      });
    });
  }

  function handleShapeDropdownSelect(value: string | number) {
    const next = shapeTypes.find((type) => type === value) ?? ShapeType.CIRCLE;
    handleShapeTypeChange(next);
  }

  function handleMissingDataShowChange(show: boolean) {
    runUserChange(() => {
      showMissingData = show;
      onMissingDataChange?.({ show });
    });
  }

  function handleMissingDataShapeChange(shape: MissingDataShape) {
    runUserChange(() => {
      missingDataShape = shape;
      onMissingDataChange?.({ shape });
    });
  }

  function handleMissingDataSizeChange(size: number) {
    runUserChange(() => {
      missingDataSize = size;
      onMissingDataChange?.({ size });
    });
  }

  function handleMissingDataColorChange(color: string) {
    runUserChange(() => {
      missingDataColor = color;
      onMissingDataChange?.({ color });
    });
  }

  function handleFillModeChange(mode: FillMode) {
    runUserChange(() => {
      fillMode = mode;
      if (fillMode === FillMode.CATEGORIES) {
        onModesChange?.({
          fill: FillMode.CATEGORIES,
          symbol: SymbolMode.CATEGORIES
        });
      } else {
        onModesChange?.({ fill: fillMode });
      }
      if (fillMode === FillMode.NONE) {
        fillColor = DEFAULT_COLORS.fill;
        fillColorB = DEFAULT_COLORS.secondary;
        onStyleChange?.({
          symbolFillColor: DEFAULT_COLORS.fill,
          fillColorB: DEFAULT_COLORS.secondary
        });
        onFillClassificationChange?.(resetVisualClassification());
      }
    });
  }

  function handleFillColorChange(value: string) {
    runUserChange(() => {
      fillColor = value;
      onStyleChange?.({ symbolFillColor: value });
    });
  }

  function handleFillOpacityChange(value: number) {
    runUserChange(() => {
      fillOpacity = value;
      onSymbolsChange?.({ opacity: value / 100 });
    });
  }

  function handleSymbolMaxSizeChange(value: number) {
    runUserChange(() => {
      symbolMaxSize = value;
      onSymbolsChange?.({ maxSize: value });
    });
  }

  function handleBarWidthChange(value: number) {
    runUserChange(() => {
      barWidth = value;
      onSymbolsChange?.({ barWidth: value });
    });
  }

  function handleStrokeDiscretizationChange(
    classification: Partial<ClassificationConfig>
  ) {
    runUserChange(() => {
      onStrokeClassificationChange?.(classification);
    });
  }

  const sizeColumnName = $derived(
    primaryFieldSelection.selectedFieldName ?? ''
  );

  const valueColumnName = $derived(
    fillClassFieldSelection.selectedFieldName ?? ''
  );

  function handleCommonScaleChange(value: boolean) {
    runUserChange(() => {
      commonScale = value;
      onSymbolPrimitiveChange?.({ commonScale: value });
    });
  }

  function handlePositionModeChange(value: string | number) {
    runUserChange(() => {
      const next =
        (value as SymbolDoublePosition) ?? SymbolDoublePosition.OVERLAY;
      if (next === positionMode) return;
      positionMode = next;
      onSymbolPrimitiveChange?.({ positionMode: next });
    });
  }

  const positionModeItems = [
    { id: SymbolDoublePosition.OVERLAY, text: m.symbol_position_overlay() },
    { id: SymbolDoublePosition.DIVISION, text: m.symbol_position_division() }
  ];
</script>

{#if symbolMode === SymbolMode.PROPORTIONAL}
  <div class="field-group">
    <span class="field-label">
      {m.proportional_symbols_label()}
      <InfoPopover text={m.proportional_type_info()} />
    </span>
    <SimpleRadioGroup
      name="prop-type"
      items={[
        {
          value: ProportionalType.SINGLE,
          labelText: m.proportional_type_single()
        },
        { value: ProportionalType.DOUBLE, labelText: m.double() }
      ]}
      selected={proportionalType}
      onchange={(value) => handleProportionalTypeChange(value)}
    />
  </div>

  {#if proportionalType === ProportionalType.DOUBLE}
    <DoubleModeControls
      commonScale={commonScale}
      bind:symbolMaxSize={symbolMaxSize}
      shapeType={shapeType}
      positionMode={positionMode}
      sizeColumnName={sizeColumnName}
      bind:sizePickerOpen={sizePickerOpen}
      bind:fieldBPickerOpen={fieldBPickerOpen}
      dataFields={dataFields}
      selectableDataFields={selectableNumericDataFields}
      selectableSecondaryDataFields={selectableSecondaryNumericDataFields}
      primaryFieldSelection={primaryFieldSelection}
      secondaryValueFieldSelection={secondaryValueFieldSelection}
      facetsSelection={facetsSelection}
      shapeDropdownItems={shapeDropdownItems}
      positionModeItems={positionModeItems}
      onCommonScaleChange={handleCommonScaleChange}
      onFieldSelect={primaryFieldSelection.handleSelect}
      onFieldBSelect={secondaryValueFieldSelection.handleSelect}
      onSymbolMaxSizeChange={handleSymbolMaxSizeChange}
      onShapeDropdownSelect={handleShapeDropdownSelect}
      onPositionModeChange={handlePositionModeChange}
    />
  {:else}
    <ProportionalScaleSection
      bind:pickerOpen={sizePickerOpen}
      bind:symbolMaxSize={symbolMaxSize}
      dataFields={dataFields}
      selectableNumericDataFields={selectableNumericDataFields}
      primaryFieldSelection={primaryFieldSelection}
      facetsSelection={facetsSelection}
      facetSlot={FACET_SLOT.SYMBOL_SIZE}
      columnName={sizeColumnName}
      shapeDropdownItems={shapeDropdownItems}
      shapeType={shapeType}
      onFieldSelect={primaryFieldSelection.handleSelect}
      onMaxSizeChange={handleSymbolMaxSizeChange}
      onShapeDropdownSelect={handleShapeDropdownSelect}
    />
  {/if}
{/if}

{#if symbolMode === SymbolMode.CLASSES}
  <ProportionalScaleSection
    bind:pickerOpen={classesPickerOpen}
    bind:symbolMaxSize={symbolMaxSize}
    dataFields={dataFields}
    selectableNumericDataFields={selectableNumericDataFields}
    primaryFieldSelection={primaryFieldSelection}
    facetsSelection={facetsSelection}
    facetSlot={FACET_SLOT.SYMBOL_VALUE}
    columnName={valueColumnName}
    shapeDropdownItems={shapeDropdownItems}
    shapeType={shapeType}
    onFieldSelect={primaryFieldSelection.handleSelect}
    onMaxSizeChange={handleSymbolMaxSizeChange}
    onShapeDropdownSelect={handleShapeDropdownSelect}
  >
    {#snippet midContent()}
      <DiscretizationRow
        label={m.discretization()}
        value={discretizationLabel}
        onsettings={onOpenSizeDiscretization}
      />
    {/snippet}
  </ProportionalScaleSection>
{/if}

{#if showBarWidthControl}
  <SliderWithInput
    label={m.format_width()}
    bind:value={barWidth}
    min={SLIDER_LIMITS.symbolBarWidth.min}
    max={SLIDER_LIMITS.symbolBarWidth.max}
    step={SLIDER_LIMITS.symbolBarWidth.step}
    onchange={handleBarWidthChange}
  />
{/if}

{#if !(symbolMode === SymbolMode.PROPORTIONAL && proportionalType === ProportionalType.DOUBLE)}
  <MissingDataSection
    bind:show={showMissingData}
    color={missingDataColor}
    shape={missingDataShape}
    size={missingDataSize}
    sizeMin={SLIDER_LIMITS.missingDataSymbolSize.min}
    sizeMax={SLIDER_LIMITS.missingDataSymbolSize.max}
    sizeStep={SLIDER_LIMITS.missingDataSymbolSize.step}
    showShapeSelector={true}
    showSizeSlider={true}
    onshowchange={handleMissingDataShowChange}
    onshapechange={handleMissingDataShapeChange}
    onsizechange={handleMissingDataSizeChange}
    oncolorchange={handleMissingDataColorChange}
  />
{/if}

{#if symbolMode === SymbolMode.PROPORTIONAL && proportionalType === ProportionalType.DOUBLE}
  <ProportionalDoubleSection
    fillColor={fillColor}
    fillColorB={fillColorB}
    bind:fillOpacity={fillOpacity}
    onColorAChange={handleFillColorChange}
    onColorBChange={handleFillColorBChange}
    onOpacityChange={handleFillOpacityChange}
  />
  <MissingDataSection
    bind:show={showMissingData}
    color={missingDataColor}
    shape={missingDataShape}
    size={missingDataSize}
    sizeMin={SLIDER_LIMITS.missingDataSymbolSize.min}
    sizeMax={SLIDER_LIMITS.missingDataSymbolSize.max}
    sizeStep={SLIDER_LIMITS.missingDataSymbolSize.step}
    showShapeSelector={true}
    showSizeSlider={true}
    onshowchange={handleMissingDataShowChange}
    onshapechange={handleMissingDataShapeChange}
    onsizechange={handleMissingDataSizeChange}
    oncolorchange={handleMissingDataColorChange}
  />
{:else}
  <FillSection
    visualization={fillVisualization}
    dataFields={dataFields}
    availableModes={FILL_MODES_FOR_SYMBOLS}
    fillMode={fillMode}
    fillColor={fillColor}
    fillOpacity={fillOpacity}
    selectedValueFieldId={fillClassFieldSelection.selectedFieldId}
    selectedCategoryFieldId={fillCategoryFieldSelection.selectedFieldId}
    discretizationLabel={fillDiscretizationLabel}
    categoryCount={categoryCount}
    facetsValueSlotPath={FACET_SLOT.SYMBOL_FILL_VALUE}
    facetsCategorySlotPath={FACET_SLOT.SYMBOL_FILL_CATEGORY}
    categoriesVariant="symbols-unique"
    showMissingData={showMissingData}
    missingDataColor={missingDataColor}
    sectionTitle={m.fill()}
    sectionInfoText={m.fill_section_info()}
    selectableDataFields={selectableDataFields}
    getFacetsSelectedFieldIds={facetsSelection.getSelectedFieldIds}
    isFacetsActiveForSlot={facetsSelection.isActiveForSlot}
    onFillModeChange={handleFillModeChange}
    onFillColorChange={handleFillColorChange}
    onFillOpacityChange={handleFillOpacityChange}
    onValueFieldSelect={fillClassFieldSelection.handleSelect}
    onCategoryFieldSelect={fillCategoryFieldSelection.handleSelect}
    onFacetsVariablesChange={facetsSelection.updateVariables}
    onFacetsToggle={facetsSelection.toggle}
    onOpenDiscretization={onOpenFillDiscretization ?? (() => {})}
    onClassificationChange={onFillClassificationChange ?? (() => {})}
    onMissingDataShowChange={handleMissingDataShowChange}
    onMissingDataColorChange={handleMissingDataColorChange}
    onInvertPalette={onFillInvertPalette}
  >
    {#snippet uniqueSnippet()}
      <SingleColorPreview
        exclusive
        label={m.color()}
        color={fillColor}
        onchange={handleFillColorChange}
      />
    {/snippet}
  </FillSection>
{/if}

<StrokeSection
  visualization={visualization}
  dataFields={dataFields}
  infoText={m.stroke_section_info()}
  showDashed={true}
  discretizationLabel={strokeDiscretizationLabel}
  onStyleChange={onStyleChange}
  onModesChange={onModesChange}
  onMappingChange={onMappingChange}
  onStrokeMappingChange={onStrokeMappingChange}
  onInvertPalette={onStrokeInvertPalette}
  onOpenDiscretization={() => (discretizationModalOpen = true)}
  onStrokeClassificationChange={onStrokeClassificationChange ?? (() => {})}
  strokeClassification={visualization?.symbol?.strokeClassification}
  strokeValueColumn={visualization?.symbol?.strokeValueColumn}
  strokeCategoryColumn={visualization?.symbol?.strokeCategoryColumn}
  showMissingData={showMissingData}
  missingDataColor={missingDataColor}
  facetsValueSlotPath={FACET_SLOT.SYMBOL_STROKE_VALUE}
  facetsCategorySlotPath={FACET_SLOT.SYMBOL_STROKE_CATEGORY}
  onMissingDataShowChange={handleMissingDataShowChange}
  onMissingDataColorChange={handleMissingDataColorChange}
/>

<DiscretizationModal
  bind:open={discretizationModalOpen}
  visualization={visualization}
  classification={visualization?.symbol?.strokeClassification}
  valueColumn={visualization?.symbol?.strokeValueColumn}
  role="stroke"
  onchange={handleStrokeDiscretizationChange}
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

  :global(.field-group .bx--dropdown) {
    max-width: 100%;
  }

  :global(.field-group .bx--select) {
    max-width: 100%;
  }
</style>
