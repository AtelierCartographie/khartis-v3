<script lang="ts">
  import { rowScopeStore } from '$lib/features/map';
  import { setMissingDataAvailability } from '../shared/missing-data-availability';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { VizFilterButton, VizFilterPanel } from '../shared';
  import TextAppearanceSection from './text-appearance-section.svelte';
  import TextLabelSection from './text-label-section.svelte';
  import TextMissingDataSection from './text-missing-data-section.svelte';
  import TextSizeSection from './text-size-section.svelte';
  import type {
    ClassificationConfig,
    MissingDataConfig,
    TextSecondaryLabelsConfig,
    VisualizationConfig,
    VisualizationModes,
    VizDataFilter
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import { PrimitiveFilterType } from '$lib/features/commons/stores/visualization.store.svelte';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import type { FilterStats } from '$lib/features/duckdb';
  import * as m from '$lib/paraglide/messages';
  import {
    ColorMode,
    DEFAULT_COLORS,
    SizeMode,
    VISUALIZATION_DEFAULTS
  } from '$lib/features/commons/constants/visualization.constants';
  import {
    DEFAULT_QUALITATIVE_PREVIEW,
    DEFAULT_SEQUENTIAL_PREVIEW
  } from '$lib/features/commons/components/palette-popover/palette.constants';
  import {
    CARTOGRAPHIC_FONT_FAMILY,
    clampFontSize,
    MAX_FONT_SIZE,
    MIN_FONT_SIZE,
    normalizeFontFamily
  } from '$lib/features/step-toolbar/fonts.constants';
  import DiscretizationModal from '../discretization/discretization-modal.svelte';
  import TextStylePopover from './text-style-popover.svelte';
  import { makeTextStyleHandlers } from './text-style-handlers.utils';
  import {
    resolveSecondaryTextSize,
    resolveTextHierarchy,
    type TextHierarchy
  } from './text-hierarchy.utils';
  import type { TextAlignment } from './text-alignment.utils';
  import { resolveDiscretizationLabel } from '../discretization/discretization.utils';
  import {
    NONE_FIELD_ID,
    useFieldSelection
  } from '../../hooks/use-field-selection.svelte';
  import { useCategoryLabels } from '../../hooks/use-category-labels.svelte';
  import { useFacetsVariableSelection } from '../../hooks/use-facets-variable-selection.svelte';
  import { coerceString, parseOpacityToSlider } from '../../utils/coerce.utils';

  interface Props {
    open?: boolean;
    onToggle?: (expanded: boolean) => void;
    dataFields?: Array<{ id: number; text: string; type?: string }>;
    visualization?: VisualizationConfig;
    disabled?: boolean;
    onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
    onModesChange?: (updates: Partial<VisualizationModes>) => void;
    onMissingDataChange?: (updates: Partial<MissingDataConfig>) => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
    onMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
    onInvertPalette?: () => void;
    onToggleVisibility?: (checked: boolean) => void;
    onSecondaryLabelsChange?: (
      updates: Partial<TextSecondaryLabelsConfig>
    ) => void;
    filters?: VizDataFilter[];
    filterStats?: FilterStats;
    onAddFilter?: (filter: Omit<VizDataFilter, 'id'>) => void;
    onUpdateFilter?: (
      filterId: string,
      updates: Partial<Omit<VizDataFilter, 'id'>>
    ) => void;
    onRemoveFilter?: (filterId: string) => void;
    onClearFilters?: () => void;
  }

  let {
    dataFields = [],
    visualization,
    disabled = false,
    onStyleChange,
    onMissingDataChange,
    onClassificationChange,
    onMappingChange,
    onInvertPalette,
    onToggleVisibility,
    onModesChange,
    onSecondaryLabelsChange,
    filters = [],
    filterStats,
    onAddFilter,
    onUpdateFilter,
    onRemoveFilter,
    onClearFilters,
    open,
    onToggle
  }: Props = $props();

  setMissingDataAvailability(() =>
    visualization
      ? rowScopeStore.hasMissingData(visualization.id, PrimitiveFilterType.TEXT)
      : false
  );

  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);
  const secondaryFieldItems = $derived([noneOption, ...dataFields]);

  let discretizationModalOpen = $state(false);
  let discretizationTarget = $state<'size' | 'color'>('size');
  let filterSectionVisible = $state(false);

  const labelFieldSelection = useFieldSelection(() => dataFields);
  // Labels carry one value column: the size classes and the colour classes read
  // the same variable and share a single classification.
  const valueFieldSelection = useFieldSelection(() => dataFields);
  const categoryFieldSelection = useFieldSelection(() => dataFields);
  const secondaryLabelFieldSelection = useFieldSelection(() => dataFields);
  const textFacetsSelection = useFacetsVariableSelection({
    getVisualizationId: () => visualization?.id,
    getDataFields: () => dataFields
  });

  let textColor = $state<string>(DEFAULT_COLORS.text);
  let textOpacity = $state<number>(VISUALIZATION_DEFAULTS.textOpacity);
  let fontFamily = $state<string>(CARTOGRAPHIC_FONT_FAMILY);
  let bold = $state<boolean>(false);
  let italic = $state<boolean>(false);
  let size = $state<number>(VISUALIZATION_DEFAULTS.textSize);
  let sizeMode = $state<SizeMode>(SizeMode.FIXED);
  let colorMode = $state<ColorMode>(ColorMode.UNIQUE);
  let alignment = $state<TextAlignment>('center');
  let halo = $state<boolean>(false);
  let haloColor = $state<string>(DEFAULT_COLORS.halo);
  let haloWidth = $state<number>(VISUALIZATION_DEFAULTS.haloWidth);

  let secondaryFontFamily = $state<string>(CARTOGRAPHIC_FONT_FAMILY);
  let secondarySize = $state<number>(VISUALIZATION_DEFAULTS.labelSize);
  let secondaryBold = $state<boolean>(false);
  let secondaryItalic = $state<boolean>(false);
  let secondaryAlignment = $state<TextAlignment>('center');

  let showMissingData = $state<boolean>(true);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);
  let missingDataLabel = $state<string>(m.missing_data_text());

  type StyleSection = 'primary' | 'secondary';
  type FormatTriggerRef = HTMLButtonElement | HTMLAnchorElement | null;
  const TEXT_SIZE_SLIDER_MIN = MIN_FONT_SIZE;
  const TEXT_SIZE_SLIDER_MAX = MAX_FONT_SIZE;
  const TEXT_SIZE_MODES = [
    SizeMode.FIXED,
    SizeMode.PROPORTIONAL,
    SizeMode.CLASSES
  ] as const;
  const TEXT_COLOR_MODES = [
    ColorMode.UNIQUE,
    ColorMode.CLASSES,
    ColorMode.CATEGORIES
  ] as const;
  let showStylePopover = $state(false);
  let activeStyleSection = $state<StyleSection>('primary');
  let stylePopoverTrigger = $state<HTMLElement | undefined>();
  let primaryTriggerRef = $state<FormatTriggerRef>(null);
  let secondaryTriggerRef = $state<FormatTriggerRef>(null);
  let sizePickerOpen = $state(false);
  let colorPickerOpen = $state(false);
  let categoryPickerOpen = $state(false);
  let categoriesPopoverOpen = $state(false);

  const enabled = $derived((visualization?.style.textOpacity ?? 0) > 0);
  const hasPrimaryField = $derived(
    labelFieldSelection.selectedFieldId !== NONE_FIELD_ID
  );
  const hasSecondaryField = $derived(
    secondaryLabelFieldSelection.selectedFieldId !== NONE_FIELD_ID
  );
  // The hierarchy is the contract between the two texts: once chosen it holds
  // through every size change, where the stored sizes only seed it — a project
  // reopened at 9 pt and 8 pt starts on the closest preset.
  let requestedHierarchy = $state<
    { visualizationId: string | undefined; value: TextHierarchy } | undefined
  >(undefined);
  const hierarchy = $derived(
    requestedHierarchy &&
      requestedHierarchy.visualizationId === visualization?.id
      ? requestedHierarchy.value
      : resolveTextHierarchy(size, secondarySize)
  );
  const activeDiscretizationVisualization = $derived(visualization);
  const activeDiscretizationClassification = $derived.by(
    () =>
      visualization?.text?.classification ??
      visualization?.textClassification ??
      visualization?.classification
  );
  const activeDiscretizationValueColumn = $derived(
    visualization?.text?.valueColumn ?? visualization?.mapping.valueColumn
  );
  const currentPalette = $derived(
    activeDiscretizationClassification?.colors ?? DEFAULT_SEQUENTIAL_PREVIEW
  );
  const categoriesPalette = $derived(
    activeDiscretizationClassification?.colors ?? DEFAULT_QUALITATIVE_PREVIEW
  );
  const dataset = $derived(
    visualization
      ? (datasetsStore.datasets.find((d) => d.id === visualization.datasetId) ??
          datasetsStore.selectedDataset)
      : datasetsStore.selectedDataset
  );
  const categoryColumnName = $derived(
    categoryFieldSelection.selectedFieldName ?? ''
  );
  const categoryLabels = useCategoryLabels({
    enabled: () => colorMode === ColorMode.CATEGORIES,
    getDataset: () => dataset,
    getColumnName: () =>
      visualization?.mapping.categoryColumn ?? categoryColumnName,
    getClassification: () => activeDiscretizationClassification,
    fallbackCount: 4
  });

  const textSizeDiscretizationLabel = $derived.by(() =>
    resolveDiscretizationLabel(
      activeDiscretizationClassification
        ? { ...activeDiscretizationClassification }
        : undefined
    )
  );

  $effect(() => {
    labelFieldSelection.sync(visualization?.mapping.labelColumn);
    valueFieldSelection.sync(visualization?.mapping.valueColumn);
    categoryFieldSelection.sync(visualization?.mapping.categoryColumn);
    secondaryLabelFieldSelection.sync(
      visualization?.mapping.secondaryLabelColumn
    );
  });

  $effect(() => {
    if (visualization?.style) {
      textOpacity = parseOpacityToSlider(
        visualization.style.textOpacity,
        VISUALIZATION_DEFAULTS.textOpacity
      );
      textColor =
        coerceString(visualization.style.textColor) ?? DEFAULT_COLORS.text;
      fontFamily =
        normalizeFontFamily(visualization.style.textFontFamily) ??
        CARTOGRAPHIC_FONT_FAMILY;
      bold = visualization.style.textBold ?? false;
      italic = visualization.style.textItalic ?? false;
      size = clampFontSize(
        visualization.style.textSize,
        VISUALIZATION_DEFAULTS.textSize
      );
      sizeMode = visualization.modes?.size ?? SizeMode.FIXED;
      colorMode = visualization.modes?.color ?? ColorMode.UNIQUE;
      alignment = visualization.style.textAlign ?? 'center';
      halo = visualization.style.textHalo ?? false;
      haloColor = visualization.style.textHaloColor ?? DEFAULT_COLORS.halo;
      haloWidth =
        visualization.style.textHaloWidth ?? VISUALIZATION_DEFAULTS.haloWidth;

      secondaryFontFamily =
        normalizeFontFamily(visualization.style.labelFontFamily) ??
        CARTOGRAPHIC_FONT_FAMILY;
      secondarySize = clampFontSize(
        visualization.style.labelSize,
        VISUALIZATION_DEFAULTS.labelSize
      );
      secondaryBold = visualization.style.labelBold ?? false;
      secondaryItalic = visualization.style.labelItalic ?? false;
      secondaryAlignment = visualization.style.labelAlign ?? 'center';
    }

    const missingData =
      visualization?.text?.missingData ?? visualization?.missingData;
    if (missingData) {
      showMissingData = missingData.show ?? true;
      missingDataColor = missingData.color ?? DEFAULT_COLORS.missingData;
      missingDataLabel = missingData.label ?? m.missing_data_text();
    }
  });

  function handleLabelFieldSelect(fieldId: number) {
    labelFieldSelection.set(fieldId);

    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({
        labelColumn: undefined,
        secondaryLabelColumn: undefined
      });
      onSecondaryLabelsChange?.({ enabled: false, labelColumn: undefined });
      showStylePopover = false;
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onMappingChange?.({ labelColumn: field.text });
    }
  }

  function handleSecondaryFieldSelect(fieldId: number) {
    secondaryLabelFieldSelection.set(fieldId);

    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ secondaryLabelColumn: undefined });
      onSecondaryLabelsChange?.({ enabled: false, labelColumn: undefined });
      showStylePopover = false;
      return;
    }

    const field = secondaryFieldItems.find((item) => item.id === fieldId);
    if (!field) {
      return;
    }

    onMappingChange?.({ secondaryLabelColumn: field.text });

    const updates: Partial<TextSecondaryLabelsConfig> = {
      enabled: true,
      labelColumn: field.text,
      color: textColor,
      halo,
      haloColor,
      haloWidth
    };

    if (
      (visualization?.style.labelOpacity ?? 0) <= 0 ||
      visualization?.style.labelOpacity === undefined
    ) {
      updates.opacity = VISUALIZATION_DEFAULTS.labelOpacity / 100;
    }

    onSecondaryLabelsChange?.(updates);
  }

  const primaryTextStyleHandlers = makeTextStyleHandlers({
    setFontFamily: (value) => {
      fontFamily = value;
    },
    emitFontFamily: (value) => onStyleChange?.({ textFontFamily: value }),
    setBold: (value) => {
      bold = value;
    },
    emitBold: (value) => onStyleChange?.({ textBold: value }),
    setItalic: (value) => {
      italic = value;
    },
    emitItalic: (value) => onStyleChange?.({ textItalic: value }),
    setAlignment: (value) => {
      alignment = value;
    },
    emitAlignment: (value) => onStyleChange?.({ textAlign: value })
  });

  const secondaryTextStyleHandlers = makeTextStyleHandlers({
    setFontFamily: (value) => {
      secondaryFontFamily = value;
    },
    emitFontFamily: (value) => onSecondaryLabelsChange?.({ fontFamily: value }),
    setBold: (value) => {
      secondaryBold = value;
    },
    emitBold: (value) => onSecondaryLabelsChange?.({ bold: value }),
    setItalic: (value) => {
      secondaryItalic = value;
    },
    emitItalic: (value) => onSecondaryLabelsChange?.({ italic: value }),
    setAlignment: (value) => {
      secondaryAlignment = value;
    },
    emitAlignment: (value) => onSecondaryLabelsChange?.({ align: value })
  });

  // One colour and one outline for both texts: the secondary label names the
  // same feature as the primary, so it is styled with it, not beside it.
  function handleTextColorChange(value: string) {
    textColor = value;
    onStyleChange?.({ textColor: value });
    onSecondaryLabelsChange?.({ color: value });
  }

  function handleTextOpacityChange(value: number) {
    textOpacity = value;
    onStyleChange?.({ textOpacity: value / 100 });
    onSecondaryLabelsChange?.({ opacity: value / 100 });
  }

  function handleHaloToggle(value: boolean) {
    halo = value;
    onStyleChange?.({ textHalo: value });
    onSecondaryLabelsChange?.({ halo: value });
  }

  function handleHaloColorChange(value: string) {
    haloColor = value;
    onStyleChange?.({ textHaloColor: value });
    onSecondaryLabelsChange?.({ haloColor: value });
  }

  function handleHaloWidthChange(value: number) {
    haloWidth = value;
    onStyleChange?.({ textHaloWidth: value });
    onSecondaryLabelsChange?.({ haloWidth: value });
  }

  // The slider carries the whole type scale: both texts are multiplied by it so
  // the hierarchy set in the style popover survives every size change.
  function applySecondaryTextSize(
    primarySize: number,
    nextHierarchy: TextHierarchy
  ) {
    const nextSecondarySize = resolveSecondaryTextSize(
      primarySize,
      nextHierarchy
    );
    secondarySize = nextSecondarySize;
    onSecondaryLabelsChange?.({ size: nextSecondarySize });
  }

  function handleTextSizeChange(value: number) {
    const nextSize = clampFontSize(value, VISUALIZATION_DEFAULTS.textSize);

    size = nextSize;
    onStyleChange?.({ textSize: nextSize });
    applySecondaryTextSize(nextSize, hierarchy);
  }

  function handleHierarchyChange(nextHierarchy: TextHierarchy) {
    requestedHierarchy = {
      visualizationId: visualization?.id,
      value: nextHierarchy
    };
    applySecondaryTextSize(size, nextHierarchy);
  }

  function handleSizeModeChange(index: number) {
    const nextMode = TEXT_SIZE_MODES[index] ?? SizeMode.FIXED;
    if (nextMode === sizeMode) {
      return;
    }

    sizeMode = nextMode;
    onModesChange?.({ size: nextMode });
  }

  function handleColorModeChange(index: number) {
    const nextMode = TEXT_COLOR_MODES[index] ?? ColorMode.UNIQUE;
    if (nextMode === colorMode) {
      return;
    }

    colorMode = nextMode;
    onModesChange?.({ color: nextMode });
  }

  function handleValueFieldSelect(fieldId: number) {
    valueFieldSelection.set(fieldId);
    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ valueColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onMappingChange?.({ valueColumn: field.text });
    }
  }

  function handleCategoryFieldSelect(fieldId: number) {
    categoryFieldSelection.set(fieldId);
    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ categoryColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onMappingChange?.({ categoryColumn: field.text });
    }
  }

  function handleToggleChange(checked: boolean) {
    if (checked && textOpacity <= 0) {
      textOpacity = VISUALIZATION_DEFAULTS.textOpacity;
      onStyleChange?.({ textOpacity: textOpacity / 100 });
    }
    onToggleVisibility?.(checked);
  }

  function handleMissingDataShowChange(value: boolean) {
    showMissingData = value;
    onMissingDataChange?.({ show: value });
  }

  function handleMissingDataColorChange(value: string) {
    missingDataColor = value;
    onMissingDataChange?.({ color: value });
  }

  function handleMissingDataLabelChange(value: string) {
    missingDataLabel = value;
    onMissingDataChange?.({ label: value });
  }

  function openTextSizeDiscretization() {
    discretizationTarget = 'size';
    discretizationModalOpen = true;
  }

  function openTextColorDiscretization() {
    discretizationTarget = 'color';
    discretizationModalOpen = true;
  }

  function handleDiscretizationChange(
    classification: Partial<ClassificationConfig>
  ) {
    onClassificationChange?.(classification);
  }

  function toggleStylePopover(
    section: StyleSection,
    triggerRef: FormatTriggerRef
  ) {
    const isSameSectionOpen =
      showStylePopover && activeStyleSection === section;

    activeStyleSection = section;
    stylePopoverTrigger = triggerRef ?? undefined;
    showStylePopover = !isSameSectionOpen;
  }

  function togglePrimaryFormat() {
    toggleStylePopover('primary', primaryTriggerRef);
  }

  function toggleSecondaryFormat() {
    if (!hasPrimaryField || !hasSecondaryField) {
      return;
    }

    toggleStylePopover('secondary', secondaryTriggerRef);
  }

  const valueColumnName = $derived(valueFieldSelection.selectedFieldName ?? '');
</script>

<div class="viz-panel-shell texts-panel-shell">
  <ExpandableSection
    scrollIntoViewOnOpen
    open={open}
    onToggle={onToggle}
    title={m.texts_title()}
    description={disabled ? m.primitive_unavailable() : undefined}
    defaultOpen={false}
    showToggle
    toggleVariant="suggestions"
    actionsEnd
    toggleChecked={enabled}
    disabled={disabled}
    disabledReason={disabled ? m.texts_disabled_no_geometry() : undefined}
    onToggleChange={handleToggleChange}
  >
    {#snippet icon()}
      <VizFilterButton
        active={filterSectionVisible || filters.length > 0}
        count={filters.length}
        onToggle={() => {
          filterSectionVisible = !filterSectionVisible;
        }}
      />
    {/snippet}

    <div class="texts-config">
      <TextLabelSection
        selectableDataFields={selectableDataFields}
        secondaryFieldItems={secondaryFieldItems}
        primarySelectedId={labelFieldSelection.selectedFieldId}
        secondarySelectedId={secondaryLabelFieldSelection.selectedFieldId}
        hasPrimaryField={hasPrimaryField}
        hasSecondaryField={hasSecondaryField}
        showStylePopover={showStylePopover}
        activeStyleSection={activeStyleSection}
        bind:primaryTriggerRef={primaryTriggerRef}
        bind:secondaryTriggerRef={secondaryTriggerRef}
        onPrimarySelect={handleLabelFieldSelect}
        onSecondarySelect={handleSecondaryFieldSelect}
        onTogglePrimaryFormat={togglePrimaryFormat}
        onToggleSecondaryFormat={toggleSecondaryFormat}
      />

      <TextMissingDataSection
        show={showMissingData}
        label={missingDataLabel}
        color={missingDataColor}
        onShowChange={handleMissingDataShowChange}
        onLabelChange={handleMissingDataLabelChange}
        onColorChange={handleMissingDataColorChange}
      />

      <TextSizeSection
        sizeMode={sizeMode}
        size={size}
        sizeMin={TEXT_SIZE_SLIDER_MIN}
        sizeMax={TEXT_SIZE_SLIDER_MAX}
        sizeColumnName={valueColumnName}
        bind:sizePickerOpen={sizePickerOpen}
        dataFields={dataFields}
        selectableDataFields={selectableDataFields}
        sizeFieldSelection={valueFieldSelection}
        facetsSelection={textFacetsSelection}
        discretizationLabel={textSizeDiscretizationLabel}
        onSizeModeChange={handleSizeModeChange}
        onSizeChange={handleTextSizeChange}
        onSizeFieldSelect={handleValueFieldSelect}
        onOpenDiscretization={openTextSizeDiscretization}
      />

      <TextAppearanceSection
        colorMode={colorMode}
        color={textColor}
        opacity={textOpacity}
        halo={halo}
        haloColor={haloColor}
        haloWidth={haloWidth}
        valueColumnName={valueColumnName}
        categoryColumnName={categoryColumnName}
        colorDiscretizationLabel={textSizeDiscretizationLabel}
        classification={activeDiscretizationClassification}
        palette={currentPalette}
        categoriesPalette={categoriesPalette}
        categoryLabels={categoryLabels.labels}
        categoryCount={categoryLabels.count}
        bind:colorPickerOpen={colorPickerOpen}
        bind:categoryPickerOpen={categoryPickerOpen}
        bind:categoriesPopoverOpen={categoriesPopoverOpen}
        dataFields={dataFields}
        selectableDataFields={selectableDataFields}
        valueFieldSelection={valueFieldSelection}
        categoryFieldSelection={categoryFieldSelection}
        facetsSelection={textFacetsSelection}
        onColorModeChange={handleColorModeChange}
        onColorChange={handleTextColorChange}
        onOpacityChange={handleTextOpacityChange}
        onValueFieldSelect={handleValueFieldSelect}
        onCategoryFieldSelect={handleCategoryFieldSelect}
        onOpenColorDiscretization={openTextColorDiscretization}
        onClassificationChange={handleDiscretizationChange}
        onInvertPalette={onInvertPalette}
        onHaloToggle={handleHaloToggle}
        onHaloColorChange={handleHaloColorChange}
        onHaloWidthChange={handleHaloWidthChange}
      />
    </div>
  </ExpandableSection>

  {#if filterSectionVisible}
    <VizFilterPanel
      title={m.texts_title()}
      dataFields={dataFields}
      filters={filters}
      stats={filterStats}
      onAddFilter={onAddFilter ?? (() => {})}
      onUpdateFilter={onUpdateFilter}
      onRemoveFilter={onRemoveFilter ?? (() => {})}
      onClearFilters={onClearFilters}
      onClose={() => {
        filterSectionVisible = false;
      }}
    />
  {/if}

  <DiscretizationModal
    bind:open={discretizationModalOpen}
    visualization={activeDiscretizationVisualization}
    classification={activeDiscretizationClassification}
    valueColumn={activeDiscretizationValueColumn}
    role={discretizationTarget === 'color' ? 'fill' : 'size'}
    showBreakpointControls={discretizationTarget === 'color'}
    onchange={handleDiscretizationChange}
  />

  <TextStylePopover
    bind:open={showStylePopover}
    triggerElement={stylePopoverTrigger}
    hierarchy={hierarchy}
    onHierarchyChange={handleHierarchyChange}
    primary={{
      fontFamily,
      bold,
      italic,
      align: alignment,
      ...primaryTextStyleHandlers
    }}
    secondary={hasSecondaryField
      ? {
          fontFamily: secondaryFontFamily,
          bold: secondaryBold,
          italic: secondaryItalic,
          align: secondaryAlignment,
          ...secondaryTextStyleHandlers
        }
      : undefined}
  />
</div>

<style lang="scss">
  .texts-config {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-param);
    padding: var(--cds-spacing-03);
  }

  :global(.text-input-field .bx--text-input) {
    height: var(--kh-size-sm);
  }

  :global(.text-input-field .bx--text-input__field-wrapper) {
    background: var(--cds-field-01, #f4f4f4);
  }

  :global(.texts-panel-shell .field-picker .bx--label) {
    margin-bottom: var(--kh-gap-label);
  }

  :global(.texts-panel-shell .field-picker .bx--list-box__field) {
    min-height: var(--kh-size-sm);
    background: var(--cds-field-01, #f4f4f4);
  }
</style>
