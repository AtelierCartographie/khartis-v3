<script lang="ts">
  import { untrack } from 'svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    ColorSelector,
    DiscretizationRow,
    InfoPopover,
    PalettePreview,
    SectionHeading,
    SliderWithInput,
    ToggleWithLabel
  } from './shared';
  import type {
    VisualizationConfig,
    VisualizationModes
  } from '$lib/features/commons/store/visualization.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    DEFAULT_SEQUENTIAL_PREVIEW,
    DEFAULT_QUALITATIVE_PREVIEW
  } from './palette-popover/palette.constants';
  import {
    Category,
    MisuseOutline,
    Subtract,
    Tag,
    TextAlignLeft,
    TextAlignCenter,
    TextAlignRight
  } from 'carbon-icons-svelte';
  import {
    ColorMode,
    DEFAULT_COLORS,
    SizeMode,
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
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
    onMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
    onInvertPalette?: () => void;
    onToggleVisibility?: (checked: boolean) => void;
  }

  let {
    dataFields = [],
    visualization,
    disabled = false,
    onStyleChange,
    onModesChange,
    onClassificationChange,
    onMappingChange,
    onInvertPalette,
    onToggleVisibility
  }: Props = $props();

  let discretizationModalOpen = $state(false);
  let selectedFieldId = $state<number>(0);
  let selectedCategoryFieldId = $state<number>(0);
  let defaultLabelApplied = false;

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

  const currentPalette = $derived(
    visualization?.classification?.colors ?? DEFAULT_SEQUENTIAL_PREVIEW
  );
  const qualitativePalette = DEFAULT_QUALITATIVE_PREVIEW;

  let colorMode = $state<ColorMode>(ColorMode.UNIQUE);
  let sizeMode = $state<SizeMode>(SizeMode.FIXED);
  let color = $state<string>(DEFAULT_COLORS.label);
  let opacity = $state<number>(VISUALIZATION_DEFAULTS.labelOpacity);
  const enabled = $derived((visualization?.style.labelOpacity ?? 1) > 0);
  let size = $state<number>(VISUALIZATION_DEFAULTS.labelSize);
  let alignment = $state<'left' | 'center' | 'right'>('center');
  let halo = $state<boolean>(true);
  let haloColor = $state<string>(DEFAULT_COLORS.halo);
  let haloWidth = $state<number>(VISUALIZATION_DEFAULTS.haloWidth);
  let collisionDetection = $state<boolean>(true);
  let dxpMasking = $state<boolean>(false);

  $effect(() => {
    if (visualization?.style) {
      const labelOpacity = visualization.style.labelOpacity;
      opacity =
        labelOpacity !== undefined
          ? labelOpacity <= 1
            ? Math.round(labelOpacity * 100)
            : labelOpacity
          : VISUALIZATION_DEFAULTS.labelOpacity;
      color =
        (visualization.style.labelColor as string) ?? DEFAULT_COLORS.label;
      size = visualization.style.labelSize ?? VISUALIZATION_DEFAULTS.labelSize;
      alignment = visualization.style.labelAlign ?? 'center';
      halo = visualization.style.labelHalo ?? true;
      haloColor = visualization.style.labelHaloColor ?? DEFAULT_COLORS.halo;
      haloWidth =
        visualization.style.labelHaloWidth ?? VISUALIZATION_DEFAULTS.haloWidth;
      collisionDetection = visualization.style.labelCollisionDetection ?? true;
      dxpMasking = visualization.style.labelDxpMasking ?? false;
    }
    if (visualization?.modes) {
      colorMode = visualization.modes.color ?? ColorMode.UNIQUE;
      sizeMode = visualization.modes.size ?? SizeMode.FIXED;
    }
  });

  const colorModeItems = [
    { icon: MisuseOutline, label: m.color_mode_none(), iconSize: 16 },
    { icon: Subtract, label: m.color_mode_unique(), iconSize: 16 },
    { icon: Category, label: m.color_mode_classes(), iconSize: 16 },
    { icon: Tag, label: m.color_mode_categories(), iconSize: 16 }
  ];

  const sizeModeItems = [
    { icon: MisuseOutline, label: m.size_mode_fixed(), iconSize: 16 },
    { icon: Subtract, label: m.size_mode_proportional(), iconSize: 16 }
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

  function handleSizeModeChange(index: number) {
    const modes = [SizeMode.FIXED, SizeMode.PROPORTIONAL];
    sizeMode = modes[index] || SizeMode.FIXED;
    onModesChange?.({ size: sizeMode });
  }

  function handleColorChange(value: string) {
    color = value;
    onStyleChange?.({ labelColor: value });
  }

  function handleOpacityChange(value: number) {
    opacity = value;
    onStyleChange?.({ labelOpacity: value / 100 });
  }

  function handleSizeChange(value: number) {
    size = value;
    onStyleChange?.({ labelSize: value });
  }

  function handleAlignmentChange(index: number) {
    const alignments: Array<'left' | 'center' | 'right'> = [
      'left',
      'center',
      'right'
    ];
    alignment = alignments[index] || 'center';
    onStyleChange?.({ labelAlign: alignment });
  }

  function handleHaloToggle(value: boolean) {
    halo = value;
    onStyleChange?.({ labelHalo: value });
  }

  function handleHaloColorChange(value: string) {
    haloColor = value;
    onStyleChange?.({ labelHaloColor: value });
  }

  function handleHaloWidthChange(value: number) {
    haloWidth = value;
    onStyleChange?.({ labelHaloWidth: value });
  }

  function handleCollisionDetectionChange(value: boolean) {
    collisionDetection = value;
    onStyleChange?.({ labelCollisionDetection: value });
  }

  function handleDxpMaskingChange(value: boolean) {
    dxpMasking = value;
    onStyleChange?.({ labelDxpMasking: value });
  }

  function handleToggleChange(checked: boolean) {
    if (checked && opacity <= 0) {
      opacity = VISUALIZATION_DEFAULTS.labelOpacity;
      onStyleChange?.({ labelOpacity: opacity / 100 });
    }
    onToggleVisibility?.(checked);
  }

  const colorModeIndex = $derived(
    [
      ColorMode.NONE,
      ColorMode.UNIQUE,
      ColorMode.CLASSES,
      ColorMode.CATEGORIES
    ].indexOf(colorMode)
  );

  const sizeModeIndex = $derived(
    [SizeMode.FIXED, SizeMode.PROPORTIONAL].indexOf(sizeMode)
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
</script>

<ExpandableSection
  title={m.labels_title()}
  defaultOpen={false}
  showToggle
  toggleChecked={enabled}
  disabled={disabled}
  disabledReason={disabled ? m.labels_disabled_no_geometry() : undefined}
  onToggleChange={handleToggleChange}
>
  {#snippet icon()}
    <InfoPopover text={m.labels_section_info()} />
  {/snippet}

  <div class="labels-config">
    <SectionHeading title={m.label_content()} />

    <div class="field-group">
      <Dropdown
        titleText={m.field_to_display()}
        items={dataFields}
        selectedId={selectedFieldId}
        on:select={(e) => handleFieldSelect(e.detail.selectedId)}
        type="default"
      />
    </div>

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
        oninvert={onInvertPalette}
        onClassificationChange={handleClassificationChange}
      />
    {/if}

    <SliderWithInput
      label={m.opacity()}
      min={SLIDER_LIMITS.labelOpacity.min}
      max={SLIDER_LIMITS.labelOpacity.max}
      value={opacity}
      onchange={handleOpacityChange}
    />

    <SectionHeading title={m.size()} />

    <div class="field-group">
      <ToggleTabs
        items={sizeModeItems}
        activeIndex={sizeModeIndex}
        onChange={handleSizeModeChange}
        hideInactiveLabel={true}
      />
    </div>

    {#if sizeMode === SizeMode.FIXED}
      <div class="field-group">
        <Select
          labelText={m.font_size()}
          selected={String(size)}
          on:change={(e) => handleSizeChange(Number((e as CustomEvent).detail))}
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
    {:else}
      <div class="field-group">
        <Dropdown
          titleText={m.size_according()}
          items={dataFields}
          selectedId={selectedFieldId}
          on:select={(e) => handleFieldSelect(e.detail.selectedId)}
          type="default"
        />
      </div>
    {/if}

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
</ExpandableSection>

<DiscretizationModal
  bind:open={discretizationModalOpen}
  visualization={visualization}
  onchange={handleClassificationChange}
/>

<style lang="scss">
  .labels-config {
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
</style>
