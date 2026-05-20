<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { InfoPopover, VizFilterButton, VizFilterPanel } from '../shared';
  import TextBackgroundSection from './text-background-section.svelte';
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
  import * as m from '$lib/paraglide/messages';
  import {
    DEFAULT_COLORS,
    SizeMode,
    VISUALIZATION_DEFAULTS
  } from '$lib/features/commons/constants/visualization.constants';
  import {
    CARTOGRAPHIC_FONT_FAMILY,
    clampFontSize,
    MAX_FONT_SIZE,
    MIN_FONT_SIZE,
    normalizeFontFamily
  } from '$lib/features/step-toolbar/fonts.constants';
  import DiscretizationModal from '../discretization/discretization-modal.svelte';
  import TextStylePopover from './text-style-popover.svelte';
  import { resolveDiscretizationLabel } from '../discretization/discretization.utils';
  import {
    NONE_FIELD_ID,
    useFieldSelection
  } from '../../hooks/use-field-selection.svelte';
  import { useFacetsVariableSelection } from '../../hooks/use-facets-variable-selection.svelte';
  import { coerceString, parseOpacityToSlider } from '../../utils/coerce.utils';

  interface Props {
    dataFields?: Array<{ id: number; text: string; type?: string }>;
    visualization?: VisualizationConfig;
    backgroundVisualization?: VisualizationConfig;
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
    onBackgroundStyleChange?: (
      updates: Partial<VisualizationConfig['style']>
    ) => void;
    onBackgroundModesChange?: (updates: Partial<VisualizationModes>) => void;
    onBackgroundClassificationChange?: (
      updates: Partial<ClassificationConfig>
    ) => void;
    onBackgroundStrokeClassificationChange?: (
      updates: Partial<ClassificationConfig>
    ) => void;
    onBackgroundStrokeMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
    onBackgroundMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
    onBackgroundInvertPalette?: () => void;
    onBackgroundStrokeInvertPalette?: () => void;
    filters?: VizDataFilter[];
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
    onToggleVisibility,
    onModesChange,
    onSecondaryLabelsChange,
    filters = [],
    onAddFilter,
    onUpdateFilter,
    onRemoveFilter,
    onClearFilters
  }: Props = $props();

  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);
  const secondaryFieldItems = $derived([noneOption, ...dataFields]);

  let discretizationModalOpen = $state(false);
  let filterSectionVisible = $state(false);

  const labelFieldSelection = useFieldSelection(() => dataFields);
  const sizeFieldSelection = useFieldSelection(() => dataFields);
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
  let alignment = $state<'left' | 'center' | 'right'>('center');
  let halo = $state<boolean>(false);
  let haloColor = $state<string>(DEFAULT_COLORS.halo);
  let haloWidth = $state<number>(VISUALIZATION_DEFAULTS.haloWidth);
  let collisionDetection = $state<boolean>(true);
  let dxpMasking = $state<boolean>(false);

  let secondaryColor = $state<string>(DEFAULT_COLORS.text);
  let secondaryOpacity = $state<number>(VISUALIZATION_DEFAULTS.labelOpacity);
  let secondaryFontFamily = $state<string>(CARTOGRAPHIC_FONT_FAMILY);
  let secondarySize = $state<number>(VISUALIZATION_DEFAULTS.labelSize);
  let secondaryBold = $state<boolean>(false);
  let secondaryItalic = $state<boolean>(false);
  let secondaryAlignment = $state<'left' | 'center' | 'right'>('center');
  let secondaryHalo = $state<boolean>(false);
  let secondaryHaloColor = $state<string>(DEFAULT_COLORS.halo);
  let secondaryHaloWidth = $state<number>(VISUALIZATION_DEFAULTS.haloWidth);
  let secondaryCollisionDetection = $state<boolean>(true);
  let secondaryDxpMasking = $state<boolean>(false);

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
  let showStylePopover = $state(false);
  let activeStyleSection = $state<StyleSection>('primary');
  let stylePopoverTrigger = $state<HTMLElement | undefined>();
  let primaryTriggerRef = $state<FormatTriggerRef>(null);
  let secondaryTriggerRef = $state<FormatTriggerRef>(null);
  let sizePickerOpen = $state(false);

  const enabled = $derived((visualization?.style.textOpacity ?? 0) > 0);
  const hasPrimaryField = $derived(
    labelFieldSelection.selectedFieldId !== NONE_FIELD_ID
  );
  const hasSecondaryField = $derived(
    secondaryLabelFieldSelection.selectedFieldId !== NONE_FIELD_ID
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

  const textSizeDiscretizationLabel = $derived.by(() =>
    resolveDiscretizationLabel(
      activeDiscretizationClassification
        ? { ...activeDiscretizationClassification }
        : undefined
    )
  );

  $effect(() => {
    labelFieldSelection.sync(visualization?.mapping.labelColumn);
    sizeFieldSelection.sync(visualization?.mapping.valueColumn);
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
      alignment = visualization.style.textAlign ?? 'center';
      halo = visualization.style.textHalo ?? false;
      haloColor = visualization.style.textHaloColor ?? DEFAULT_COLORS.halo;
      haloWidth =
        visualization.style.textHaloWidth ?? VISUALIZATION_DEFAULTS.haloWidth;
      collisionDetection = visualization.style.textCollisionDetection ?? false;
      dxpMasking = visualization.style.textDxpMasking ?? false;

      secondaryColor =
        coerceString(visualization.style.labelColor) ?? DEFAULT_COLORS.text;
      secondaryFontFamily =
        normalizeFontFamily(visualization.style.labelFontFamily) ??
        CARTOGRAPHIC_FONT_FAMILY;
      secondaryOpacity = parseOpacityToSlider(
        visualization.style.labelOpacity,
        VISUALIZATION_DEFAULTS.labelOpacity
      );
      secondarySize = clampFontSize(
        visualization.style.labelSize,
        VISUALIZATION_DEFAULTS.labelSize
      );
      secondaryBold = visualization.style.labelBold ?? false;
      secondaryItalic = visualization.style.labelItalic ?? false;
      secondaryAlignment = visualization.style.labelAlign ?? 'center';
      secondaryHalo = visualization.style.labelHalo ?? false;
      secondaryHaloColor =
        visualization.style.labelHaloColor ?? DEFAULT_COLORS.halo;
      secondaryHaloWidth =
        visualization.style.labelHaloWidth ?? VISUALIZATION_DEFAULTS.haloWidth;
      secondaryCollisionDetection =
        visualization.style.labelCollisionDetection ?? true;
      secondaryDxpMasking = visualization.style.labelDxpMasking ?? false;
    }

    if (visualization?.missingData) {
      showMissingData = visualization.missingData.show ?? true;
      missingDataColor =
        visualization.missingData.color ?? DEFAULT_COLORS.missingData;
      missingDataLabel =
        visualization.missingData.label ?? m.missing_data_text();
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
      labelColumn: field.text
    };

    if (
      (visualization?.style.labelOpacity ?? 0) <= 0 ||
      visualization?.style.labelOpacity === undefined
    ) {
      updates.opacity = VISUALIZATION_DEFAULTS.labelOpacity / 100;
    }

    onSecondaryLabelsChange?.(updates);
  }

  function handleTextColorChange(value: string) {
    textColor = value;
    onStyleChange?.({ textColor: value });
  }

  function handleTextOpacityChange(value: number) {
    textOpacity = value;
    onStyleChange?.({ textOpacity: value / 100 });
  }

  function handleFontFamilyChange(value: string) {
    fontFamily = value;
    onStyleChange?.({ textFontFamily: value });
  }

  function handleBoldChange(value: boolean) {
    bold = value;
    onStyleChange?.({ textBold: value });
  }

  function handleItalicChange(value: boolean) {
    italic = value;
    onStyleChange?.({ textItalic: value });
  }

  function handleSizeChange(value: number) {
    const nextSize = clampFontSize(value, VISUALIZATION_DEFAULTS.textSize);
    size = nextSize;
    onStyleChange?.({ textSize: nextSize });
  }

  function handleSizeModeChange(index: number) {
    const nextMode = TEXT_SIZE_MODES[index] ?? SizeMode.FIXED;
    if (nextMode === sizeMode) {
      return;
    }

    sizeMode = nextMode;
    onModesChange?.({ size: nextMode });
  }

  function handleSizeFieldSelect(fieldId: number) {
    sizeFieldSelection.set(fieldId);
    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ valueColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onMappingChange?.({ valueColumn: field.text });
    }
  }

  function handleAlignmentChange(value: 'left' | 'center' | 'right') {
    alignment = value;
    onStyleChange?.({ textAlign: value });
  }

  function handleHaloToggle(value: boolean) {
    halo = value;
    onStyleChange?.({ textHalo: value });
  }

  function handleHaloColorChange(value: string) {
    haloColor = value;
    onStyleChange?.({ textHaloColor: value });
  }

  function handleHaloWidthChange(value: number) {
    haloWidth = value;
    onStyleChange?.({ textHaloWidth: value });
  }

  function handleCollisionDetectionChange(value: boolean) {
    collisionDetection = value;
    onStyleChange?.({ textCollisionDetection: value });
  }

  function handleDxpMaskingChange(value: boolean) {
    dxpMasking = value;
    onStyleChange?.({ textDxpMasking: value });
  }

  function handleSecondaryColorChange(value: string) {
    secondaryColor = value;
    onSecondaryLabelsChange?.({ color: value });
  }

  function handleSecondaryOpacityChange(value: number) {
    secondaryOpacity = value;
    onSecondaryLabelsChange?.({ opacity: value / 100 });
  }

  function handleSecondaryFontFamilyChange(value: string) {
    secondaryFontFamily = value;
    onSecondaryLabelsChange?.({ fontFamily: value });
  }

  function handleSecondarySizeChange(value: number) {
    const nextSize = clampFontSize(value, VISUALIZATION_DEFAULTS.labelSize);
    secondarySize = nextSize;
    onSecondaryLabelsChange?.({ size: nextSize });
  }

  function handleSecondaryBoldChange(value: boolean) {
    secondaryBold = value;
    onSecondaryLabelsChange?.({ bold: value });
  }

  function handleSecondaryItalicChange(value: boolean) {
    secondaryItalic = value;
    onSecondaryLabelsChange?.({ italic: value });
  }

  function handleSecondaryAlignmentChange(value: 'left' | 'center' | 'right') {
    secondaryAlignment = value;
    onSecondaryLabelsChange?.({ align: value });
  }

  function handleSecondaryHaloToggle(value: boolean) {
    secondaryHalo = value;
    onSecondaryLabelsChange?.({ halo: value });
  }

  function handleSecondaryHaloColorChange(value: string) {
    secondaryHaloColor = value;
    onSecondaryLabelsChange?.({ haloColor: value });
  }

  function handleSecondaryHaloWidthChange(value: number) {
    secondaryHaloWidth = value;
    onSecondaryLabelsChange?.({ haloWidth: value });
  }

  function handleSecondaryCollisionChange(value: boolean) {
    secondaryCollisionDetection = value;
    onSecondaryLabelsChange?.({ collisionDetection: value });
  }

  function handleSecondaryDxpMaskingChange(value: boolean) {
    secondaryDxpMasking = value;
    onSecondaryLabelsChange?.({ dxpMasking: value });
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

  const sizeColumnName = $derived(sizeFieldSelection.selectedFieldName ?? '');
</script>

<div class="viz-panel-shell texts-panel-shell">
  <ExpandableSection
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
      <InfoPopover text={m.texts_section_info()} />
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
        bind:label={missingDataLabel}
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
        sizeColumnName={sizeColumnName}
        bind:sizePickerOpen={sizePickerOpen}
        dataFields={dataFields}
        selectableDataFields={selectableDataFields}
        sizeFieldSelection={sizeFieldSelection}
        facetsSelection={textFacetsSelection}
        discretizationLabel={textSizeDiscretizationLabel}
        onSizeModeChange={handleSizeModeChange}
        onSizeChange={handleSizeChange}
        onSizeFieldSelect={handleSizeFieldSelect}
        onOpenDiscretization={openTextSizeDiscretization}
      />

      <TextBackgroundSection
        color={textColor}
        opacity={textOpacity}
        halo={halo}
        haloColor={haloColor}
        haloWidth={haloWidth}
        onColorChange={handleTextColorChange}
        onOpacityChange={handleTextOpacityChange}
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
    role="size"
    onchange={handleDiscretizationChange}
  />

  <TextStylePopover
    bind:open={showStylePopover}
    triggerElement={stylePopoverTrigger}
    primary={{
      color: textColor,
      opacity: textOpacity,
      fontFamily,
      bold,
      italic,
      size,
      align: alignment,
      halo,
      haloColor,
      haloWidth,
      collisionDetection,
      dxpMasking,
      onColorChange: handleTextColorChange,
      onOpacityChange: handleTextOpacityChange,
      onFontFamilyChange: handleFontFamilyChange,
      onBoldChange: handleBoldChange,
      onItalicChange: handleItalicChange,
      onSizeChange: handleSizeChange,
      onAlignmentChange: handleAlignmentChange,
      onHaloChange: handleHaloToggle,
      onHaloColorChange: handleHaloColorChange,
      onHaloWidthChange: handleHaloWidthChange,
      onCollisionDetectionChange: handleCollisionDetectionChange,
      onDxpMaskingChange: handleDxpMaskingChange
    }}
    secondary={hasSecondaryField
      ? {
          color: secondaryColor,
          opacity: secondaryOpacity,
          fontFamily: secondaryFontFamily,
          size: secondarySize,
          bold: secondaryBold,
          italic: secondaryItalic,
          align: secondaryAlignment,
          halo: secondaryHalo,
          haloColor: secondaryHaloColor,
          haloWidth: secondaryHaloWidth,
          collisionDetection: secondaryCollisionDetection,
          dxpMasking: secondaryDxpMasking,
          onColorChange: handleSecondaryColorChange,
          onOpacityChange: handleSecondaryOpacityChange,
          onFontFamilyChange: handleSecondaryFontFamilyChange,
          onSizeChange: handleSecondarySizeChange,
          onBoldChange: handleSecondaryBoldChange,
          onItalicChange: handleSecondaryItalicChange,
          onAlignmentChange: handleSecondaryAlignmentChange,
          onHaloChange: handleSecondaryHaloToggle,
          onHaloColorChange: handleSecondaryHaloColorChange,
          onHaloWidthChange: handleSecondaryHaloWidthChange,
          onCollisionDetectionChange: handleSecondaryCollisionChange,
          onDxpMaskingChange: handleSecondaryDxpMaskingChange
        }
      : undefined}
  />
</div>

<style lang="scss">
  .texts-config {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
    padding: var(--cds-spacing-04) var(--cds-spacing-03) var(--cds-spacing-05);
  }

  :global(.text-input-field .bx--text-input) {
    height: 40px;
  }

  :global(.text-input-field .bx--text-input__field-wrapper) {
    background: var(--cds-field-01, #f4f4f4);
  }

  :global(.texts-panel-shell .field-picker .bx--label) {
    margin-bottom: 0.5rem;
  }

  :global(.texts-panel-shell .field-picker .bx--list-box__field) {
    min-height: 40px;
    background: var(--cds-field-01, #f4f4f4);
  }
</style>
