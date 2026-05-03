<script lang="ts">
  import { Dropdown } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    FillMode,
    ShapeType,
    SLIDER_LIMITS,
    SymbolMode,
    VISUALIZATION_DEFAULTS,
    DEFAULT_COLORS
  } from '../../../constants';
  import { InfoPopover, SliderWithInput, StrokeSection } from '../shared';
  import FillSection from '../shared/fill-section.svelte';
  import { FILL_MODES_STANDARD } from '../shared/fill-mode-presets';
  import DiscretizationModal from '../discretization/discretization-modal.svelte';
  import type { SymbolModeProps } from './types';
  import { resolveDiscretizationLabel } from '../discretization/discretization.utils';
  import { FACET_SLOT } from '../../utils/facets-adapter';
  import {
    NONE_FIELD_ID,
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

  let {
    dataFields = [],
    visualization,
    fillVisualization,
    onStyleChange,
    onModesChange,
    onSymbolsChange,
    onMappingChange,
    onFillMappingChange,
    onStrokeMappingChange,
    onMissingDataChange,
    onFillClassificationChange,
    onStrokeClassificationChange,
    onFillInvertPalette,
    onStrokeInvertPalette,
    onOpenFillDiscretization
  }: SymbolModeProps = $props();

  let strokeDiscretizationModalOpen = $state(false);
  let fillMode = $state<FillMode>(FillMode.UNIQUE);
  let symbolSize = $state<number>(VISUALIZATION_DEFAULTS.symbolSize);
  let shapeType = $state<ShapeType>(ShapeType.CIRCLE);
  let fillColor = $state<string>(DEFAULT_COLORS.fill);
  let fillOpacity = $state<number>(VISUALIZATION_DEFAULTS.fillOpacity);
  let showMissingData = $state<boolean>(true);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);
  let categoryCount = $state<number>(4);
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);
  const classFieldSelection = useFieldSelectionHandler({
    getDataFields: () => dataFields,
    columnKey: 'valueColumn',
    onMappingChange: (updates) => onFillMappingChange?.(updates)
  });
  const categoryFieldSelection = useFieldSelectionHandler({
    getDataFields: () => dataFields,
    columnKey: 'categoryColumn',
    onMappingChange: (updates) => onFillMappingChange?.(updates)
  });
  const facetsSelection = useFacetsVariableSelection({
    getVisualizationId: () => visualization?.id,
    getDataFields: () => dataFields
  });

  $effect(() => {
    classFieldSelection.sync(fillVisualization?.mapping.valueColumn);
    categoryFieldSelection.sync(fillVisualization?.mapping.categoryColumn);

    const symbolConfig = visualization?.symbol;
    if (symbolConfig) {
      fillMode = symbolConfig.fillMode ?? FillMode.UNIQUE;
      fillColor = coerceString(symbolConfig.fillColor) ?? DEFAULT_COLORS.fill;
      symbolSize = symbolConfig.size ?? VISUALIZATION_DEFAULTS.symbolSize;
      shapeType = coerceShapeType(symbolConfig.shape) ?? ShapeType.CIRCLE;
      fillOpacity = parseOpacityToSlider(
        symbolConfig.opacity,
        VISUALIZATION_DEFAULTS.symbolOpacity
      );
    } else {
      if (visualization?.modes) {
        fillMode = visualization.modes.fill ?? FillMode.UNIQUE;
      }
      if (visualization?.style) {
        fillColor =
          coerceString(visualization.style.symbolFillColor) ??
          DEFAULT_COLORS.fill;
      }
      if (visualization?.symbols) {
        symbolSize =
          visualization.symbols.size ?? VISUALIZATION_DEFAULTS.symbolSize;
        shapeType = visualization.symbols.type ?? ShapeType.CIRCLE;
        fillOpacity = parseOpacityToSlider(
          visualization.symbols.opacity,
          VISUALIZATION_DEFAULTS.symbolOpacity
        );
      } else {
        fillOpacity = VISUALIZATION_DEFAULTS.symbolOpacity;
      }
    }
    if (visualization?.missingData) {
      showMissingData = visualization.missingData.show ?? true;
      missingDataColor =
        visualization.missingData.color ?? DEFAULT_COLORS.missingData;
    }
    if (fillVisualization?.classification) {
      categoryCount =
        fillVisualization.classification.labels?.length ??
        fillVisualization.classification.numClasses ??
        fillVisualization.classification.classes ??
        4;
    }
  });

  const discretizationLabel = $derived.by(() =>
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

  function handleFillModeChange(index: number) {
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
      onStyleChange?.({ symbolFillColor: DEFAULT_COLORS.fill });
      onFillClassificationChange?.(resetVisualClassification());
    } else if (
      fillMode === FillMode.UNIQUE &&
      visualization?.symbol?.fillColor === undefined &&
      visualization?.style.symbolFillColor === undefined
    ) {
      onStyleChange?.({ symbolFillColor: fillColor });
    }
  }

  function handleSymbolSizeChange(value: number) {
    symbolSize = value;
    onSymbolsChange?.({ size: value });
  }

  function handleShapeTypeChange(value: ShapeType) {
    shapeType = value;
    onSymbolsChange?.({
      type: value,
      sizeScale: getDefaultScaleForShape(value)
    });
  }

  function handleFillColorChange(value: string) {
    fillColor = value;
    onStyleChange?.({ symbolFillColor: value });
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

  const shapeTypes = getSymbolShapeTypes(SymbolMode.UNIQUE);
  const shapeDropdownItems = $derived(
    buildSymbolShapeDropdownItems(SymbolMode.UNIQUE)
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
  step={SLIDER_LIMITS.symbolSize.step}
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

<FillSection
  visualization={fillVisualization}
  dataFields={dataFields}
  availableModes={FILL_MODES_STANDARD}
  fillMode={fillMode}
  fillColor={fillColor}
  fillOpacity={fillOpacity}
  selectedValueFieldId={classFieldSelection.selectedFieldId}
  selectedCategoryFieldId={categoryFieldSelection.selectedFieldId}
  discretizationLabel={discretizationLabel}
  categoryCount={categoryCount}
  facetsValueSlotPath={FACET_SLOT.SYMBOL_FILL_VALUE}
  facetsCategorySlotPath={FACET_SLOT.SYMBOL_FILL_CATEGORY}
  categoriesVariant="symbols-unique"
  showMissingData={showMissingData}
  missingDataColor={missingDataColor}
  sectionTitle={m.background()}
  selectableDataFields={selectableDataFields}
  getFacetsSelectedFieldIds={facetsSelection.getSelectedFieldIds}
  isFacetsActiveForSlot={facetsSelection.isActiveForSlot}
  onFillModeChange={(mode) =>
    handleFillModeChange(FILL_MODES_STANDARD.indexOf(mode))}
  onFillColorChange={handleFillColorChange}
  onFillOpacityChange={handleFillOpacityChange}
  onValueFieldSelect={classFieldSelection.handleSelect}
  onCategoryFieldSelect={categoryFieldSelection.handleSelect}
  onFacetsVariablesChange={facetsSelection.updateVariables}
  onFacetsToggle={facetsSelection.toggle}
  onOpenDiscretization={onOpenFillDiscretization ?? (() => {})}
  onClassificationChange={onFillClassificationChange ?? (() => {})}
  onMissingDataShowChange={handleMissingDataShowChange}
  onMissingDataColorChange={handleMissingDataColorChange}
  onInvertPalette={onFillInvertPalette}
/>

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
  onOpenDiscretization={() => {
    strokeDiscretizationModalOpen = true;
  }}
  onStrokeClassificationChange={onStrokeClassificationChange ?? (() => {})}
  strokeClassification={visualization?.symbol?.strokeClassification}
  strokeValueColumn={visualization?.symbol?.strokeValueColumn}
  strokeCategoryColumn={visualization?.symbol?.strokeCategoryColumn}
  showMissingData={showMissingData}
  missingDataColor={missingDataColor}
  facetsValueSlotPath={FACET_SLOT.SYMBOL_VALUE}
  facetsCategorySlotPath={FACET_SLOT.SYMBOL_CATEGORY}
  onMissingDataShowChange={handleMissingDataShowChange}
  onMissingDataColorChange={handleMissingDataColorChange}
/>

<DiscretizationModal
  bind:open={strokeDiscretizationModalOpen}
  visualization={visualization}
  classification={visualization?.symbol?.strokeClassification}
  valueColumn={visualization?.symbol?.strokeValueColumn}
  role="stroke"
  onchange={onStrokeClassificationChange ?? (() => {})}
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
