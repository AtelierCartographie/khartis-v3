<script lang="ts">
  import { Dropdown } from 'carbon-components-svelte';
  import {
    MisuseOutline,
    SquareOutline,
    Table,
    Tag
  } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import {
    SectionHeading,
    SliderWithInput,
    ToggleWithLabel
  } from '$lib/features/commons/components/viz-controls';
  import {
    StrokeMode,
    SLIDER_LIMITS,
    VISUALIZATION_DEFAULTS,
    DEFAULT_COLORS,
    MIN_VISIBLE_STROKE_WIDTH,
    BasemapDottedPattern
  } from '$lib/features/commons/constants/visualization.constants';
  import type {
    VisualizationConfig,
    VisualizationModes,
    ClassificationConfig
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import DiscretizationRow from './discretization-row.svelte';
  import PalettePreview from '$lib/features/commons/components/palette-popover/palette-preview.svelte';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import {
    DEFAULT_SEQUENTIAL_PREVIEW,
    DEFAULT_QUALITATIVE_PREVIEW,
    PALETTE_TYPE,
    resolvePaletteTypeForBreakpoint
  } from '$lib/features/commons/components/palette-popover/palette.constants';
  import FacetsVariablePicker from './facets-variable-picker.svelte';
  import type { FacetSlotPath } from '../../adapters/facets-adapter';
  import { useCategoryLabels } from '../../hooks/use-category-labels.svelte';
  import { useFacetsVariableSelection } from '../../hooks/use-facets-variable-selection.svelte';
  import { filterFieldsByKind } from '../../hooks/use-field-selection.svelte';
  import { parseOpacityToSlider } from '../../utils/coerce.utils';
  import { resetVisualClassification } from './classification-reset.utils';
  import MissingDataSection from './missing-data-section.svelte';

  interface Props {
    visualization?: VisualizationConfig;
    dataFields?: Array<{ id: number; text: string; type?: string }>;
    infoText?: string;
    showDashed?: boolean;
    discretizationLabel?: string;
    categoryCount?: number;
    onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
    onModesChange?: (updates: Partial<VisualizationModes>) => void;
    onMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
    onStrokeMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
    onInvertPalette?: () => void;
    onOpenDiscretization?: () => void;
    onStrokeClassificationChange: (
      updates: Partial<ClassificationConfig>
    ) => void;
    strokeClassification?: ClassificationConfig;
    strokeValueColumn?: string;
    strokeCategoryColumn?: string;
    showMissingData?: boolean;
    missingDataColor?: string;
    showMissingDataSection?: boolean;
    showSliderBounds?: boolean;
    sliderInputWidth?: string;
    facetsValueSlotPath?: FacetSlotPath;
    facetsCategorySlotPath?: FacetSlotPath;
    onMissingDataShowChange?: (show: boolean) => void;
    onMissingDataColorChange?: (color: string) => void;
  }

  let {
    visualization,
    dataFields = [],
    infoText,
    showDashed = true,
    discretizationLabel,
    categoryCount = 4,
    onStyleChange,
    onModesChange,
    onMappingChange,
    onStrokeMappingChange,
    onInvertPalette,
    onOpenDiscretization,
    onStrokeClassificationChange,
    strokeClassification,
    strokeValueColumn,
    strokeCategoryColumn,
    showMissingData,
    missingDataColor,
    showMissingDataSection = true,
    showSliderBounds = true,
    sliderInputWidth = '128px',
    facetsValueSlotPath,
    facetsCategorySlotPath,
    onMissingDataShowChange,
    onMissingDataColorChange
  }: Props = $props();

  const resolvedClassesPalette = $derived(
    strokeClassification?.colors ?? DEFAULT_SEQUENTIAL_PREVIEW
  );
  const resolvedCategoriesPalette = $derived(
    strokeClassification?.colors ?? DEFAULT_QUALITATIVE_PREVIEW
  );
  const dataset = $derived(
    visualization
      ? (datasetsStore.datasets.find((d) => d.id === visualization.datasetId) ??
          datasetsStore.selectedDataset)
      : datasetsStore.selectedDataset
  );

  const NONE_FIELD_ID = -1;
  let strokeMode = $state<StrokeMode>(StrokeMode.NONE);
  let strokeWidth = $state<number>(VISUALIZATION_DEFAULTS.strokeWidth);
  let strokeColor = $state<string>(DEFAULT_COLORS.stroke);
  let strokeOpacity = $state<number>(VISUALIZATION_DEFAULTS.strokeOpacity);
  let strokeDashed = $state<boolean>(false);
  let strokeDashedPattern = $state<BasemapDottedPattern>(
    BasemapDottedPattern.DOTS
  );
  let colorFieldId = $state<number>(NONE_FIELD_ID);
  let facetsPickerOpen = $state(false);
  let categoriesPopoverOpen = $state(false);
  const resolvedShowMissingData = $derived(
    showMissingData ??
      visualization?.missingData?.show ??
      visualization?.modes?.strokeShowMissing ??
      true
  );
  const resolvedMissingDataColor = $derived(
    missingDataColor ??
      visualization?.missingData?.color ??
      DEFAULT_COLORS.missingData
  );
  let strokeShowMissing = $derived(resolvedShowMissingData);
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);
  const selectableValueDataFields = $derived(
    filterFieldsByKind(selectableDataFields, 'numeric', colorFieldId)
  );
  const selectableCategoryDataFields = $derived(
    filterFieldsByKind(selectableDataFields, 'textual', colorFieldId)
  );
  const facetsSelection = useFacetsVariableSelection({
    getVisualizationId: () => visualization?.id,
    getDataFields: () => dataFields
  });

  const valueColumnName = $derived(
    strokeMode === StrokeMode.CLASSES
      ? (dataFields.find((field) => field.id === colorFieldId)?.text ?? '')
      : ''
  );

  const categoryColumnName = $derived(
    strokeMode === StrokeMode.CATEGORIES
      ? (dataFields.find((field) => field.id === colorFieldId)?.text ?? '')
      : ''
  );
  const currentCategoryColumnName = $derived(
    strokeCategoryColumn ??
      visualization?.mapping.categoryColumn ??
      categoryColumnName
  );
  const categoryLabels = useCategoryLabels({
    enabled: () => strokeMode === StrokeMode.CATEGORIES,
    getDataset: () => dataset,
    getColumnName: () => currentCategoryColumnName,
    getClassification: () => strokeClassification,
    fallbackCount: () => categoryCount || 4
  });
  const resolvedCategoryCount = $derived(categoryLabels.count);

  $effect(() => {
    if (visualization?.modes) {
      strokeMode = visualization.modes.stroke ?? StrokeMode.NONE;
    }
    if (visualization?.style) {
      strokeColor = visualization.style.strokeColor ?? DEFAULT_COLORS.stroke;
      strokeWidth =
        visualization.style.strokeWidth ?? VISUALIZATION_DEFAULTS.strokeWidth;
      strokeOpacity = parseOpacityToSlider(
        visualization.style.strokeOpacity,
        VISUALIZATION_DEFAULTS.strokeOpacity
      );
      strokeDashed = visualization.style.strokeDashed ?? false;
      strokeDashedPattern =
        visualization.style.strokeDashedPattern ?? BasemapDottedPattern.DOTS;
    }
    const mappedFieldName =
      strokeMode === StrokeMode.CATEGORIES
        ? (strokeCategoryColumn ?? visualization?.mapping.categoryColumn)
        : strokeMode === StrokeMode.CLASSES
          ? (strokeValueColumn ?? visualization?.mapping.valueColumn)
          : undefined;
    if (mappedFieldName && dataFields.length > 0) {
      const fieldIndex = dataFields.findIndex(
        (field) => field.text === mappedFieldName
      );
      colorFieldId =
        fieldIndex >= 0 ? dataFields[fieldIndex].id : NONE_FIELD_ID;
    } else {
      colorFieldId = NONE_FIELD_ID;
    }
  });

  const strokeModeItems = [
    { icon: MisuseOutline, label: m.stroke_mode_none(), iconSize: 16 },
    { icon: SquareOutline, label: m.stroke_mode_unique(), iconSize: 16 },
    { icon: Table, label: m.stroke_mode_classes(), iconSize: 16 },
    { icon: Tag, label: m.stroke_mode_categories(), iconSize: 16 }
  ];

  const STROKE_MODES = [
    StrokeMode.NONE,
    StrokeMode.UNIQUE,
    StrokeMode.CLASSES,
    StrokeMode.CATEGORIES
  ];

  const strokeModeIndex = $derived(STROKE_MODES.indexOf(strokeMode));
  const dashedPatternItems = $derived([
    { id: BasemapDottedPattern.DOTS, text: m.dashed_pattern_dots() },
    { id: BasemapDottedPattern.DASHES, text: m.dashed_pattern_dashes() },
    { id: BasemapDottedPattern.DASH_DOT, text: m.dashed_pattern_dash_dot() },
    {
      id: BasemapDottedPattern.LONG_DASH,
      text: m.dashed_pattern_long_dash()
    }
  ]);

  function handleStrokeModeChange(index: number) {
    strokeMode = STROKE_MODES[index] || StrokeMode.NONE;
    onModesChange?.({ stroke: strokeMode });
    if (strokeMode === StrokeMode.NONE) {
      strokeColor = DEFAULT_COLORS.stroke;
      strokeWidth = VISUALIZATION_DEFAULTS.strokeWidth;
      strokeOpacity = VISUALIZATION_DEFAULTS.strokeOpacity;
      strokeDashed = false;
      onStyleChange?.({
        strokeColor: DEFAULT_COLORS.stroke,
        strokeWidth: VISUALIZATION_DEFAULTS.strokeWidth,
        strokeOpacity: VISUALIZATION_DEFAULTS.strokeOpacity / 100,
        strokeDashed: false
      });
      onStrokeClassificationChange(resetVisualClassification());
      return;
    }

    ensureVisibleStrokeWidth();
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
    onStyleChange?.({
      strokeDashed: value,
      ...(value ? { strokeDashedPattern } : {})
    });
  }

  function handleStrokeDashedPatternSelect(value: string | number) {
    const next =
      Object.values(BasemapDottedPattern).find(
        (pattern) => pattern === value
      ) ?? BasemapDottedPattern.DOTS;
    strokeDashedPattern = next;
    onStyleChange?.({ strokeDashedPattern: next });
  }

  function handleStrokeShowMissingChange(value: boolean) {
    strokeShowMissing = value;
    onMissingDataShowChange?.(value);
    onModesChange?.({ strokeShowMissing: value });
  }

  function ensureVisibleStrokeWidth() {
    if (strokeMode === StrokeMode.NONE || strokeWidth > 0) {
      return;
    }

    strokeWidth = VISUALIZATION_DEFAULTS.strokeWidth;
    onStyleChange?.({ strokeWidth: VISUALIZATION_DEFAULTS.strokeWidth });
  }

  $effect(() => {
    ensureVisibleStrokeWidth();
  });

  function handleColorFieldSelect(fieldId: number) {
    colorFieldId = fieldId;
    const handleMappingChange = onStrokeMappingChange ?? onMappingChange;
    if (!handleMappingChange) {
      return;
    }

    if (strokeMode === StrokeMode.CLASSES) {
      if (fieldId === NONE_FIELD_ID) {
        handleMappingChange({ valueColumn: undefined });
        return;
      }
      const field = dataFields.find((item) => item.id === fieldId);
      if (field) {
        handleMappingChange({ valueColumn: field.text });
      }
    }

    if (strokeMode === StrokeMode.CATEGORIES) {
      if (fieldId === NONE_FIELD_ID) {
        handleMappingChange({ categoryColumn: undefined });
        return;
      }
      const field = dataFields.find((item) => item.id === fieldId);
      if (field) {
        handleMappingChange({ categoryColumn: field.text });
      }
    }
  }
</script>

<SectionHeading title={m.stroke()} infoText={infoText} />

<div class="field-group">
  <ToggleTabs
    items={strokeModeItems}
    activeIndex={strokeModeIndex}
    onChange={handleStrokeModeChange}
    hideInactiveLabel={true}
  />
</div>

{#if strokeMode !== StrokeMode.NONE}
  {#if strokeMode === StrokeMode.UNIQUE}
    <SingleColorPreview
      exclusive
      label={m.color()}
      color={strokeColor}
      onchange={handleStrokeColorChange}
    />
    <SliderWithInput
      label={m.thickness()}
      bind:value={strokeWidth}
      min={MIN_VISIBLE_STROKE_WIDTH}
      max={SLIDER_LIMITS.strokeWidth.max}
      step={SLIDER_LIMITS.strokeWidth.step}
      showMinMax={showSliderBounds}
      inputWidth={sliderInputWidth}
      onchange={handleStrokeWidthChange}
    />
  {:else if strokeMode === StrokeMode.CLASSES}
    <div class="field-group">
      <FacetsVariablePicker
        bind:open={facetsPickerOpen}
        titleText={m.color_according()}
        dataFields={dataFields}
        singleSelectItems={selectableValueDataFields}
        selectedFieldId={colorFieldId}
        selectedFieldIds={facetsSelection.getSelectedFieldIds(
          facetsValueSlotPath
        )}
        isCollectionEnabled={facetsSelection.isActiveForSlot(
          facetsValueSlotPath
        )}
        onSelect={handleColorFieldSelect}
        onCollectionChange={(ids) =>
          facetsSelection.updateVariables(
            valueColumnName,
            facetsValueSlotPath,
            ids
          )}
        onToggleCollection={(enabled) =>
          facetsSelection.toggle(valueColumnName, facetsValueSlotPath, enabled)}
      />
    </div>
    <DiscretizationRow
      label={m.discretization()}
      value={discretizationLabel ?? ''}
      onsettings={onOpenDiscretization}
    />
    <PalettePreview
      label={m.color_palette()}
      colors={resolvedClassesPalette}
      selectedPaletteId={strokeClassification?.paletteId}
      inverted={strokeClassification?.inverted ?? false}
      paletteType={resolvePaletteTypeForBreakpoint(strokeClassification)}
      classification={strokeClassification}
      oninvert={onInvertPalette}
      onClassificationChange={onStrokeClassificationChange}
    />
    <SliderWithInput
      label={m.thickness()}
      bind:value={strokeWidth}
      min={MIN_VISIBLE_STROKE_WIDTH}
      max={SLIDER_LIMITS.strokeWidth.max}
      step={SLIDER_LIMITS.strokeWidth.step}
      showMinMax={showSliderBounds}
      inputWidth={sliderInputWidth}
      onchange={handleStrokeWidthChange}
    />
  {:else if strokeMode === StrokeMode.CATEGORIES}
    <div class="field-group">
      <FacetsVariablePicker
        bind:open={facetsPickerOpen}
        titleText={m.color_according()}
        dataFields={dataFields}
        singleSelectItems={selectableCategoryDataFields}
        selectedFieldId={colorFieldId}
        selectedFieldIds={facetsSelection.getSelectedFieldIds(
          facetsCategorySlotPath
        )}
        isCollectionEnabled={facetsSelection.isActiveForSlot(
          facetsCategorySlotPath
        )}
        onSelect={handleColorFieldSelect}
        onCollectionChange={(ids) =>
          facetsSelection.updateVariables(
            categoryColumnName,
            facetsCategorySlotPath,
            ids
          )}
        onToggleCollection={(enabled) =>
          facetsSelection.toggle(
            categoryColumnName,
            facetsCategorySlotPath,
            enabled
          )}
      />
    </div>
    <DiscretizationRow
      label={m.category_aspect()}
      value={m.categories_count({ count: resolvedCategoryCount })}
      settingsIconDescription={m.palette_categories_aspect_title()}
      onsettings={() => {
        categoriesPopoverOpen = true;
      }}
    />
    <PalettePreview
      label={m.color_palette()}
      colors={resolvedCategoriesPalette}
      selectedPaletteId={strokeClassification?.paletteId}
      inverted={strokeClassification?.inverted ?? false}
      paletteType={PALETTE_TYPE.QUALITATIVE}
      categoriesMode={true}
      categoriesVariant="lines"
      categoryLabels={categoryLabels.labels}
      bind:categoriesPopoverOpen={categoriesPopoverOpen}
      oninvert={onInvertPalette}
      onClassificationChange={onStrokeClassificationChange}
    />
    <SliderWithInput
      label={m.thickness()}
      bind:value={strokeWidth}
      min={MIN_VISIBLE_STROKE_WIDTH}
      max={SLIDER_LIMITS.strokeWidth.max}
      step={SLIDER_LIMITS.strokeWidth.step}
      showMinMax={showSliderBounds}
      inputWidth={sliderInputWidth}
      onchange={handleStrokeWidthChange}
    />
  {/if}

  {#if showMissingDataSection && (strokeMode === StrokeMode.CLASSES || strokeMode === StrokeMode.CATEGORIES)}
    <MissingDataSection
      bind:show={strokeShowMissing}
      color={resolvedMissingDataColor}
      showShapeSelector={false}
      showSizeSlider={false}
      onshowchange={handleStrokeShowMissingChange}
      oncolorchange={onMissingDataColorChange ?? (() => {})}
    />
  {/if}

  {#if showDashed}
    <ToggleWithLabel
      label={m.dashed()}
      toggled={strokeDashed}
      ontoggle={handleStrokeDashedChange}
    />
    {#if strokeDashed}
      <Dropdown
        titleText={m.stroke_dashed_pattern()}
        items={dashedPatternItems}
        selectedId={strokeDashedPattern}
        on:select={(e) => handleStrokeDashedPatternSelect(e.detail.selectedId)}
        type="default"
      />
    {/if}
  {/if}

  <SliderWithInput
    label={m.opacity()}
    bind:value={strokeOpacity}
    min={SLIDER_LIMITS.opacity.min}
    max={SLIDER_LIMITS.opacity.max}
    step={SLIDER_LIMITS.opacity.step}
    showMinMax={showSliderBounds}
    inputWidth={sliderInputWidth}
    onchange={handleStrokeOpacityChange}
  />
{/if}

<style lang="scss">
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }
</style>
