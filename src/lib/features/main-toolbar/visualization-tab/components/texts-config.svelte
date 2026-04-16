<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    ColorSelector,
    DiscretizationRow,
    InfoPopover,
    PalettePreview,
    SectionHeading,
    SliderWithInput,
    StrokeSection,
    ToggleWithLabel,
    VizFilterButton,
    VizFilterSection
  } from './shared';
  import type {
    MissingDataConfig,
    VisualizationConfig,
    VisualizationModes,
    VizDataFilter
  } from '$lib/features/commons/store/visualization.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    DEFAULT_SEQUENTIAL_PREVIEW,
    DEFAULT_QUALITATIVE_PREVIEW
  } from './palette-popover/palette.constants';
  import {
    Category,
    MisuseOutline,
    SquareFill,
    Tag,
    TextBold,
    TextItalic,
    TextAlignLeft,
    TextAlignCenter,
    TextAlignRight
  } from 'carbon-icons-svelte';
  import {
    ColorMode,
    DEFAULT_COLORS,
    FillMode,
    SLIDER_LIMITS,
    VISUALIZATION_DEFAULTS
  } from '../../constants';
  import {
    Button,
    Dropdown,
    Select,
    SelectItem,
    TextInput
  } from 'carbon-components-svelte';
  import DiscretizationModal from './discretization-modal.svelte';
  import type { ClassificationConfig } from '$lib/features/commons/store/visualization.store.svelte';
  import { resolveDiscretizationLabel } from './discretization.utils';

  interface Props {
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
    filters?: VizDataFilter[];
    onAddFilter?: (filter: Omit<VizDataFilter, 'id'>) => void;
    onRemoveFilter?: (filterId: string) => void;
    onClearFilters?: () => void;
  }

  let {
    dataFields = [],
    visualization,
    disabled = false,
    onStyleChange,
    onModesChange,
    onMissingDataChange,
    onClassificationChange,
    onMappingChange,
    onInvertPalette,
    onToggleVisibility,
    filters = [],
    onAddFilter,
    onRemoveFilter,
    onClearFilters
  }: Props = $props();

  const NONE_FIELD_ID = -1;
  let discretizationModalOpen = $state(false);
  let filterSectionVisible = $state(false);

  let selectedLabelFieldId = $state<number>(NONE_FIELD_ID);
  let selectedValueFieldId = $state<number>(NONE_FIELD_ID);
  let selectedCategoryFieldId = $state<number>(NONE_FIELD_ID);
  let secondaryFieldId = $state<number>(NONE_FIELD_ID);

  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);
  const secondaryFieldItems = $derived([noneOption, ...dataFields]);
  const hasSecondaryField = $derived(secondaryFieldId !== NONE_FIELD_ID);

  let colorMode = $state<ColorMode>(ColorMode.UNIQUE);
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

  let fillMode = $state<FillMode>(FillMode.NONE);
  let fillColor = $state<string>(DEFAULT_COLORS.fill);
  let fillOpacity = $state<number>(VISUALIZATION_DEFAULTS.fillOpacity);

  let showMissingData = $state<boolean>(true);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);
  let missingDataLabel = $state<string>(m.missing_data_text());

  let showPrimaryFormat = $state(false);
  let showSecondaryFormat = $state(false);

  const enabled = $derived((visualization?.style.textOpacity ?? 1) > 0);
  const currentPalette = $derived(
    visualization?.classification?.colors ?? DEFAULT_SEQUENTIAL_PREVIEW
  );
  const qualitativePalette = DEFAULT_QUALITATIVE_PREVIEW;

  $effect(() => {
    if (visualization?.mapping.labelColumn && dataFields.length > 0) {
      const fieldIndex = dataFields.findIndex(
        (field) => field.text === visualization.mapping.labelColumn
      );
      selectedLabelFieldId =
        fieldIndex >= 0 ? dataFields[fieldIndex].id : NONE_FIELD_ID;
    } else {
      selectedLabelFieldId = NONE_FIELD_ID;
    }

    if (visualization?.mapping.valueColumn && dataFields.length > 0) {
      const fieldIndex = dataFields.findIndex(
        (field) => field.text === visualization.mapping.valueColumn
      );
      selectedValueFieldId =
        fieldIndex >= 0 ? dataFields[fieldIndex].id : NONE_FIELD_ID;
    } else {
      selectedValueFieldId = NONE_FIELD_ID;
    }

    if (visualization?.mapping.categoryColumn && dataFields.length > 0) {
      const fieldIndex = dataFields.findIndex(
        (field) => field.text === visualization.mapping.categoryColumn
      );
      selectedCategoryFieldId =
        fieldIndex >= 0 ? dataFields[fieldIndex].id : NONE_FIELD_ID;
    } else {
      selectedCategoryFieldId = NONE_FIELD_ID;
    }

    if (visualization?.mapping.secondaryLabelColumn && dataFields.length > 0) {
      const fieldIndex = secondaryFieldItems.findIndex(
        (field) => field.text === visualization.mapping.secondaryLabelColumn
      );
      secondaryFieldId =
        fieldIndex >= 0 ? secondaryFieldItems[fieldIndex].id : NONE_FIELD_ID;
    } else {
      secondaryFieldId = NONE_FIELD_ID;
    }
  });

  $effect(() => {
    if (visualization?.style) {
      const nextTextOpacity = visualization.style.textOpacity;
      textOpacity =
        nextTextOpacity !== undefined
          ? nextTextOpacity <= 1
            ? Math.round(nextTextOpacity * 100)
            : nextTextOpacity
          : VISUALIZATION_DEFAULTS.textOpacity;
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

      const nextFillOpacity = visualization.style.fillOpacity;
      fillOpacity =
        nextFillOpacity !== undefined
          ? Math.round(nextFillOpacity * 100)
          : VISUALIZATION_DEFAULTS.fillOpacity;
      fillColor =
        (visualization.style.fillColor as string) ?? DEFAULT_COLORS.fill;
    }

    if (visualization?.modes) {
      colorMode =
        visualization.modes.color ??
        (selectedLabelFieldId === NONE_FIELD_ID
          ? ColorMode.NONE
          : ColorMode.UNIQUE);
      fillMode =
        (visualization?.style.fillOpacity ?? 1) <= 0
          ? FillMode.NONE
          : (visualization.modes.fill ?? FillMode.UNIQUE);
    }

    if (visualization?.missingData) {
      showMissingData = visualization.missingData.show ?? true;
      missingDataColor =
        visualization.missingData.color ?? DEFAULT_COLORS.missingData;
      missingDataLabel =
        visualization.missingData.label ?? m.missing_data_text();
    }
  });

  const colorModeItems = [
    { icon: MisuseOutline, label: m.color_mode_none(), iconSize: 16 },
    { icon: SquareFill, label: m.color_mode_unique(), iconSize: 16 },
    { icon: Category, label: m.color_mode_classes(), iconSize: 16 },
    { icon: Tag, label: m.color_mode_categories(), iconSize: 16 }
  ];

  const fillModeItems = [
    { icon: MisuseOutline, label: m.fill_mode_none(), iconSize: 16 },
    { icon: SquareFill, label: m.fill_mode_unique(), iconSize: 16 },
    { icon: Category, label: m.fill_mode_classes(), iconSize: 16 },
    { icon: Tag, label: m.fill_mode_categories(), iconSize: 16 }
  ];

  const alignmentItems = [
    { icon: TextAlignLeft, label: m.alignment_left(), iconSize: 16 },
    { icon: TextAlignCenter, label: m.alignment_center(), iconSize: 16 },
    { icon: TextAlignRight, label: m.alignment_right(), iconSize: 16 }
  ];

  const colorModeIndex = $derived(
    [
      ColorMode.NONE,
      ColorMode.UNIQUE,
      ColorMode.CLASSES,
      ColorMode.CATEGORIES
    ].indexOf(colorMode)
  );

  const fillModeIndex = $derived(
    [
      FillMode.NONE,
      FillMode.UNIQUE,
      FillMode.CLASSES,
      FillMode.CATEGORIES
    ].indexOf(fillMode)
  );

  const alignmentIndex = $derived(
    ['left', 'center', 'right'].indexOf(alignment)
  );

  function handleLabelFieldSelect(fieldId: number) {
    selectedLabelFieldId = fieldId;

    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({
        labelColumn: undefined,
        secondaryLabelColumn: undefined
      });
      secondaryFieldId = NONE_FIELD_ID;
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onMappingChange?.({ labelColumn: field.text });
    }
  }

  function handleValueFieldSelect(fieldId: number) {
    selectedValueFieldId = fieldId;

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
    selectedCategoryFieldId = fieldId;

    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ categoryColumn: undefined });
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (field) {
      onMappingChange?.({ categoryColumn: field.text });
    }
  }

  function handleSecondaryFieldSelect(fieldId: number) {
    secondaryFieldId = fieldId;

    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ secondaryLabelColumn: undefined });
      return;
    }

    const field = secondaryFieldItems.find((item) => item.id === fieldId);
    if (field) {
      onMappingChange?.({ secondaryLabelColumn: field.text });
    }
  }

  function handleColorModeChange(index: number) {
    const nextModes = [
      ColorMode.NONE,
      ColorMode.UNIQUE,
      ColorMode.CLASSES,
      ColorMode.CATEGORIES
    ];
    colorMode = nextModes[index] || ColorMode.UNIQUE;
    onModesChange?.({ color: colorMode });
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

  function handleAlignmentChange(index: number) {
    const alignments: Array<'left' | 'center' | 'right'> = [
      'left',
      'center',
      'right'
    ];
    alignment = alignments[index] || 'left';
    onStyleChange?.({ textAlign: alignment });
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

  function handleFillModeChange(index: number) {
    const nextModes = [
      FillMode.NONE,
      FillMode.UNIQUE,
      FillMode.CLASSES,
      FillMode.CATEGORIES
    ];
    fillMode = nextModes[index] || FillMode.NONE;
    onModesChange?.({ fill: fillMode });

    if (fillMode === FillMode.NONE) {
      onStyleChange?.({ fillOpacity: 0 });
      return;
    }

    if ((visualization?.style.fillOpacity ?? 1) <= 0) {
      onStyleChange?.({
        fillOpacity: VISUALIZATION_DEFAULTS.fillOpacity / 100
      });
    }
  }

  function handleFillColorChange(value: string) {
    fillColor = value;
    onStyleChange?.({ fillColor: value });
  }

  function handleFillOpacityChange(value: number) {
    fillOpacity = value;
    onStyleChange?.({ fillOpacity: value / 100 });
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

  function handleOpenDiscretization() {
    discretizationModalOpen = true;
  }

  function handleClassificationChange(
    classification: Partial<ClassificationConfig>
  ) {
    onClassificationChange?.(classification);
  }

  const discretizationLabel = $derived(
    resolveDiscretizationLabel(visualization?.classification)
  );

  function togglePrimaryFormat() {
    showPrimaryFormat = !showPrimaryFormat;
    showSecondaryFormat = false;
  }

  function toggleSecondaryFormat() {
    if (!hasSecondaryField) {
      return;
    }
    showSecondaryFormat = !showSecondaryFormat;
    showPrimaryFormat = false;
  }
</script>

<div class="viz-panel-shell texts-panel-shell">
  <ExpandableSection
    title={m.texts_title()}
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
              titleText={m.text_according()}
              items={selectableDataFields}
              selectedId={selectedLabelFieldId}
              on:select={(event) =>
                handleLabelFieldSelect(event.detail.selectedId)}
              type="default"
            />
          </div>

          <Button
            class={`format-trigger ${showPrimaryFormat ? 'format-trigger--active' : ''}`}
            kind="ghost"
            aria-pressed={showPrimaryFormat}
            iconDescription={m.text_format_button()}
            onclick={togglePrimaryFormat}
          >
            Aa
          </Button>
        </div>

        {#if showPrimaryFormat}
          <div class="format-panel">
            <SectionHeading title={m.appearance()} />

            <div class="field-group">
              <ToggleTabs
                items={colorModeItems}
                activeIndex={colorModeIndex}
                onChange={handleColorModeChange}
                hideInactiveLabel={true}
              />
            </div>

            {#if colorMode === ColorMode.UNIQUE}
              <ColorSelector
                label={m.color()}
                value={textColor}
                onchange={handleTextColorChange}
              />
            {:else if colorMode === ColorMode.CLASSES}
              <div class="field-group">
                <Dropdown
                  titleText={m.color_according()}
                  items={selectableDataFields}
                  selectedId={selectedValueFieldId}
                  on:select={(event) =>
                    handleValueFieldSelect(event.detail.selectedId)}
                  type="default"
                />
              </div>
              <DiscretizationRow
                label={m.discretization()}
                value={discretizationLabel}
                onsettings={handleOpenDiscretization}
              />
              <PalettePreview
                label={m.color_palette()}
                colors={currentPalette}
                selectedPaletteId={visualization?.classification?.paletteId}
                inverted={visualization?.classification?.inverted ?? false}
                oninvert={onInvertPalette}
                onClassificationChange={handleClassificationChange}
              />
            {:else if colorMode === ColorMode.CATEGORIES}
              <div class="field-group">
                <Dropdown
                  titleText={m.color_according()}
                  items={selectableDataFields}
                  selectedId={selectedCategoryFieldId}
                  on:select={(event) =>
                    handleCategoryFieldSelect(event.detail.selectedId)}
                  type="default"
                />
              </div>
              <DiscretizationRow
                label={m.category_aspect()}
                value={m.categories_count({ count: 4 })}
                onsettings={handleOpenDiscretization}
              />
              <PalettePreview
                label={m.color_palette()}
                colors={qualitativePalette}
                inverted={visualization?.classification?.inverted ?? false}
                oninvert={onInvertPalette}
                onClassificationChange={handleClassificationChange}
              />
            {/if}

            <SliderWithInput
              label={m.opacity()}
              min={SLIDER_LIMITS.textOpacity.min}
              max={SLIDER_LIMITS.textOpacity.max}
              value={textOpacity}
              showMinMax
              inputWidth="96px"
              onchange={handleTextOpacityChange}
            />

            <SectionHeading title={m.text_style()} />

            <div class="text-style-row">
              <ToggleTabs
                items={[{ icon: TextBold, label: '', iconSize: 16 }]}
                activeIndex={bold ? 0 : -1}
                onChange={() => handleBoldChange(!bold)}
                hideInactiveLabel={true}
              />
              <ToggleTabs
                items={[{ icon: TextItalic, label: '', iconSize: 16 }]}
                activeIndex={italic ? 0 : -1}
                onChange={() => handleItalicChange(!italic)}
                hideInactiveLabel={true}
              />
            </div>

            <div class="field-group">
              <Select
                labelText={m.font_size()}
                selected={String(size)}
                on:change={(event) =>
                  handleSizeChange(
                    Number((event.target as HTMLSelectElement).value)
                  )}
              >
                <SelectItem value="8" text="8 px" />
                <SelectItem value="10" text="10 px" />
                <SelectItem value="12" text="12 px" />
                <SelectItem value="14" text="14 px" />
                <SelectItem value="16" text="16 px" />
                <SelectItem value="18" text="18 px" />
                <SelectItem value="20" text="20 px" />
                <SelectItem value="24" text="24 px" />
              </Select>
            </div>

            <div class="field-group">
              <span class="field-label">{m.alignment()}</span>
              <ToggleTabs
                items={alignmentItems}
                activeIndex={alignmentIndex}
                onChange={handleAlignmentChange}
                hideInactiveLabel={true}
              />
            </div>

            <ToggleWithLabel
              label={m.halo()}
              toggled={halo}
              ontoggle={handleHaloToggle}
            />

            {#if halo}
              <ColorSelector
                label={m.halo_color()}
                value={haloColor}
                onchange={handleHaloColorChange}
              />
              <SliderWithInput
                label={m.halo_width()}
                min={SLIDER_LIMITS.haloWidth.min}
                max={SLIDER_LIMITS.haloWidth.max}
                value={haloWidth}
                onchange={handleHaloWidthChange}
              />
            {/if}

            <ToggleWithLabel
              label={m.collision_detection()}
              infoText={m.collision_detection_info()}
              toggled={collisionDetection}
              ontoggle={handleCollisionDetectionChange}
            />

            <ToggleWithLabel
              label={m.dxp_masking()}
              infoText={m.dxp_masking_info()}
              toggled={dxpMasking}
              ontoggle={handleDxpMaskingChange}
            />
          </div>
        {/if}

        <div class="field-row">
          <div class="field-row-dropdown field-picker">
            <Dropdown
              titleText={m.secondary_text()}
              items={secondaryFieldItems}
              selectedId={secondaryFieldId}
              on:select={(event) =>
                handleSecondaryFieldSelect(event.detail.selectedId)}
              type="default"
            />
          </div>

          <Button
            class={`format-trigger ${showSecondaryFormat ? 'format-trigger--active' : ''}`}
            kind="ghost"
            aria-pressed={showSecondaryFormat}
            iconDescription={m.text_format_button()}
            disabled={!hasSecondaryField}
            onclick={toggleSecondaryFormat}
          >
            Aa
          </Button>
        </div>

        {#if showSecondaryFormat && hasSecondaryField}
          <div class="format-panel">
            <SectionHeading title={m.text_style()} />

            <div class="text-style-row">
              <ToggleTabs
                items={[{ icon: TextBold, label: '', iconSize: 16 }]}
                activeIndex={bold ? 0 : -1}
                onChange={() => handleBoldChange(!bold)}
                hideInactiveLabel={true}
              />
              <ToggleTabs
                items={[{ icon: TextItalic, label: '', iconSize: 16 }]}
                activeIndex={italic ? 0 : -1}
                onChange={() => handleItalicChange(!italic)}
                hideInactiveLabel={true}
              />
            </div>

            <div class="field-group">
              <Select
                labelText={m.font_size()}
                selected={String(size)}
                on:change={(event) =>
                  handleSizeChange(
                    Number((event.target as HTMLSelectElement).value)
                  )}
              >
                <SelectItem value="8" text="8 px" />
                <SelectItem value="10" text="10 px" />
                <SelectItem value="12" text="12 px" />
                <SelectItem value="14" text="14 px" />
                <SelectItem value="16" text="16 px" />
                <SelectItem value="18" text="18 px" />
                <SelectItem value="20" text="20 px" />
                <SelectItem value="24" text="24 px" />
              </Select>
            </div>
          </div>
        {/if}
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
                label={m.color()}
                value={missingDataColor}
                onchange={handleMissingDataColorChange}
              />
            </div>
          </div>
        {/if}
      </div>

      <SectionHeading title={m.background()} />

      <div class="field-group">
        <ToggleTabs
          items={fillModeItems}
          activeIndex={fillModeIndex}
          onChange={handleFillModeChange}
          hideInactiveLabel={true}
        />
      </div>

      {#if fillMode === FillMode.UNIQUE}
        <ColorSelector
          label={m.color()}
          value={fillColor}
          onchange={handleFillColorChange}
        />
      {:else if fillMode === FillMode.CLASSES}
        <div class="field-group">
          <Dropdown
            titleText={m.color_according()}
            items={selectableDataFields}
            selectedId={selectedValueFieldId}
            on:select={(event) =>
              handleValueFieldSelect(event.detail.selectedId)}
            type="default"
          />
        </div>
        <DiscretizationRow
          label={m.discretization()}
          value={discretizationLabel}
          onsettings={handleOpenDiscretization}
        />
        <PalettePreview
          label={m.color_palette()}
          colors={currentPalette}
          selectedPaletteId={visualization?.classification?.paletteId}
          inverted={visualization?.classification?.inverted ?? false}
          oninvert={onInvertPalette}
          onClassificationChange={handleClassificationChange}
        />
      {:else if fillMode === FillMode.CATEGORIES}
        <div class="field-group">
          <Dropdown
            titleText={m.color_according()}
            items={selectableDataFields}
            selectedId={selectedCategoryFieldId}
            on:select={(event) =>
              handleCategoryFieldSelect(event.detail.selectedId)}
            type="default"
          />
        </div>
        <DiscretizationRow
          label={m.category_aspect()}
          value={m.categories_count({ count: 4 })}
          onsettings={handleOpenDiscretization}
        />
        <PalettePreview
          label={m.color_palette()}
          colors={qualitativePalette}
          inverted={visualization?.classification?.inverted ?? false}
          oninvert={onInvertPalette}
          onClassificationChange={handleClassificationChange}
        />
      {/if}

      {#if fillMode !== FillMode.NONE}
        <SliderWithInput
          label={m.opacity()}
          min={SLIDER_LIMITS.opacity.min}
          max={SLIDER_LIMITS.opacity.max}
          value={fillOpacity}
          showMinMax
          inputWidth="128px"
          onchange={handleFillOpacityChange}
        />
      {/if}

      <StrokeSection
        visualization={visualization}
        dataFields={dataFields}
        discretizationLabel={discretizationLabel}
        classesPalette={currentPalette}
        categoriesPalette={qualitativePalette}
        showDashed={false}
        onStyleChange={onStyleChange}
        onModesChange={onModesChange}
        onMappingChange={onMappingChange}
        onInvertPalette={onInvertPalette}
        onOpenDiscretization={handleOpenDiscretization}
        onClassificationChange={handleClassificationChange}
      />

      {#if filterSectionVisible || filters.length > 0}
        <VizFilterSection
          dataFields={dataFields}
          filters={filters}
          onAddFilter={onAddFilter ?? (() => {})}
          onRemoveFilter={onRemoveFilter ?? (() => {})}
          onClearFilters={onClearFilters ?? (() => {})}
        />
      {/if}
    </div>
  </ExpandableSection>

  <DiscretizationModal
    bind:open={discretizationModalOpen}
    visualization={visualization}
    onchange={handleClassificationChange}
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

  :global(.format-trigger) {
    width: 64px;
    height: 64px;
    border: 1px solid var(--cds-border-subtle-01, #c6c6c6);
    background: var(--cds-layer-01, #ffffff);
    color: var(--cds-text-secondary, #6f6f6f);
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      color 0.15s ease,
      background-color 0.15s ease;
  }

  :global(.format-trigger:hover:not(:disabled)),
  :global(.format-trigger.format-trigger--active) {
    border-color: var(--cds-border-interactive, #0f62fe);
    color: var(--cds-text-primary, #161616);
    background: var(--cds-layer-hover-01, #e8e8e8);
  }

  :global(.format-trigger:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .format-panel {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    padding: var(--cds-spacing-04);
    border: 1px solid var(--cds-border-subtle-01, #c6c6c6);
    background: var(--cds-layer-01, #ffffff);
  }

  .text-style-row {
    display: flex;
    gap: var(--cds-spacing-03);
    align-items: center;
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
