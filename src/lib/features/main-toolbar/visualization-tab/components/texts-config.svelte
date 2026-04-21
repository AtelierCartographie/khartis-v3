<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import {
    ColorSelector,
    InfoPopover,
    SectionHeading,
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
    VISUALIZATION_DEFAULTS
  } from '../../constants';
  import { FILL_MODES_STANDARD } from './shared/fill-mode-presets';
  import { Button, Dropdown, TextInput } from 'carbon-components-svelte';
  import DiscretizationModal from './discretization-modal.svelte';
  import TextStylePopover from './text-style-popover.svelte';
  import { resolveDiscretizationLabel } from './discretization.utils';
  import {
    FACET_SLOT,
    facetsStore,
    type FacetSlotPath
  } from '$lib/features/step-toolbar/tools/facets/facets.store.svelte';

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
    onRemoveFilter
  }: Props = $props();

  const NONE_FIELD_ID = -1;
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);
  const secondaryFieldItems = $derived([noneOption, ...dataFields]);

  let discretizationModalOpen = $state(false);
  let discretizationTarget = $state<'background-fill' | 'background-stroke'>(
    'background-fill'
  );
  let filterSectionVisible = $state(false);

  let selectedLabelFieldId = $state<number>(NONE_FIELD_ID);
  let selectedBackgroundValueFieldId = $state<number>(NONE_FIELD_ID);
  let selectedBackgroundCategoryFieldId = $state<number>(NONE_FIELD_ID);
  let secondaryFieldId = $state<number>(NONE_FIELD_ID);

  let textColor = $state<string>(DEFAULT_COLORS.text);
  let textOpacity = $state<number>(VISUALIZATION_DEFAULTS.textOpacity);
  let bold = $state<boolean>(false);
  let italic = $state<boolean>(false);
  let size = $state<number>(VISUALIZATION_DEFAULTS.textSize);
  let alignment = $state<'left' | 'center' | 'right'>('left');
  let halo = $state<boolean>(false);
  let haloColor = $state<string>(DEFAULT_COLORS.halo);
  let haloWidth = $state<number>(VISUALIZATION_DEFAULTS.haloWidth);
  let collisionDetection = $state<boolean>(true);
  let dxpMasking = $state<boolean>(false);

  let secondaryColor = $state<string>(DEFAULT_COLORS.text);
  let secondaryOpacity = $state<number>(VISUALIZATION_DEFAULTS.labelOpacity);
  let secondarySize = $state<number>(VISUALIZATION_DEFAULTS.labelSize);
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
  let showStylePopover = $state(false);
  let activeStyleSection = $state<StyleSection>('primary');
  let stylePopoverTrigger = $state<HTMLElement | undefined>();
  let primaryTriggerRef = $state<FormatTriggerRef>(null);
  let secondaryTriggerRef = $state<FormatTriggerRef>(null);

  const enabled = $derived((visualization?.style.textOpacity ?? 0) > 0);
  const hasPrimaryField = $derived(selectedLabelFieldId !== NONE_FIELD_ID);
  const hasSecondaryField = $derived(secondaryFieldId !== NONE_FIELD_ID);
  const backgroundAvailable = $derived(Boolean(backgroundVisualization));
  const selectedBackgroundVizId = $derived(backgroundVisualization?.id);
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

  const activeBackgroundFacetsSlotPath = $derived.by(() => {
    if (
      !facetsStore.enabled ||
      !selectedBackgroundVizId ||
      facetsStore.baseVisualizationId !== selectedBackgroundVizId
    ) {
      return null;
    }
    return facetsStore.primarySlotPath;
  });

  function isBackgroundFacetsActiveForSlot(slotPath: FacetSlotPath): boolean {
    return activeBackgroundFacetsSlotPath === slotPath;
  }

  function getBackgroundFacetsSelectedFieldIds(
    slotPath: FacetSlotPath
  ): number[] {
    if (!isBackgroundFacetsActiveForSlot(slotPath)) {
      return [];
    }
    return facetsStore.variables
      .map((name) => dataFields.find((field) => field.text === name)?.id)
      .filter((id): id is number => typeof id === 'number');
  }

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

  function resolveFieldId(columnName: string | undefined): number {
    if (!columnName) {
      return NONE_FIELD_ID;
    }

    const field = dataFields.find((item) => item.text === columnName);
    return field?.id ?? NONE_FIELD_ID;
  }

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
    selectedLabelFieldId = resolveFieldId(visualization?.mapping.labelColumn);
    secondaryFieldId = resolveFieldId(
      visualization?.mapping.secondaryLabelColumn
    );
    selectedBackgroundValueFieldId = resolveFieldId(
      backgroundVisualization?.mapping.valueColumn
    );
    selectedBackgroundCategoryFieldId = resolveFieldId(
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
      bold = visualization.style.textBold ?? false;
      italic = visualization.style.textItalic ?? false;
      size = visualization.style.textSize ?? VISUALIZATION_DEFAULTS.textSize;
      alignment = visualization.style.textAlign ?? 'left';
      halo = visualization.style.textHalo ?? false;
      haloColor = visualization.style.textHaloColor ?? DEFAULT_COLORS.halo;
      haloWidth =
        visualization.style.textHaloWidth ?? VISUALIZATION_DEFAULTS.haloWidth;
      collisionDetection = visualization.style.textCollisionDetection ?? false;
      dxpMasking = visualization.style.textDxpMasking ?? false;

      secondaryColor =
        (visualization.style.labelColor as string) ?? DEFAULT_COLORS.text;
      secondaryOpacity = parseOpacityToSlider(
        visualization.style.labelOpacity,
        VISUALIZATION_DEFAULTS.labelOpacity
      );
      secondarySize =
        visualization.style.labelSize ?? VISUALIZATION_DEFAULTS.labelSize;
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
    selectedLabelFieldId = fieldId;

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
    secondaryFieldId = fieldId;

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
    selectedBackgroundValueFieldId = fieldId;

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
    selectedBackgroundCategoryFieldId = fieldId;

    if (fieldId === NONE_FIELD_ID) {
      onBackgroundMappingChange?.({ categoryColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onBackgroundMappingChange?.({ categoryColumn: field.text });
    }
  }

  async function handleBackgroundFacetsVariablesChange(
    baseVariableName: string,
    slotPath: FacetSlotPath,
    fieldIds: number[]
  ) {
    if (!selectedBackgroundVizId) return;
    const variableNames = fieldIds
      .map((id) => dataFields.find((field) => field.id === id)?.text)
      .filter((name): name is string => Boolean(name));
    const merged =
      baseVariableName && !variableNames.includes(baseVariableName)
        ? [baseVariableName, ...variableNames]
        : variableNames;
    await facetsStore.updateVariables(
      selectedBackgroundVizId,
      merged,
      slotPath
    );
  }

  async function handleBackgroundFacetsToggle(
    baseVariableName: string,
    slotPath: FacetSlotPath,
    enabled: boolean
  ) {
    if (!selectedBackgroundVizId) return;
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
    await facetsStore.updateVariables(
      selectedBackgroundVizId,
      candidates,
      slotPath
    );
  }

  function handleTextColorChange(value: string) {
    textColor = value;
    onStyleChange?.({ textColor: value });
  }

  function handleTextOpacityChange(value: number) {
    textOpacity = value;
    onStyleChange?.({ textOpacity: value / 100 });
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
    size = value;
    onStyleChange?.({ textSize: value });
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

  function handleSecondarySizeChange(value: number) {
    secondarySize = value;
    onSecondaryLabelsChange?.({ size: value });
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
      onBackgroundClassificationChange?.({
        colors: undefined,
        paletteId: undefined,
        inverted: false,
        patternId: undefined,
        patternParams: undefined,
        labels: undefined
      });
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
</script>

<div class="viz-panel-shell texts-panel-shell">
  <ExpandableSection
    title={m.texts_title()}
    description={disabled ? m.primitive_unavailable() : undefined}
    defaultOpen={false}
    showToggle
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
              selectedId={selectedLabelFieldId}
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
            onclick={togglePrimaryFormat}
          >
            Aa
          </Button>
        </div>

        <div class="field-row">
          <div class="field-row-dropdown field-picker">
            <Dropdown
              labelText={m.secondary_text()}
              items={secondaryFieldItems}
              selectedId={secondaryFieldId}
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
            onclick={toggleSecondaryFormat}
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
              <ColorSelector
                exclusive
                label={m.color()}
                value={missingDataColor}
                onchange={handleMissingDataColorChange}
              />
            </div>
          </div>
        {/if}
      </div>

      {#if backgroundAvailable}
        <FillSection
          visualization={backgroundVisualization}
          primitive="text"
          dataFields={dataFields}
          availableModes={FILL_MODES_STANDARD}
          fillMode={fillMode}
          fillColor={fillColor}
          fillOpacity={fillOpacity}
          selectedValueFieldId={selectedBackgroundValueFieldId}
          selectedCategoryFieldId={selectedBackgroundCategoryFieldId}
          discretizationLabel={backgroundDiscretizationLabel}
          categoryCount={backgroundVisualization?.classification?.labels
            ?.length ?? 0}
          facetsValueSlotPath={FACET_SLOT.TEXT_BACKGROUND_VALUE}
          facetsCategorySlotPath={FACET_SLOT.TEXT_BACKGROUND_CATEGORY}
          categoriesVariant="texts"
          showMissingDataSection={false}
          sectionTitle={m.background()}
          selectableDataFields={selectableDataFields}
          getFacetsSelectedFieldIds={getBackgroundFacetsSelectedFieldIds}
          isFacetsActiveForSlot={isBackgroundFacetsActiveForSlot}
          onFillModeChange={(mode: FillMode) =>
            handleBackgroundFillModeChange(FILL_MODES_STANDARD.indexOf(mode))}
          onFillColorChange={handleBackgroundFillColorChange}
          onFillOpacityChange={handleBackgroundFillOpacityChange}
          onValueFieldSelect={handleBackgroundValueFieldSelect}
          onCategoryFieldSelect={handleBackgroundCategoryFieldSelect}
          onFacetsVariablesChange={handleBackgroundFacetsVariablesChange}
          onFacetsToggle={handleBackgroundFacetsToggle}
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
          facetsValueSlotPath={FACET_SLOT.TEXT_BACKGROUND_VALUE}
          facetsCategorySlotPath={FACET_SLOT.TEXT_BACKGROUND_CATEGORY}
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
    visibleSection={activeStyleSection}
    primary={{
      color: textColor,
      opacity: textOpacity,
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
          size: secondarySize,
          align: secondaryAlignment,
          halo: secondaryHalo,
          haloColor: secondaryHaloColor,
          haloWidth: secondaryHaloWidth,
          collisionDetection: secondaryCollisionDetection,
          dxpMasking: secondaryDxpMasking,
          onColorChange: handleSecondaryColorChange,
          onOpacityChange: handleSecondaryOpacityChange,
          onSizeChange: handleSecondarySizeChange,
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
    .missing-data-fields {
      grid-template-columns: 1fr;
    }
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
