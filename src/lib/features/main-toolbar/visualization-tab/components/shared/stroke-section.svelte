<script lang="ts">
  import {
    MisuseOutline,
    SquareOutline,
    Category,
    Tag
  } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    StrokeMode,
    SLIDER_LIMITS,
    VISUALIZATION_DEFAULTS,
    DEFAULT_COLORS
  } from '../../../constants';
  import type {
    VisualizationConfig,
    VisualizationModes,
    ClassificationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';
  import ColorSelector from './color-selector.svelte';
  import DiscretizationRow from './discretization-row.svelte';
  import PalettePreview from '$lib/features/commons/components/palette-popover/palette-preview.svelte';
  import SectionHeading from './section-heading.svelte';
  import SliderWithInput from './slider-with-input.svelte';
  import ToggleWithLabel from './toggle-with-label.svelte';
  import {
    DEFAULT_SEQUENTIAL_PREVIEW,
    DEFAULT_QUALITATIVE_PREVIEW,
    PALETTE_TYPE,
    resolvePaletteTypeForBreakpoint
  } from '$lib/features/commons/components/palette-popover/palette.constants';
  import FacetsVariablePicker from '../symbols/facets-variable-picker.svelte';
  import {
    facetsStore,
    type FacetSlotPath
  } from '$lib/features/step-toolbar/tools/facets/facets.store.svelte';

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
    onInvertPalette?: () => void;
    onOpenDiscretization?: () => void;
    onStrokeClassificationChange: (
      updates: Partial<ClassificationConfig>
    ) => void;
    strokeClassification?: ClassificationConfig;
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
    onInvertPalette,
    onOpenDiscretization,
    onStrokeClassificationChange,
    strokeClassification,
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
  const resolvedCategoryLabels = $derived(strokeClassification?.labels ?? []);

  const NONE_FIELD_ID = -1;
  let strokeMode = $state<StrokeMode>(StrokeMode.NONE);
  let strokeWidth = $state<number>(VISUALIZATION_DEFAULTS.strokeWidth);
  let strokeColor = $state<string>(DEFAULT_COLORS.stroke);
  let strokeOpacity = $state<number>(VISUALIZATION_DEFAULTS.strokeOpacity);
  let strokeDashed = $state<boolean>(false);
  let colorFieldId = $state<number>(NONE_FIELD_ID);
  let facetsPickerOpen = $state(false);
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);

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

  function isFacetsActiveForSlot(slotPath: FacetSlotPath | undefined): boolean {
    return Boolean(slotPath && activeFacetsSlotPath === slotPath);
  }

  function getFacetsSelectedFieldIds(
    slotPath: FacetSlotPath | undefined
  ): number[] {
    if (!slotPath || !isFacetsActiveForSlot(slotPath)) {
      return [];
    }
    return facetsStore.variables
      .map((name) => dataFields.find((field) => field.text === name)?.id)
      .filter((id): id is number => typeof id === 'number');
  }

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

  $effect(() => {
    if (visualization?.modes) {
      strokeMode = visualization.modes.stroke ?? StrokeMode.NONE;
    }
    if (visualization?.style) {
      strokeColor = visualization.style.strokeColor ?? DEFAULT_COLORS.stroke;
      strokeWidth =
        visualization.style.strokeWidth ?? VISUALIZATION_DEFAULTS.strokeWidth;
      strokeOpacity =
        visualization.style.strokeOpacity !== undefined
          ? Math.round(visualization.style.strokeOpacity * 100)
          : VISUALIZATION_DEFAULTS.strokeOpacity;
      strokeDashed = visualization.style.strokeDashed ?? false;
    }
    const mappedFieldName =
      strokeMode === StrokeMode.CATEGORIES
        ? visualization?.mapping.categoryColumn
        : strokeMode === StrokeMode.CLASSES
          ? visualization?.mapping.valueColumn
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
      onStrokeClassificationChange({
        colors: undefined,
        paletteId: undefined,
        inverted: false,
        patternId: undefined,
        patternParams: undefined,
        labels: undefined
      });
    }
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

  function handleColorFieldSelect(fieldId: number) {
    colorFieldId = fieldId;
    if (!onMappingChange) {
      return;
    }

    if (strokeMode === StrokeMode.CLASSES) {
      if (fieldId === NONE_FIELD_ID) {
        onMappingChange({ valueColumn: undefined });
        return;
      }
      const field = dataFields.find((item) => item.id === fieldId);
      if (field) {
        onMappingChange({ valueColumn: field.text });
      }
    }

    if (strokeMode === StrokeMode.CATEGORIES) {
      if (fieldId === NONE_FIELD_ID) {
        onMappingChange({ categoryColumn: undefined });
        return;
      }
      const field = dataFields.find((item) => item.id === fieldId);
      if (field) {
        onMappingChange({ categoryColumn: field.text });
      }
    }
  }

  async function handleFacetsVariablesChange(
    baseVariableName: string,
    slotPath: FacetSlotPath | undefined,
    fieldIds: number[]
  ) {
    if (!selectedVizId || !slotPath) return;
    const variableNames = fieldIds
      .map((id) => dataFields.find((field) => field.id === id)?.text)
      .filter((name): name is string => Boolean(name));
    const merged =
      baseVariableName && !variableNames.includes(baseVariableName)
        ? [baseVariableName, ...variableNames]
        : variableNames;
    await facetsStore.updateVariables(selectedVizId, merged, slotPath);
  }

  async function handleFacetsToggle(
    baseVariableName: string,
    slotPath: FacetSlotPath | undefined,
    enabled: boolean
  ) {
    if (!selectedVizId || !slotPath) return;
    if (!enabled) {
      facetsStore.disable();
      return;
    }

    const available = dataFields
      .map((field) => field.text)
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
    min={1}
    max={SLIDER_LIMITS.strokeWidth.max}
    showMinMax={showSliderBounds}
    inputWidth={sliderInputWidth}
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
      <FacetsVariablePicker
        bind:open={facetsPickerOpen}
        titleText={m.color_according()}
        dataFields={dataFields}
        singleSelectItems={selectableDataFields}
        selectedFieldId={colorFieldId}
        selectedFieldIds={getFacetsSelectedFieldIds(facetsValueSlotPath)}
        isCollectionEnabled={isFacetsActiveForSlot(facetsValueSlotPath)}
        onSelect={handleColorFieldSelect}
        onCollectionChange={(ids) =>
          handleFacetsVariablesChange(
            valueColumnName,
            facetsValueSlotPath,
            ids
          )}
        onToggleCollection={(enabled) =>
          handleFacetsToggle(valueColumnName, facetsValueSlotPath, enabled)}
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
        selectedFieldIds={getFacetsSelectedFieldIds(facetsCategorySlotPath)}
        isCollectionEnabled={isFacetsActiveForSlot(facetsCategorySlotPath)}
        onSelect={handleColorFieldSelect}
        onCollectionChange={(ids) =>
          handleFacetsVariablesChange(
            categoryColumnName,
            facetsCategorySlotPath,
            ids
          )}
        onToggleCollection={(enabled) =>
          handleFacetsToggle(
            categoryColumnName,
            facetsCategorySlotPath,
            enabled
          )}
      />
    </div>
    <DiscretizationRow
      label={m.category_aspect()}
      value={m.categories_count({ count: categoryCount })}
      onsettings={onOpenDiscretization}
    />
    <PalettePreview
      label={m.color_palette()}
      colors={resolvedCategoriesPalette}
      selectedPaletteId={strokeClassification?.paletteId}
      inverted={strokeClassification?.inverted ?? false}
      paletteType={PALETTE_TYPE.QUALITATIVE}
      categoriesMode={true}
      categoriesVariant="lines"
      categoryLabels={resolvedCategoryLabels}
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
