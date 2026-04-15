<script lang="ts">
  import { untrack } from 'svelte';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    ColorSelector,
    DiscretizationRow,
    InfoPopover,
    MissingDataSection,
    PalettePreview,
    SectionHeading,
    SliderWithInput,
    ToggleWithLabel,
    VizFilterButton
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
    LetterAa,
    MisuseOutline,
    Subtract,
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
    SLIDER_LIMITS,
    VISUALIZATION_DEFAULTS
  } from '../../constants';
  import { Dropdown, Select, SelectItem } from 'carbon-components-svelte';
  import DiscretizationModal from './discretization-modal.svelte';
  import {
    ClassificationMethod,
    type ClassificationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';

  interface Props {
    dataFields?: Array<{ id: number; text: string }>;
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
    filterPanelOpen?: boolean;
    onToggleFilterPanel?: () => void;
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
    filterPanelOpen = false,
    onToggleFilterPanel = () => {}
  }: Props = $props();

  const NONE_FIELD_ID = -1;

  let discretizationModalOpen = $state(false);
  let selectedFieldId = $state<number>(0);
  let selectedCategoryFieldId = $state<number>(0);
  let secondaryFieldId = $state<number>(NONE_FIELD_ID);
  let defaultLabelApplied = false;

  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const secondaryFieldItems = $derived([noneOption, ...dataFields]);

  $effect(() => {
    if (visualization?.mapping.labelColumn && dataFields.length > 0) {
      const fieldIndex = dataFields.findIndex(
        (f) => f.text === visualization.mapping.labelColumn
      );
      if (fieldIndex >= 0) {
        selectedFieldId = fieldIndex;
      }
    } else if (dataFields.length > 0 && !defaultLabelApplied) {
      selectedFieldId = 0;
      defaultLabelApplied = true;
      untrack(() => onMappingChange?.({ labelColumn: dataFields[0].text }));
    }
    if (visualization?.mapping.categoryColumn && dataFields.length > 0) {
      const categoryIndex = dataFields.findIndex(
        (f) => f.text === visualization.mapping.categoryColumn
      );
      if (categoryIndex >= 0) {
        selectedCategoryFieldId = dataFields[categoryIndex].id;
      }
    }
    if (visualization?.mapping.secondaryLabelColumn && dataFields.length > 0) {
      const secondaryIndex = secondaryFieldItems.findIndex(
        (f) => f.text === visualization.mapping.secondaryLabelColumn
      );
      if (secondaryIndex >= 0) {
        secondaryFieldId = secondaryFieldItems[secondaryIndex].id;
      }
    } else {
      secondaryFieldId = NONE_FIELD_ID;
    }
  });

  function handleFieldSelect(fieldId: number) {
    selectedFieldId = fieldId;
    const field = dataFields[fieldId];
    if (field && onMappingChange) {
      onMappingChange({ labelColumn: field.text });
    }
  }

  function handleCategoryFieldSelect(fieldId: number) {
    selectedCategoryFieldId = fieldId;
    const field = dataFields.find((item) => item.id === fieldId);
    if (field && onMappingChange) {
      onMappingChange({ categoryColumn: field.text });
    }
  }

  function handleSecondaryFieldSelect(fieldId: number) {
    secondaryFieldId = fieldId;
    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ secondaryLabelColumn: undefined });
    } else {
      const field = secondaryFieldItems.find((f) => f.id === fieldId);
      if (field) {
        onMappingChange?.({ secondaryLabelColumn: field.text });
      }
    }
  }

  const hasSecondaryField = $derived(secondaryFieldId !== NONE_FIELD_ID);

  const currentPalette = $derived(
    visualization?.classification?.colors ?? DEFAULT_SEQUENTIAL_PREVIEW
  );
  const qualitativePalette = DEFAULT_QUALITATIVE_PREVIEW;

  let colorMode = $state<ColorMode>(ColorMode.UNIQUE);
  let color = $state<string>(DEFAULT_COLORS.text);
  let opacity = $state<number>(VISUALIZATION_DEFAULTS.textOpacity);
  const enabled = $derived((visualization?.style.textOpacity ?? 1) > 0);
  let bold = $state<boolean>(false);
  let italic = $state<boolean>(false);
  let size = $state<number>(VISUALIZATION_DEFAULTS.textSize);
  let alignment = $state<'left' | 'center' | 'right'>('left');
  let halo = $state<boolean>(false);
  let haloColor = $state<string>(DEFAULT_COLORS.halo);
  let haloWidth = $state<number>(VISUALIZATION_DEFAULTS.haloWidth);
  let collisionDetection = $state<boolean>(true);
  let dxpMasking = $state<boolean>(false);
  let showMissingData = $state<boolean>(true);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);

  $effect(() => {
    if (visualization?.style) {
      const textOpacity = visualization.style.textOpacity;
      opacity =
        textOpacity !== undefined
          ? textOpacity <= 1
            ? Math.round(textOpacity * 100)
            : textOpacity
          : VISUALIZATION_DEFAULTS.textOpacity;
      color = (visualization.style.textColor as string) ?? DEFAULT_COLORS.text;
      bold = visualization.style.textBold ?? false;
      italic = visualization.style.textItalic ?? false;
      size = visualization.style.textSize ?? VISUALIZATION_DEFAULTS.textSize;
      alignment = visualization.style.textAlign ?? 'left';
      halo = visualization.style.textHalo ?? false;
      haloColor = visualization.style.textHaloColor ?? DEFAULT_COLORS.halo;
      haloWidth =
        visualization.style.textHaloWidth ?? VISUALIZATION_DEFAULTS.haloWidth;
      collisionDetection = visualization.style.textCollisionDetection ?? true;
      dxpMasking = visualization.style.textDxpMasking ?? false;
    }
    if (visualization?.modes) {
      colorMode = visualization.modes.color ?? ColorMode.UNIQUE;
    }
    if (visualization?.missingData) {
      showMissingData = visualization.missingData.show ?? true;
      missingDataColor =
        visualization.missingData.color ?? DEFAULT_COLORS.missingData;
    }
  });

  const colorModeItems = [
    { icon: MisuseOutline, label: m.color_mode_none(), iconSize: 16 },
    { icon: Subtract, label: m.color_mode_unique(), iconSize: 16 },
    { icon: Category, label: m.color_mode_classes(), iconSize: 16 },
    { icon: Tag, label: m.color_mode_categories(), iconSize: 16 }
  ];

  const alignmentItems = [
    { icon: TextAlignLeft, label: m.alignment_left(), iconSize: 16 },
    { icon: TextAlignCenter, label: m.alignment_center(), iconSize: 16 },
    { icon: TextAlignRight, label: m.alignment_right(), iconSize: 16 }
  ];

  function handleColorModeChange(index: number) {
    const modes = [
      ColorMode.NONE,
      ColorMode.UNIQUE,
      ColorMode.CLASSES,
      ColorMode.CATEGORIES
    ];
    colorMode = modes[index] || ColorMode.UNIQUE;
    onModesChange?.({ color: colorMode });
  }

  function handleColorChange(value: string) {
    color = value;
    onStyleChange?.({ textColor: value });
  }

  function handleOpacityChange(value: number) {
    opacity = value;
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

  function handleToggleChange(checked: boolean) {
    if (checked && opacity <= 0) {
      opacity = VISUALIZATION_DEFAULTS.textOpacity;
      onStyleChange?.({ textOpacity: opacity / 100 });
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

  const colorModeIndex = $derived(
    [
      ColorMode.NONE,
      ColorMode.UNIQUE,
      ColorMode.CLASSES,
      ColorMode.CATEGORIES
    ].indexOf(colorMode)
  );

  const alignmentIndex = $derived(
    ['left', 'center', 'right'].indexOf(alignment)
  );

  function handleOpenDiscretization() {
    discretizationModalOpen = true;
  }

  function handleClassificationChange(
    classification: Partial<ClassificationConfig>
  ) {
    onClassificationChange?.(classification);
  }

  const discretizationLabel = $derived.by(() => {
    if (!visualization?.classification) return m.discretization_method_jenks();
    const methodLabels: Record<ClassificationMethod, () => string> = {
      [ClassificationMethod.JENKS]: m.discretization_method_jenks,
      [ClassificationMethod.QUANTILES]: m.discretization_method_quantile,
      [ClassificationMethod.EQUAL_INTERVAL]:
        m.discretization_method_equal_interval,
      [ClassificationMethod.STANDARD_DEVIATION]: m.discretization_method_stddev,
      [ClassificationMethod.MANUAL]: m.discretization_method_manual,
      [ClassificationMethod.Q6]: m.discretization_method_q6,
      [ClassificationMethod.NESTED_MEANS]: m.discretization_method_nested_means,
      [ClassificationMethod.HEAD_TAIL]: m.discretization_method_head_tail
    };
    const method =
      visualization.classification.method ?? ClassificationMethod.QUANTILES;
    const numClasses =
      visualization.classification.numClasses ??
      visualization.classification.classes ??
      5;
    const methodLabel = methodLabels[method]?.() ?? String(method);
    return `${methodLabel}, ${numClasses} ${m.discretization_num_classes().toLowerCase()}`;
  });

  let showPrimaryFormat = $state(false);
  let showSecondaryFormat = $state(false);

  function togglePrimaryFormat() {
    showPrimaryFormat = !showPrimaryFormat;
    showSecondaryFormat = false;
  }

  function toggleSecondaryFormat() {
    showSecondaryFormat = !showSecondaryFormat;
    showPrimaryFormat = false;
  }
</script>

<ExpandableSection
  title={m.texts_title()}
  defaultOpen={false}
  showToggle
  toggleChecked={enabled}
  disabled={disabled}
  disabledReason={disabled ? m.texts_disabled_no_geometry() : undefined}
  onToggleChange={handleToggleChange}
>
  {#snippet icon()}
    <InfoPopover text={m.texts_section_info()} />
    <VizFilterButton
      active={filterPanelOpen || filters.length > 0}
      count={filters.length}
      onToggle={onToggleFilterPanel}
    />
  {/snippet}

  <div class="texts-config">
    <div class="field-row">
      <div class="field-row-dropdown">
        <Dropdown
          titleText={m.text_according()}
          items={dataFields}
          selectedId={selectedFieldId}
          on:select={(e) => handleFieldSelect(e.detail.selectedId)}
          type="default"
        />
      </div>
      <div class="field-row-action">
        <IconButton
          icon={LetterAa}
          kind={showPrimaryFormat ? 'primary' : 'ghost'}
          size="field"
          iconDescription={m.text_format_button()}
          on:click={togglePrimaryFormat}
        />
      </div>
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
            value={color}
            onchange={handleColorChange}
          />
        {:else if colorMode === ColorMode.CLASSES}
          <div class="field-group">
            <Dropdown
              titleText={m.color_according()}
              items={dataFields}
              selectedId={selectedFieldId}
              on:select={(e) => handleFieldSelect(e.detail.selectedId)}
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
              items={dataFields}
              selectedId={selectedCategoryFieldId}
              on:select={(e) => handleCategoryFieldSelect(e.detail.selectedId)}
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
          value={opacity}
          onchange={handleOpacityChange}
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
            on:change={(e) =>
              handleSizeChange(Number((e.target as HTMLSelectElement).value))}
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
      <div class="field-row-dropdown">
        <Dropdown
          titleText={m.secondary_text()}
          items={secondaryFieldItems}
          selectedId={secondaryFieldId}
          on:select={(e) => handleSecondaryFieldSelect(e.detail.selectedId)}
          type="default"
        />
      </div>
      <div class="field-row-action">
        <IconButton
          icon={LetterAa}
          kind={showSecondaryFormat ? 'primary' : 'ghost'}
          size="field"
          disabled={!hasSecondaryField}
          iconDescription={m.text_format_button()}
          on:click={toggleSecondaryFormat}
        />
      </div>
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
            on:change={(e) =>
              handleSizeChange(Number((e.target as HTMLSelectElement).value))}
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

    <MissingDataSection
      bind:show={showMissingData}
      color={missingDataColor}
      showShapeSelector={false}
      showSizeSlider={false}
      onshowchange={handleMissingDataShowChange}
      oncolorchange={handleMissingDataColorChange}
    />
  </div>
</ExpandableSection>

<DiscretizationModal
  bind:open={discretizationModalOpen}
  visualization={visualization}
  onchange={handleClassificationChange}
/>

<style lang="scss">
  .texts-config {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    padding: var(--cds-spacing-03);
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .field-label {
    font-size: var(--cds-label-01-font-size, 0.75rem);
    font-weight: var(--cds-label-01-font-weight, 400);
    line-height: var(--cds-label-01-line-height, 1.33333);
    letter-spacing: var(--cds-label-01-letter-spacing, 0.32px);
    color: var(--cds-text-secondary);
    margin-bottom: var(--cds-spacing-02);
  }

  .field-row {
    display: flex;
    align-items: flex-end;
    gap: var(--cds-spacing-03);
  }

  .field-row-dropdown {
    flex: 1;
    min-width: 0;
  }

  .field-row-action {
    flex-shrink: 0;
  }

  .format-panel {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    padding: var(--cds-spacing-03);
    border-left: 2px solid var(--cds-border-interactive);
    margin-left: var(--cds-spacing-02);
  }

  .text-style-row {
    display: flex;
    gap: var(--cds-spacing-03);
    align-items: center;
  }
</style>
