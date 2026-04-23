<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import {
    InfoPopover,
    SectionHeading,
    SliderWithInput,
    StrokeSection,
    VizFilterButton,
    VizFilterPanel
  } from './shared';
  import FillSection from './shared/fill-section.svelte';
  import type {
    ClassificationConfig,
    MissingDataConfig,
    TextSecondaryLabelsConfig,
    VisualizationConfig,
    VisualizationModes,
    VizDataFilter
  } from '$lib/features/commons/store/visualization.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    DEFAULT_COLORS,
    FillMode,
    SizeMode,
    VISUALIZATION_DEFAULTS
  } from '../../constants';
  import {
    clampFontSize,
    DEFAULT_FONT_FAMILY,
    MAX_FONT_SIZE,
    MIN_FONT_SIZE,
    normalizeFontFamily
  } from '$lib/features/step-toolbar/constants/fonts.constants';
  import { FILL_MODES_STANDARD } from './shared/fill-mode-presets';
  import { Button, Dropdown, TextInput } from 'carbon-components-svelte';
  import { TextAllCaps, TextScale } from 'carbon-icons-svelte';
  import DiscretizationModal from './discretization-modal.svelte';
  import TextStylePopover from './text-style-popover.svelte';
  import { resolveDiscretizationLabel } from './discretization.utils';
  import { FACET_SLOT } from '../facets-adapter.svelte';
  import FacetsVariablePicker from './symbols/facets-variable-picker.svelte';
  import {
    NONE_FIELD_ID,
    useFieldSelection
  } from '../use-field-selection.svelte';
  import { resetVisualClassification } from './shared/classification-reset.utils';
  import { useFacetsVariableSelection } from '../use-facets-variable-selection.svelte';

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
    backgroundVisualization,
    disabled = false,
    onStyleChange,
    onMissingDataChange,
    onMappingChange,
    onToggleVisibility,
    onModesChange,
    onSecondaryLabelsChange,
    onBackgroundStyleChange,
    onBackgroundModesChange,
    onBackgroundClassificationChange,
    onBackgroundStrokeClassificationChange,
    onBackgroundStrokeMappingChange,
    onBackgroundMappingChange,
    onBackgroundInvertPalette,
    onBackgroundStrokeInvertPalette,
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
  let discretizationTarget = $state<'background-fill' | 'background-stroke'>(
    'background-fill'
  );
  let filterSectionVisible = $state(false);

  const labelFieldSelection = useFieldSelection(() => dataFields);
  const sizeFieldSelection = useFieldSelection(() => dataFields);
  const backgroundValueFieldSelection = useFieldSelection(() => dataFields);
  const backgroundCategoryFieldSelection = useFieldSelection(() => dataFields);
  const secondaryLabelFieldSelection = useFieldSelection(() => dataFields);
  const textFacetsSelection = useFacetsVariableSelection({
    getVisualizationId: () => visualization?.id,
    getDataFields: () => dataFields
  });
  const backgroundFacetsSelection = useFacetsVariableSelection({
    getVisualizationId: () => backgroundVisualization?.id,
    getDataFields: () => dataFields
  });

  let textColor = $state<string>(DEFAULT_COLORS.text);
  let textOpacity = $state<number>(VISUALIZATION_DEFAULTS.textOpacity);
  let fontFamily = $state<string>(DEFAULT_FONT_FAMILY);
  let bold = $state<boolean>(false);
  let italic = $state<boolean>(false);
  let size = $state<number>(VISUALIZATION_DEFAULTS.textSize);
  let sizeMode = $state<SizeMode>(SizeMode.FIXED);
  let alignment = $state<'left' | 'center' | 'right'>('left');
  let halo = $state<boolean>(false);
  let haloColor = $state<string>(DEFAULT_COLORS.halo);
  let haloWidth = $state<number>(VISUALIZATION_DEFAULTS.haloWidth);
  let collisionDetection = $state<boolean>(true);
  let dxpMasking = $state<boolean>(false);

  let secondaryColor = $state<string>(DEFAULT_COLORS.text);
  let secondaryOpacity = $state<number>(VISUALIZATION_DEFAULTS.labelOpacity);
  let secondaryFontFamily = $state<string>(DEFAULT_FONT_FAMILY);
  let secondarySize = $state<number>(VISUALIZATION_DEFAULTS.labelSize);
  let secondaryBold = $state<boolean>(false);
  let secondaryItalic = $state<boolean>(false);
  let secondaryAlignment = $state<'left' | 'center' | 'right'>('left');
  let secondaryHalo = $state<boolean>(false);
  let secondaryHaloColor = $state<string>(DEFAULT_COLORS.halo);
  let secondaryHaloWidth = $state<number>(VISUALIZATION_DEFAULTS.haloWidth);
  let secondaryCollisionDetection = $state<boolean>(true);
  let secondaryDxpMasking = $state<boolean>(false);

  let fillMode = $state<FillMode>(FillMode.NONE);
  let fillColor = $state<string>(DEFAULT_COLORS.fill);
  let fillOpacity = $state<number>(VISUALIZATION_DEFAULTS.fillOpacity);

  let showMissingData = $state<boolean>(true);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);
  let missingDataLabel = $state<string>(m.missing_data_text());

  type StyleSection = 'primary' | 'secondary';
  type FormatTriggerRef = HTMLButtonElement | HTMLAnchorElement | null;
  const TEXT_SIZE_SLIDER_MIN = MIN_FONT_SIZE;
  const TEXT_SIZE_SLIDER_MAX = MAX_FONT_SIZE;
  const TEXT_SIZE_MODES = [SizeMode.FIXED, SizeMode.PROPORTIONAL] as const;
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
  const backgroundAvailable = $derived(Boolean(backgroundVisualization));
  const activeDiscretizationVisualization = $derived(backgroundVisualization);
  const activeDiscretizationClassification = $derived.by(() => {
    if (discretizationTarget === 'background-stroke') {
      return backgroundVisualization?.text?.background?.strokeClassification;
    }
    return backgroundVisualization?.classification;
  });
  const activeDiscretizationValueColumn = $derived.by(() => {
    if (discretizationTarget === 'background-stroke') {
      return backgroundVisualization?.text?.background?.strokeValueColumn;
    }
    return backgroundVisualization?.text?.background?.valueColumn;
  });

  const backgroundDiscretizationLabel = $derived.by(() =>
    resolveDiscretizationLabel(
      backgroundVisualization?.classification
        ? { ...backgroundVisualization.classification }
        : undefined
    )
  );
  const backgroundStrokeDiscretizationLabel = $derived.by(() =>
    resolveDiscretizationLabel(
      backgroundVisualization?.text?.background?.strokeClassification
        ? { ...backgroundVisualization.text.background.strokeClassification }
        : undefined
    )
  );

  function parseOpacityToSlider(
    value: number | undefined,
    fallback: number
  ): number {
    if (value === undefined) {
      return fallback;
    }

    return value <= 1 ? Math.round(value * 100) : value;
  }

  $effect(() => {
    labelFieldSelection.sync(visualization?.mapping.labelColumn);
    sizeFieldSelection.sync(visualization?.mapping.valueColumn);
    secondaryLabelFieldSelection.sync(
      visualization?.mapping.secondaryLabelColumn
    );
    backgroundValueFieldSelection.sync(
      backgroundVisualization?.mapping.valueColumn
    );
    backgroundCategoryFieldSelection.sync(
      backgroundVisualization?.mapping.categoryColumn
    );
  });

  $effect(() => {
    if (visualization?.style) {
      textOpacity = parseOpacityToSlider(
        visualization.style.textOpacity,
        VISUALIZATION_DEFAULTS.textOpacity
      );
      textColor =
        (visualization.style.textColor as string) ?? DEFAULT_COLORS.text;
      fontFamily =
        normalizeFontFamily(visualization.style.textFontFamily) ??
        DEFAULT_FONT_FAMILY;
      bold = visualization.style.textBold ?? false;
      italic = visualization.style.textItalic ?? false;
      size = clampFontSize(
        visualization.style.textSize,
        VISUALIZATION_DEFAULTS.textSize
      );
      sizeMode = visualization.modes?.size ?? SizeMode.FIXED;
      alignment = visualization.style.textAlign ?? 'left';
      halo = visualization.style.textHalo ?? false;
      haloColor = visualization.style.textHaloColor ?? DEFAULT_COLORS.halo;
      haloWidth =
        visualization.style.textHaloWidth ?? VISUALIZATION_DEFAULTS.haloWidth;
      collisionDetection = visualization.style.textCollisionDetection ?? false;
      dxpMasking = visualization.style.textDxpMasking ?? false;

      secondaryColor =
        (visualization.style.labelColor as string) ?? DEFAULT_COLORS.text;
      secondaryFontFamily =
        normalizeFontFamily(visualization.style.labelFontFamily) ??
        DEFAULT_FONT_FAMILY;
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
      secondaryAlignment = visualization.style.labelAlign ?? 'left';
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

  $effect(() => {
    if (!backgroundVisualization?.style) {
      fillMode = FillMode.NONE;
      fillColor = DEFAULT_COLORS.fill;
      fillOpacity = VISUALIZATION_DEFAULTS.fillOpacity;
      return;
    }

    fillOpacity = parseOpacityToSlider(
      backgroundVisualization.style.fillOpacity,
      VISUALIZATION_DEFAULTS.fillOpacity
    );
    fillColor =
      (backgroundVisualization.style.fillColor as string) ??
      DEFAULT_COLORS.fill;
    fillMode =
      (backgroundVisualization.style.fillOpacity ?? 1) <= 0
        ? FillMode.NONE
        : (backgroundVisualization.modes?.fill ?? FillMode.UNIQUE);
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

  function handleBackgroundValueFieldSelect(fieldId: number) {
    backgroundValueFieldSelection.set(fieldId);

    if (fieldId === NONE_FIELD_ID) {
      onBackgroundMappingChange?.({ valueColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onBackgroundMappingChange?.({ valueColumn: field.text });
    }
  }

  function handleBackgroundCategoryFieldSelect(fieldId: number) {
    backgroundCategoryFieldSelection.set(fieldId);

    if (fieldId === NONE_FIELD_ID) {
      onBackgroundMappingChange?.({ categoryColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onBackgroundMappingChange?.({ categoryColumn: field.text });
    }
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

  function handleBackgroundFillModeChange(index: number) {
    const nextModes = [
      FillMode.NONE,
      FillMode.UNIQUE,
      FillMode.CLASSES,
      FillMode.CATEGORIES
    ];
    const next = nextModes[index] || FillMode.NONE;
    if (next === fillMode) return;
    fillMode = next;
    onBackgroundModesChange?.({ fill: fillMode });

    if (fillMode === FillMode.NONE) {
      fillColor = DEFAULT_COLORS.fill;
      onBackgroundStyleChange?.({
        fillOpacity: 0,
        fillColor: DEFAULT_COLORS.fill
      });
      onBackgroundClassificationChange?.(resetVisualClassification());
      return;
    }

    if ((backgroundVisualization?.style.fillOpacity ?? 1) <= 0) {
      onBackgroundStyleChange?.({
        fillOpacity: VISUALIZATION_DEFAULTS.fillOpacity / 100
      });
    }
  }

  function handleBackgroundFillColorChange(value: string) {
    fillColor = value;
    onBackgroundStyleChange?.({ fillColor: value });
  }

  function handleBackgroundFillOpacityChange(value: number) {
    fillOpacity = value;
    onBackgroundStyleChange?.({ fillOpacity: value / 100 });
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

  function openBackgroundDiscretization() {
    discretizationTarget = 'background-fill';
    discretizationModalOpen = true;
  }

  function openBackgroundStrokeDiscretization() {
    discretizationTarget = 'background-stroke';
    discretizationModalOpen = true;
  }

  function handleDiscretizationChange(
    classification: Partial<ClassificationConfig>
  ) {
    if (discretizationTarget === 'background-fill') {
      onBackgroundClassificationChange?.(classification);
      return;
    }

    onBackgroundStrokeClassificationChange?.(classification);
  }

  function handleBackgroundStrokeClassificationChange(
    classification: Partial<ClassificationConfig>
  ) {
    onBackgroundStrokeClassificationChange?.(classification);
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

  const sizeModeItems = $derived([
    { icon: TextAllCaps, label: m.unique(), iconSize: 16 },
    { icon: TextScale, label: m.proportional(), iconSize: 16 }
  ]);
  const sizeModeIndex = $derived(TEXT_SIZE_MODES.indexOf(sizeMode));
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
      <SectionHeading title={m.text_label()} />

      <div class="field-stack">
        <div class="field-row">
          <div class="field-row-dropdown field-picker">
            <Dropdown
              labelText={m.text_according()}
              items={selectableDataFields}
              selectedId={labelFieldSelection.selectedFieldId}
              on:select={(event) =>
                handleLabelFieldSelect(event.detail.selectedId)}
              type="default"
            />
          </div>

          <Button
            bind:ref={primaryTriggerRef}
            class={`format-trigger ${showStylePopover && activeStyleSection === 'primary' ? 'format-trigger--active' : ''}`}
            kind="ghost"
            aria-pressed={showStylePopover && activeStyleSection === 'primary'}
            iconDescription={m.text_format_button()}
            on:click={togglePrimaryFormat}
          >
            Aa
          </Button>
        </div>

        <div class="field-row">
          <div class="field-row-dropdown field-picker">
            <Dropdown
              labelText={m.secondary_text()}
              items={secondaryFieldItems}
              selectedId={secondaryLabelFieldSelection.selectedFieldId}
              disabled={!hasPrimaryField}
              on:select={(event) =>
                handleSecondaryFieldSelect(event.detail.selectedId)}
              type="default"
            />
          </div>

          <Button
            bind:ref={secondaryTriggerRef}
            class={`format-trigger ${showStylePopover && activeStyleSection === 'secondary' ? 'format-trigger--active' : ''}`}
            kind="ghost"
            aria-pressed={showStylePopover &&
              activeStyleSection === 'secondary'}
            iconDescription={m.text_format_button()}
            disabled={!hasPrimaryField || !hasSecondaryField}
            on:click={toggleSecondaryFormat}
          >
            Aa
          </Button>
        </div>
      </div>

      <div class="missing-data-block">
        <div class="missing-data-heading">
          <span class="missing-data-title">{m.show_missing_data()}</span>
          <InfoPopover text={m.show_missing_data_info()} />
        </div>

        <div class="missing-data-toggle">
          <Switch
            toggled={showMissingData}
            hideLabel
            labelText={m.show_missing_data()}
            onchange={handleMissingDataShowChange}
          />
          <span class="missing-data-toggle-state">
            {showMissingData ? m.yes() : m.no()}
          </span>
        </div>

        {#if showMissingData}
          <div class="missing-data-fields">
            <label class="field-group" for="texts-missing-data-label">
              <span class="field-label">{m.text_label()}</span>
              <div class="text-input-field">
                <TextInput
                  id="texts-missing-data-label"
                  bind:value={missingDataLabel}
                  placeholder={m.missing_data_text()}
                  on:input={() =>
                    handleMissingDataLabelChange(missingDataLabel)}
                />
              </div>
            </label>

            <div class="field-group">
              <SingleColorPreview
                exclusive
                label={m.color()}
                color={missingDataColor}
                onchange={handleMissingDataColorChange}
              />
            </div>
          </div>
        {/if}
      </div>

      <SectionHeading title={m.size_label()} />

      <div class="field-group">
        <ToggleTabs
          items={sizeModeItems}
          activeIndex={sizeModeIndex}
          onChange={handleSizeModeChange}
          hideInactiveLabel={true}
        />
      </div>

      {#if sizeMode === SizeMode.PROPORTIONAL}
        <div class="field-group">
          <FacetsVariablePicker
            bind:open={sizePickerOpen}
            titleText={m.size_according()}
            dataFields={dataFields}
            singleSelectItems={selectableDataFields}
            selectedFieldId={sizeFieldSelection.selectedFieldId}
            selectedFieldIds={textFacetsSelection.getSelectedFieldIds(
              FACET_SLOT.TEXT_VALUE
            )}
            isCollectionEnabled={textFacetsSelection.isActiveForSlot(
              FACET_SLOT.TEXT_VALUE
            )}
            onSelect={handleSizeFieldSelect}
            onCollectionChange={(ids) =>
              textFacetsSelection.updateVariables(
                sizeColumnName,
                FACET_SLOT.TEXT_VALUE,
                ids
              )}
            onToggleCollection={(enabled) =>
              textFacetsSelection.toggle(
                sizeColumnName,
                FACET_SLOT.TEXT_VALUE,
                enabled
              )}
          />
        </div>
      {/if}

      <SliderWithInput
        label={m.size_label()}
        min={TEXT_SIZE_SLIDER_MIN}
        max={TEXT_SIZE_SLIDER_MAX}
        value={size}
        showMinMax
        inputWidth="64px"
        onchange={handleSizeChange}
      />

      {#if backgroundAvailable}
        <FillSection
          visualization={backgroundVisualization}
          dataFields={dataFields}
          availableModes={FILL_MODES_STANDARD}
          fillMode={fillMode}
          fillColor={fillColor}
          fillOpacity={fillOpacity}
          selectedValueFieldId={backgroundValueFieldSelection.selectedFieldId}
          selectedCategoryFieldId={backgroundCategoryFieldSelection.selectedFieldId}
          discretizationLabel={backgroundDiscretizationLabel}
          categoryCount={backgroundVisualization?.classification?.labels
            ?.length ?? 0}
          facetsValueSlotPath={FACET_SLOT.TEXT_BACKGROUND_VALUE}
          facetsCategorySlotPath={FACET_SLOT.TEXT_BACKGROUND_CATEGORY}
          categoriesVariant="texts"
          showMissingDataSection={false}
          showOpacityBounds={true}
          opacityInputWidth="64px"
          sectionTitle={m.background()}
          selectableDataFields={selectableDataFields}
          getFacetsSelectedFieldIds={backgroundFacetsSelection.getSelectedFieldIds}
          isFacetsActiveForSlot={backgroundFacetsSelection.isActiveForSlot}
          onFillModeChange={(mode: FillMode) =>
            handleBackgroundFillModeChange(FILL_MODES_STANDARD.indexOf(mode))}
          onFillColorChange={handleBackgroundFillColorChange}
          onFillOpacityChange={handleBackgroundFillOpacityChange}
          onValueFieldSelect={handleBackgroundValueFieldSelect}
          onCategoryFieldSelect={handleBackgroundCategoryFieldSelect}
          onFacetsVariablesChange={backgroundFacetsSelection.updateVariables}
          onFacetsToggle={backgroundFacetsSelection.toggle}
          onOpenDiscretization={openBackgroundDiscretization}
          onClassificationChange={onBackgroundClassificationChange ??
            (() => {})}
          onInvertPalette={onBackgroundInvertPalette}
        />

        <StrokeSection
          visualization={backgroundVisualization}
          dataFields={dataFields}
          discretizationLabel={backgroundStrokeDiscretizationLabel}
          showDashed={false}
          sliderInputWidth="64px"
          onStyleChange={onBackgroundStyleChange}
          onModesChange={onBackgroundModesChange}
          onMappingChange={onBackgroundMappingChange}
          onStrokeMappingChange={onBackgroundStrokeMappingChange}
          onInvertPalette={onBackgroundStrokeInvertPalette}
          onOpenDiscretization={openBackgroundStrokeDiscretization}
          onStrokeClassificationChange={handleBackgroundStrokeClassificationChange}
          strokeClassification={backgroundVisualization?.text?.background
            ?.strokeClassification}
          strokeValueColumn={backgroundVisualization?.text?.background
            ?.strokeValueColumn}
          strokeCategoryColumn={backgroundVisualization?.text?.background
            ?.strokeCategoryColumn}
          facetsValueSlotPath={FACET_SLOT.TEXT_BACKGROUND_STROKE_VALUE}
          facetsCategorySlotPath={FACET_SLOT.TEXT_BACKGROUND_STROKE_CATEGORY}
        />
      {/if}
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
    role={discretizationTarget === 'background-stroke' ? 'stroke' : 'fill'}
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

  .field-stack {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .field-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--cds-spacing-04);
    align-items: end;
  }

  .field-row-dropdown {
    min-width: 0;
  }

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
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary);
    font-weight: 400;
  }

  :global(.format-trigger.bx--btn) {
    width: 40px !important;
    height: 40px !important;
    min-height: 40px !important;
    max-height: 40px !important;
    padding: 0 !important;
    border: 1px solid var(--cds-border-subtle-01, #c6c6c6) !important;
    background: var(--cds-layer-01, #ffffff) !important;
    color: var(--cds-text-secondary, #6f6f6f) !important;
    font-size: 0.875rem !important;
    font-weight: 600 !important;
    line-height: 1 !important;
    cursor: pointer;
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    transition:
      border-color 0.15s ease,
      color 0.15s ease,
      background-color 0.15s ease;
  }

  :global(.format-trigger.bx--btn:hover:not(:disabled)),
  :global(.format-trigger.format-trigger--active.bx--btn) {
    border-color: var(--cds-text-primary, #161616) !important;
    color: var(--cds-text-primary, #161616) !important;
    background: var(--cds-layer-hover-01, #e8e8e8) !important;
  }

  :global(.format-trigger:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .missing-data-block {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    padding-top: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle-01, #c6c6c6);
  }

  .missing-data-heading {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .missing-data-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--cds-text-primary, #161616);
  }

  .missing-data-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .missing-data-toggle-state {
    font-size: 0.875rem;
    color: var(--cds-text-primary, #161616);
    font-weight: 500;
  }

  .missing-data-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--cds-spacing-04);
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

  @media (max-width: 560px) {
    .field-row {
      grid-template-columns: 1fr;
    }

    :global(.format-trigger) {
      width: 100%;
      height: 48px;
    }

    .missing-data-fields {
      grid-template-columns: 1fr;
    }
  }
</style>
