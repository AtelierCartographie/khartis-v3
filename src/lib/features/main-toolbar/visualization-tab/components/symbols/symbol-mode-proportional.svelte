<script lang="ts">
  import {
    Dropdown,
    RadioButton,
    RadioButtonGroup,
    TextInput
  } from 'carbon-components-svelte';
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
    availableShapesForSymbolMode
  } from '../../../constants';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import {
    DiscretizationRow,
    InfoPopover,
    MissingDataSection,
    SliderWithInput,
    StrokeSection
  } from '../shared';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import type { SymbolModeProps } from './types';
  import { CaretUp, CircleFilled, SquareFill } from 'carbon-icons-svelte';
  import FillSection from '../shared/fill-section.svelte';
  import { FILL_MODES_STANDARD } from '../shared/fill-mode-presets';
  import DiscretizationModal from '../discretization-modal.svelte';
  import type { ClassificationConfig } from '$lib/features/commons/store/visualization.store.svelte';
  import { resolveDiscretizationLabel } from '../discretization.utils';
  import {
    FACET_SLOT,
    facetsStore,
    type FacetSlotPath
  } from '$lib/features/step-toolbar/tools/facets/facets.store.svelte';
  import FacetsVariablePicker from './facets-variable-picker.svelte';

  interface Props extends SymbolModeProps {
    symbolMode: SymbolMode.PROPORTIONAL | SymbolMode.CLASSES;
  }

  let {
    dataFields = [],
    visualization,
    symbolMode,
    onSymbolsChange,
    onSymbolPrimitiveChange,
    onMappingChange,
    onClassificationChange,
    onStrokeClassificationChange,
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
  let commonScale = $state<boolean>(true);
  let positionMode = $state<SymbolDoublePosition>(SymbolDoublePosition.OVERLAY);
  let breakValueA = $state<number | null>(null);
  let breakValueB = $state<number | null>(null);
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);
  let isSyncingFromVisualization = $state(true);
  let syncToken = 0;

  $effect(() => {
    const currentSyncToken = ++syncToken;
    isSyncingFromVisualization = true;

    if (dataFields.length > 0 && visualization?.mapping) {
      const sym = visualization.symbol;
      const sizeCol = sym?.sizeColumn ?? visualization.mapping.sizeColumn;
      const valueCol = sym?.valueColumn ?? visualization.mapping.valueColumn;
      const categoryCol =
        sym?.categoryColumn ?? visualization.mapping.categoryColumn;

      const mappedFieldName =
        symbolMode === SymbolMode.PROPORTIONAL ? sizeCol : valueCol;

      if (mappedFieldName) {
        const fieldIndex = dataFields.findIndex(
          (field) => field.text === mappedFieldName
        );
        selectedFieldId =
          fieldIndex >= 0 ? dataFields[fieldIndex].id : NONE_FIELD_ID;
      } else {
        selectedFieldId = NONE_FIELD_ID;
      }

      if (valueCol) {
        const fieldBIndex = dataFields.findIndex(
          (field) => field.text === valueCol
        );
        selectedFieldBId =
          fieldBIndex >= 0 ? dataFields[fieldBIndex].id : NONE_FIELD_ID;
      } else {
        selectedFieldBId = NONE_FIELD_ID;
      }

      if (valueCol) {
        const valueFieldIndex = dataFields.findIndex(
          (field) => field.text === valueCol
        );
        fillClassFieldId =
          valueFieldIndex >= 0 ? dataFields[valueFieldIndex].id : NONE_FIELD_ID;
      } else {
        fillClassFieldId = NONE_FIELD_ID;
      }

      if (categoryCol) {
        const categoryFieldIndex = dataFields.findIndex(
          (field) => field.text === categoryCol
        );
        fillCategoryFieldId =
          categoryFieldIndex >= 0
            ? dataFields[categoryFieldIndex].id
            : NONE_FIELD_ID;
      } else {
        fillCategoryFieldId = NONE_FIELD_ID;
      }
    }

    const symbolConfig = visualization?.symbol;
    if (symbolConfig) {
      symbolMaxSize =
        symbolConfig.maxSize ?? VISUALIZATION_DEFAULTS.symbolMaxSize;
      shapeType = (symbolConfig.shape as ShapeType) ?? ShapeType.CIRCLE;
      fillOpacity =
        symbolConfig.opacity !== undefined
          ? Math.round(symbolConfig.opacity * 100)
          : VISUALIZATION_DEFAULTS.symbolOpacity;
    } else if (visualization?.symbols) {
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
    if (symbolConfig) {
      fillMode = symbolConfig.fillMode ?? FillMode.UNIQUE;
      proportionalType =
        symbolConfig.proportionalType ?? ProportionalType.SINGLE;
      fillColor =
        (symbolConfig.fillColor as string | undefined) ?? DEFAULT_COLORS.fill;
      fillColorB =
        (symbolConfig.fillColorB as string | undefined) ??
        DEFAULT_COLORS.secondary;
    } else {
      if (visualization?.modes) {
        fillMode = visualization.modes.fill ?? FillMode.UNIQUE;
        proportionalType =
          visualization.modes.proportionalType ?? ProportionalType.SINGLE;
      }
      if (visualization?.style) {
        fillColor =
          (visualization.style.symbolFillColor as string) ??
          DEFAULT_COLORS.fill;
        fillColorB = visualization.style.fillColorB ?? DEFAULT_COLORS.secondary;
      }
    }
    if (visualization?.classification) {
      categoryCount =
        visualization.classification.labels?.length ??
        visualization.classification.numClasses ??
        visualization.classification.classes ??
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
      selectedFieldBId = NONE_FIELD_ID;
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
    if (fillMode === FillMode.NONE) {
      fillColor = DEFAULT_COLORS.fill;
      fillColorB = DEFAULT_COLORS.secondary;
      onStyleChange?.({
        symbolFillColor: DEFAULT_COLORS.fill,
        fillColorB: DEFAULT_COLORS.secondary
      });
      onClassificationChange?.({
        colors: undefined,
        paletteId: undefined,
        inverted: false,
        patternId: undefined,
        patternParams: undefined,
        labels: undefined
      });
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

  const selectedVizId = $derived(visualization?.id);

  const activeFacetsSlotPath = $derived.by(() => {
    if (
      !facetsStore.enabled ||
      !selectedVizId ||
      facetsStore.baseVisualizationId !== selectedVizId
    ) {
      return null;
    }
    return facetsStore.primarySlotPath;
  });

  function isFacetsActiveForSlot(slotPath: FacetSlotPath): boolean {
    return activeFacetsSlotPath === slotPath;
  }

  function getFacetsSelectedFieldIds(slotPath: FacetSlotPath): number[] {
    if (!isFacetsActiveForSlot(slotPath)) {
      return [];
    }
    return facetsStore.variables
      .map((name) => dataFields.find((f) => f.text === name)?.id)
      .filter((id): id is number => typeof id === 'number');
  }

  const sizeColumnName = $derived(
    dataFields.find((f) => f.id === selectedFieldId)?.text ?? ''
  );

  const valueColumnName = $derived(
    dataFields.find((f) => f.id === fillClassFieldId)?.text ?? ''
  );

  async function handleFacetsVariablesChange(
    baseVariableName: string,
    slotPath: FacetSlotPath,
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

    await facetsStore.updateVariables(selectedVizId, merged, slotPath);
  }

  async function handleFacetsToggle(
    baseVariableName: string,
    slotPath: FacetSlotPath,
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
    await facetsStore.updateVariables(selectedVizId, candidates, slotPath);
  }

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

  function handleBreakValueAChange(value: number | null) {
    if (isSyncingFromVisualization) return;
    breakValueA = value;
    onSymbolPrimitiveChange?.({ breakValueA: value });
  }

  function handleBreakValueBChange(value: number | null) {
    if (isSyncingFromVisualization) return;
    breakValueB = value;
    onSymbolPrimitiveChange?.({ breakValueB: value });
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

  {#if proportionalType === ProportionalType.DOUBLE}
    <div class="field-group">
      <span class="field-label">
        {m.common_scale_label()}
        <InfoPopover text={m.common_scale_info()} />
      </span>
      <Switch
        toggled={commonScale}
        labelText={m.common_scale_label()}
        hideLabel
        onchange={handleCommonScaleChange}
      />
    </div>

    <div class="field-group">
      <span class="field-label">
        {m.symbol_a_size_according()}
        <InfoPopover text={m.size_according_info()} />
      </span>
      <FacetsVariablePicker
        bind:open={sizePickerOpen}
        dataFields={dataFields}
        singleSelectItems={selectableDataFields}
        selectedFieldId={selectedFieldId}
        selectedFieldIds={getFacetsSelectedFieldIds(FACET_SLOT.SYMBOL_SIZE)}
        isCollectionEnabled={isFacetsActiveForSlot(FACET_SLOT.SYMBOL_SIZE)}
        onSelect={handleFieldSelect}
        onCollectionChange={(ids) =>
          handleFacetsVariablesChange(
            sizeColumnName,
            FACET_SLOT.SYMBOL_SIZE,
            ids
          )}
        onToggleCollection={(enabled) =>
          handleFacetsToggle(sizeColumnName, FACET_SLOT.SYMBOL_SIZE, enabled)}
      />
    </div>

    <div class="field-group">
      <span class="field-label">
        {m.symbol_b_size_according()}
      </span>
      <Dropdown
        items={selectableDataFields}
        selectedId={selectedFieldBId}
        on:select={(e) => handleFieldBSelect(e.detail.selectedId)}
        type="default"
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

    <div class="field-group">
      <span class="field-label">
        {m.symbol_position_mode()}
        <InfoPopover text={m.position_mode_info()} />
      </span>
      <Dropdown
        items={positionModeItems}
        selectedId={positionMode}
        on:select={(e) => handlePositionModeChange(e.detail.selectedId)}
        type="default"
      />
    </div>

    <div class="field-group">
      <span class="field-label">
        {m.symbol_a_break_value()}
        <InfoPopover text={m.break_value_info()} />
      </span>
      <TextInput
        labelText=""
        hideLabel
        type="number"
        placeholder={m.break_value_placeholder()}
        value={breakValueA === null ? '' : String(breakValueA)}
        on:input={(e) => {
          const raw = (e.detail as string) ?? '';
          const trimmed = raw.trim();
          if (trimmed === '') {
            handleBreakValueAChange(null);
            return;
          }
          const next = Number(trimmed);
          handleBreakValueAChange(Number.isFinite(next) ? next : null);
        }}
      />
    </div>

    <div class="field-group">
      <span class="field-label">
        {m.symbol_b_break_value()}
      </span>
      <TextInput
        labelText=""
        hideLabel
        type="number"
        placeholder={m.break_value_placeholder()}
        value={breakValueB === null ? '' : String(breakValueB)}
        on:input={(e) => {
          const raw = (e.detail as string) ?? '';
          const trimmed = raw.trim();
          if (trimmed === '') {
            handleBreakValueBChange(null);
            return;
          }
          const next = Number(trimmed);
          handleBreakValueBChange(Number.isFinite(next) ? next : null);
        }}
      />
    </div>
  {:else}
    <div class="field-group">
      <span class="field-label">
        {m.size_according()}
        <InfoPopover text={m.size_according_info()} />
      </span>
      <FacetsVariablePicker
        bind:open={sizePickerOpen}
        dataFields={dataFields}
        singleSelectItems={selectableDataFields}
        selectedFieldId={selectedFieldId}
        selectedFieldIds={getFacetsSelectedFieldIds(FACET_SLOT.SYMBOL_SIZE)}
        isCollectionEnabled={isFacetsActiveForSlot(FACET_SLOT.SYMBOL_SIZE)}
        onSelect={handleFieldSelect}
        onCollectionChange={(ids) =>
          handleFacetsVariablesChange(
            sizeColumnName,
            FACET_SLOT.SYMBOL_SIZE,
            ids
          )}
        onToggleCollection={(enabled) =>
          handleFacetsToggle(sizeColumnName, FACET_SLOT.SYMBOL_SIZE, enabled)}
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
      selectedFieldIds={getFacetsSelectedFieldIds(FACET_SLOT.SYMBOL_VALUE)}
      isCollectionEnabled={isFacetsActiveForSlot(FACET_SLOT.SYMBOL_VALUE)}
      onSelect={handleFieldSelect}
      onCollectionChange={(ids) =>
        handleFacetsVariablesChange(
          valueColumnName,
          FACET_SLOT.SYMBOL_VALUE,
          ids
        )}
      onToggleCollection={(enabled) =>
        handleFacetsToggle(valueColumnName, FACET_SLOT.SYMBOL_VALUE, enabled)}
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

<FillSection
  visualization={visualization}
  primitive="symbol"
  dataFields={dataFields}
  availableModes={FILL_MODES_STANDARD}
  fillMode={fillMode}
  fillColor={fillColor}
  fillOpacity={fillOpacity}
  selectedValueFieldId={fillClassFieldId}
  selectedCategoryFieldId={fillCategoryFieldId}
  discretizationLabel={discretizationLabel}
  categoryCount={categoryCount}
  facetsValueSlotPath={FACET_SLOT.SYMBOL_VALUE}
  facetsCategorySlotPath={FACET_SLOT.SYMBOL_CATEGORY}
  categoriesVariant="symbols-unique"
  showMissingData={showMissingData}
  missingDataColor={missingDataColor}
  sectionTitle={m.background()}
  sectionInfoText={m.fill_section_info()}
  selectableDataFields={selectableDataFields}
  getFacetsSelectedFieldIds={getFacetsSelectedFieldIds}
  isFacetsActiveForSlot={isFacetsActiveForSlot}
  onFillModeChange={(mode: FillMode) =>
    handleFillModeChange(FILL_MODES_STANDARD.indexOf(mode))}
  onFillColorChange={handleFillColorChange}
  onFillOpacityChange={handleFillOpacityChange}
  onValueFieldSelect={handleFillClassFieldSelect}
  onCategoryFieldSelect={handleFillCategoryFieldSelect}
  onFacetsVariablesChange={handleFacetsVariablesChange}
  onFacetsToggle={handleFacetsToggle}
  onOpenDiscretization={onOpenDiscretization ?? (() => {})}
  onClassificationChange={onClassificationChange ?? (() => {})}
  onMissingDataShowChange={handleMissingDataShowChange}
  onMissingDataColorChange={handleMissingDataColorChange}
  onInvertPalette={onInvertPalette}
>
  {#snippet uniqueSnippet()}
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
  {/snippet}
</FillSection>

<StrokeSection
  visualization={visualization}
  dataFields={dataFields}
  infoText={m.stroke_section_info()}
  showDashed={true}
  discretizationLabel={strokeDiscretizationLabel}
  onStyleChange={onStyleChange}
  onModesChange={onModesChange}
  onMappingChange={onMappingChange}
  onInvertPalette={onInvertPalette}
  onOpenDiscretization={() => (discretizationModalOpen = true)}
  onStrokeClassificationChange={onStrokeClassificationChange ?? (() => {})}
  strokeClassification={visualization?.symbol?.strokeClassification}
  facetsValueSlotPath={FACET_SLOT.SYMBOL_VALUE}
  facetsCategorySlotPath={FACET_SLOT.SYMBOL_CATEGORY}
/>

<DiscretizationModal
  bind:open={discretizationModalOpen}
  visualization={visualization}
  classification={visualization?.symbol?.strokeClassification}
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
