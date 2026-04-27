<script lang="ts">
  import {
    Dropdown,
    RadioButton,
    RadioButtonGroup
  } from 'carbon-components-svelte';
  import DoubleModeControls from './proportional/double-mode-controls.svelte';
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
    FillMode
  } from '../../../constants';
  import {
    DiscretizationRow,
    InfoPopover,
    MissingDataSection,
    SliderWithInput,
    StrokeSection
  } from '../shared';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import type { SymbolModeProps } from './types';
  import FillSection from '../shared/fill-section.svelte';
  import { FILL_MODES_STANDARD } from '../shared/fill-mode-presets';
  import DiscretizationModal from '../discretization-modal.svelte';
  import type { ClassificationConfig } from '$lib/features/commons/store/visualization.store.svelte';
  import { resolveDiscretizationLabel } from '../discretization.utils';
  import { FACET_SLOT } from '../../facets-adapter';
  import FacetsVariablePicker from './facets-variable-picker.svelte';
  import {
    NONE_FIELD_ID,
    filterFieldsByKind,
    useFieldSelection
  } from '../../use-field-selection.svelte';
  import { useFacetsVariableSelection } from '../../use-facets-variable-selection.svelte';
  import { resetVisualClassification } from '../shared/classification-reset.utils';
  import {
    buildSymbolShapeDropdownItems,
    getSymbolShapeTypes
  } from './symbol-shape-options';
  import {
    coerceShapeType,
    coerceString,
    parseOpacityToSlider
  } from '../../coerce.utils';
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
  let breakValueA = $state<number | null>(null);
  let breakValueB = $state<number | null>(null);
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);
  const primaryFieldSelection = useFieldSelection(() => dataFields);
  const secondaryValueFieldSelection = useFieldSelection(() => dataFields);
  const fillClassFieldSelection = useFieldSelection(() => dataFields);
  const fillCategoryFieldSelection = useFieldSelection(() => dataFields);
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
      shapeType = coerceShapeType(symbolConfig.shape) ?? ShapeType.CIRCLE;
      fillOpacity = parseOpacityToSlider(
        symbolConfig.opacity,
        VISUALIZATION_DEFAULTS.symbolOpacity
      );
    } else if (visualization?.symbols) {
      symbolMaxSize =
        visualization.symbols.maxSize ?? VISUALIZATION_DEFAULTS.symbolMaxSize;
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
      positionMode =
        visualization.symbol.positionMode ?? SymbolDoublePosition.OVERLAY;
      breakValueA =
        visualization.symbol.breakValueA === undefined
          ? null
          : visualization.symbol.breakValueA;
      breakValueB =
        visualization.symbol.breakValueB === undefined
          ? null
          : visualization.symbol.breakValueB;
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
    if (isSyncingFromVisualization) {
      return;
    }
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
    }
  }

  function handleFieldBSelect(fieldId: number) {
    if (isSyncingFromVisualization) {
      return;
    }
    secondaryValueFieldSelection.set(fieldId);
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

  const shapeTypes = $derived(getSymbolShapeTypes(symbolMode));
  const shapeDropdownItems = $derived(
    buildSymbolShapeDropdownItems(symbolMode)
  );

  function handleShapeTypeChange(value: ShapeType) {
    if (isSyncingFromVisualization) {
      return;
    }
    shapeType = value;
    onSymbolsChange?.({
      type: value,
      sizeScale: getDefaultScaleForShape(value)
    });
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
    primaryFieldSelection.set(fieldId);
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

  function handleStrokeDiscretizationChange(
    classification: Partial<ClassificationConfig>
  ) {
    if (isSyncingFromVisualization) {
      return;
    }
    onStrokeClassificationChange?.(classification);
  }

  function handleFillClassFieldSelect(fieldId: number) {
    if (isSyncingFromVisualization) {
      return;
    }
    fillClassFieldSelection.set(fieldId);
    if (fieldId === NONE_FIELD_ID) {
      onFillMappingChange?.({ valueColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onFillMappingChange?.({ valueColumn: field.text });
    }
  }

  function handleFillCategoryFieldSelect(fieldId: number) {
    if (isSyncingFromVisualization) {
      return;
    }
    fillCategoryFieldSelection.set(fieldId);
    if (fieldId === NONE_FIELD_ID) {
      onFillMappingChange?.({ categoryColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onFillMappingChange?.({ categoryColumn: field.text });
    }
  }

  const sizeColumnName = $derived(
    primaryFieldSelection.selectedFieldName ?? ''
  );

  const valueColumnName = $derived(
    fillClassFieldSelection.selectedFieldName ?? ''
  );

  function handleCommonScaleChange(value: boolean) {
    if (isSyncingFromVisualization) return;
    commonScale = value;
    onSymbolPrimitiveChange?.({ commonScale: value });
  }

  function handlePositionModeChange(value: string | number) {
    if (isSyncingFromVisualization) return;
    const next =
      (value as SymbolDoublePosition) ?? SymbolDoublePosition.OVERLAY;
    if (next === positionMode) return;
    positionMode = next;
    onSymbolPrimitiveChange?.({ positionMode: next });
  }

  /**
   * Commits a candidate (breakValueA, breakValueB) tuple to state, swapping
   * the pair when both are finite numbers in the wrong order so downstream
   * rendering always receives a normalised range. Keeps E-08 invariant in
   * one place instead of mirroring swap logic across two handlers.
   */
  function commitBreakValues(nextA: number | null, nextB: number | null): void {
    const shouldSwap =
      nextA !== null &&
      nextB !== null &&
      Number.isFinite(nextA) &&
      Number.isFinite(nextB) &&
      nextA > nextB;
    const finalA = shouldSwap ? nextB : nextA;
    const finalB = shouldSwap ? nextA : nextB;
    breakValueA = finalA;
    breakValueB = finalB;
    onSymbolPrimitiveChange?.({
      breakValueA: finalA,
      breakValueB: finalB
    });
  }

  function handleBreakValueAChange(value: number | null) {
    if (isSyncingFromVisualization) return;
    commitBreakValues(value, breakValueB);
  }

  function handleBreakValueBChange(value: number | null) {
    if (isSyncingFromVisualization) return;
    commitBreakValues(breakValueA, value);
  }

  const positionModeItems = [
    { id: SymbolDoublePosition.OVERLAY, text: m.symbol_position_overlay() },
    {
      id: SymbolDoublePosition.JUXTAPOSITION,
      text: m.symbol_position_juxtaposition()
    },
    { id: SymbolDoublePosition.DIVISION, text: m.symbol_position_division() }
  ];
</script>

{#if symbolMode === SymbolMode.PROPORTIONAL}
  <div class="field-group">
    <span class="field-label">
      {m.proportional_symbols_label()}
      <InfoPopover text={m.proportional_type_info()} />
    </span>
    <RadioButtonGroup
      selected={proportionalType}
      on:change={(e) => {
        const next = (e as CustomEvent).detail as ProportionalType;
        if (next === proportionalType) return;
        handleProportionalTypeChange(next);
      }}
    >
      <RadioButton
        id="prop-single"
        value={ProportionalType.SINGLE}
        labelText={m.proportional_type_single()}
      />
      <RadioButton
        id="prop-double"
        value={ProportionalType.DOUBLE}
        labelText={m.double()}
      />
    </RadioButtonGroup>
  </div>

  {#if proportionalType === ProportionalType.DOUBLE}
    <DoubleModeControls
      commonScale={commonScale}
      bind:symbolMaxSize={symbolMaxSize}
      shapeType={shapeType}
      positionMode={positionMode}
      breakValueA={breakValueA}
      breakValueB={breakValueB}
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
      onFieldSelect={handleFieldSelect}
      onFieldBSelect={handleFieldBSelect}
      onSymbolMaxSizeChange={handleSymbolMaxSizeChange}
      onShapeDropdownSelect={handleShapeDropdownSelect}
      onPositionModeChange={handlePositionModeChange}
      onBreakValueAChange={handleBreakValueAChange}
      onBreakValueBChange={handleBreakValueBChange}
    />
  {:else}
    <div class="field-group">
      <span class="field-label">
        {m.size_according()}
        <InfoPopover text={m.size_according_info()} />
      </span>
      <FacetsVariablePicker
        bind:open={sizePickerOpen}
        dataFields={dataFields}
        singleSelectItems={selectableNumericDataFields}
        selectedFieldId={primaryFieldSelection.selectedFieldId}
        selectedFieldIds={facetsSelection.getSelectedFieldIds(
          FACET_SLOT.SYMBOL_SIZE
        )}
        isCollectionEnabled={facetsSelection.isActiveForSlot(
          FACET_SLOT.SYMBOL_SIZE
        )}
        onSelect={handleFieldSelect}
        onCollectionChange={(ids) =>
          facetsSelection.updateVariables(
            sizeColumnName,
            FACET_SLOT.SYMBOL_SIZE,
            ids
          )}
        onToggleCollection={(enabled) =>
          facetsSelection.toggle(
            sizeColumnName,
            FACET_SLOT.SYMBOL_SIZE,
            enabled
          )}
      />
    </div>
    <SliderWithInput
      label={m.max_size()}
      infoText={m.max_size_info()}
      bind:value={symbolMaxSize}
      min={SLIDER_LIMITS.symbolMaxSize.min}
      max={SLIDER_LIMITS.symbolMaxSize.max}
      step={SLIDER_LIMITS.symbolMaxSize.step}
      onchange={handleSymbolMaxSizeChange}
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
      singleSelectItems={selectableNumericDataFields}
      selectedFieldId={primaryFieldSelection.selectedFieldId}
      selectedFieldIds={facetsSelection.getSelectedFieldIds(
        FACET_SLOT.SYMBOL_VALUE
      )}
      isCollectionEnabled={facetsSelection.isActiveForSlot(
        FACET_SLOT.SYMBOL_VALUE
      )}
      onSelect={handleFieldSelect}
      onCollectionChange={(ids) =>
        facetsSelection.updateVariables(
          valueColumnName,
          FACET_SLOT.SYMBOL_VALUE,
          ids
        )}
      onToggleCollection={(enabled) =>
        facetsSelection.toggle(
          valueColumnName,
          FACET_SLOT.SYMBOL_VALUE,
          enabled
        )}
    />
  </div>
  <SliderWithInput
    label={m.max_size()}
    infoText={m.max_size_info()}
    bind:value={symbolMaxSize}
    min={SLIDER_LIMITS.symbolMaxSize.min}
    max={SLIDER_LIMITS.symbolMaxSize.max}
    step={SLIDER_LIMITS.symbolMaxSize.step}
    onchange={handleSymbolMaxSizeChange}
  />
  <DiscretizationRow
    label={m.discretization()}
    value={discretizationLabel}
    onsettings={onOpenSizeDiscretization}
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

{#if symbolMode === SymbolMode.PROPORTIONAL && proportionalType === ProportionalType.DOUBLE}
  <div class="double-color-row">
    <div class="double-color-item double-color-a">
      <SingleColorPreview
        exclusive
        label={m.symbol_color_a()}
        color={fillColor}
        onchange={handleFillColorChange}
      />
    </div>
    <div class="double-color-item double-color-b">
      <SingleColorPreview
        exclusive
        label={m.symbol_color_b()}
        color={fillColorB}
        onchange={handleFillColorBChange}
      />
    </div>
  </div>
  <SliderWithInput
    label={m.opacity()}
    bind:value={fillOpacity}
    min={SLIDER_LIMITS.opacity.min}
    max={SLIDER_LIMITS.opacity.max}
    step={SLIDER_LIMITS.opacity.step}
    onchange={handleFillOpacityChange}
  />
{:else}
  <FillSection
    visualization={fillVisualization}
    dataFields={dataFields}
    availableModes={FILL_MODES_STANDARD}
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
    sectionTitle={m.background()}
    sectionInfoText={m.fill_section_info()}
    selectableDataFields={selectableDataFields}
    getFacetsSelectedFieldIds={facetsSelection.getSelectedFieldIds}
    isFacetsActiveForSlot={facetsSelection.isActiveForSlot}
    onFillModeChange={(mode: FillMode) =>
      handleFillModeChange(FILL_MODES_STANDARD.indexOf(mode))}
    onFillColorChange={handleFillColorChange}
    onFillOpacityChange={handleFillOpacityChange}
    onValueFieldSelect={handleFillClassFieldSelect}
    onCategoryFieldSelect={handleFillCategoryFieldSelect}
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
  facetsValueSlotPath={FACET_SLOT.SYMBOL_VALUE}
  facetsCategorySlotPath={FACET_SLOT.SYMBOL_CATEGORY}
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
