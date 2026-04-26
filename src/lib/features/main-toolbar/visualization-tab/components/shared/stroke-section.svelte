<script lang="ts">
  import {
    MisuseOutline,
    SquareOutline,
    Category,
    Tag
  } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
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
    MIN_VISIBLE_STROKE_WIDTH
  } from '../../../constants';
  import type {
    VisualizationConfig,
    VisualizationModes,
    ClassificationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';
  import ColorSelector from './color-selector.svelte';
  import DiscretizationRow from './discretization-row.svelte';
  import PalettePreview from '$lib/features/commons/components/palette-popover/palette-preview.svelte';
  import {
    DEFAULT_SEQUENTIAL_PREVIEW,
    DEFAULT_QUALITATIVE_PREVIEW,
    PALETTE_TYPE,
    resolvePaletteTypeForBreakpoint
  } from '$lib/features/commons/components/palette-popover/palette.constants';
  import FacetsVariablePicker from '../symbols/facets-variable-picker.svelte';
  import type { FacetSlotPath } from '../../facets-adapter';
  import { useCategoryLabels } from '../../use-category-labels.svelte';
  import { useFacetsVariableSelection } from '../../use-facets-variable-selection.svelte';
  import { parseOpacityToSlider } from '../../coerce.utils';
  import { resetVisualClassification } from './classification-reset.utils';

  interface Props {
    visualization?: VisualizationConfig;
    dataFields?: Array<{ id: number; text: string }>;
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
    showSliderBounds?: boolean;
    sliderInputWidth?: string;
    facetsValueSlotPath?: FacetSlotPath;
    facetsCategorySlotPath?: FacetSlotPath;
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
    showSliderBounds = true,
    sliderInputWidth = '128px',
    facetsValueSlotPath,
    facetsCategorySlotPath
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
  let colorFieldId = $state<number>(NONE_FIELD_ID);
  let facetsPickerOpen = $state(false);
  let categoriesPopoverOpen = $state(false);
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);
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
    { icon: Category, label: m.stroke_mode_classes(), iconSize: 16 },
    { icon: Tag, label: m.stroke_mode_categories(), iconSize: 16 }
  ];

  const STROKE_MODES = [
    StrokeMode.NONE,
    StrokeMode.UNIQUE,
    StrokeMode.CLASSES,
    StrokeMode.CATEGORIES
  ];

  const strokeModeIndex = $derived(STROKE_MODES.indexOf(strokeMode));

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
    onStyleChange?.({ strokeDashed: value });
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

  {#if strokeMode === StrokeMode.UNIQUE}
    <ColorSelector
      exclusive
      label={m.color()}
      value={strokeColor}
      onchange={handleStrokeColorChange}
    />
  {:else if strokeMode === StrokeMode.CLASSES}
    <div class="field-group">
      <FacetsVariablePicker
        bind:open={facetsPickerOpen}
        titleText={m.color_according()}
        dataFields={dataFields}
        singleSelectItems={selectableDataFields}
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
  {:else if strokeMode === StrokeMode.CATEGORIES}
    <div class="field-group">
      <FacetsVariablePicker
        bind:open={facetsPickerOpen}
        titleText={m.color_according()}
        dataFields={dataFields}
        singleSelectItems={selectableDataFields}
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
  {/if}

  {#if showDashed}
    <ToggleWithLabel
      label={m.dashed()}
      toggled={strokeDashed}
      ontoggle={handleStrokeDashedChange}
    />
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
