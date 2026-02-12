<script lang="ts">
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
    ToggleWithLabel
  } from './shared';
  import type {
    MissingDataConfig,
    VisualizationConfig,
    VisualizationModes
  } from '$lib/features/commons/store/visualization.store.svelte';
  import {
    ALL_PRIMITIVE_FILTERS,
    PrimitiveFilterType
  } from '$lib/features/commons/store/visualization.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import { Category, Minimize, Subtract, Tag } from 'carbon-icons-svelte';
  import {
    ColorMode,
    DEFAULT_COLORS,
    MissingDataShape,
    ThicknessMode,
    SLIDER_LIMITS,
    VISUALIZATION_DEFAULTS
  } from '../../constants';
  import { Dropdown } from 'carbon-components-svelte';
  import DiscretizationModal from './discretization-modal.svelte';
  import {
    ClassificationMethod,
    type ClassificationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';

  interface Props {
    dataFields?: Array<{ id: number; text: string }>;
    discretizationMethods?: Array<{ id: number; text: string }>;
    visualization?: VisualizationConfig;
    onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
    onModesChange?: (updates: Partial<VisualizationModes>) => void;
    onMissingDataChange?: (updates: Partial<MissingDataConfig>) => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
    onMappingChange?: (
      updates: Partial<VisualizationConfig['mapping']>
    ) => void;
    onInvertPalette?: () => void;
    onToggleVisibility?: (checked: boolean) => void;
  }

  let {
    dataFields = [],
    discretizationMethods: _discretizationMethods = [],
    visualization,
    onStyleChange,
    onModesChange,
    onMissingDataChange,
    onClassificationChange,
    onMappingChange,
    onInvertPalette,
    onToggleVisibility
  }: Props = $props();

  let discretizationModalOpen = $state(false);
  let selectedFieldId = $state<number>(0);

  $effect(() => {
    if (visualization?.mapping.valueColumn && dataFields.length > 0) {
      const fieldIndex = dataFields.findIndex(
        (f) => f.text === visualization.mapping.valueColumn
      );
      if (fieldIndex >= 0) {
        selectedFieldId = fieldIndex;
      }
    }
  });

  function handleFieldSelect(fieldId: number) {
    selectedFieldId = fieldId;
    const field = dataFields[fieldId];
    if (field && onMappingChange) {
      onMappingChange({ valueColumn: field.text });
    }
  }

  const currentPalette = $derived(
    visualization?.classification?.colors ?? [
      '#c8ddf0',
      '#78a9cf',
      '#2171b5',
      '#084594'
    ]
  );
  const qualitativePalette = ['#009d9a', '#f1c21b', '#ff832b', '#a56eff'];

  let thicknessMode = $state<ThicknessMode>(ThicknessMode.UNIQUE);
  let colorMode = $state<ColorMode>(ColorMode.UNIQUE);
  let thickness = $state<number>(VISUALIZATION_DEFAULTS.lineWidth);
  let maxThickness = $state<number>(VISUALIZATION_DEFAULTS.lineMaxWidth);
  let color = $state<string>(DEFAULT_COLORS.line);
  let opacity = $state<number>(VISUALIZATION_DEFAULTS.lineOpacity);
  const enabled = $derived.by(() => {
    const primitiveFilters =
      visualization?.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;
    return primitiveFilters.includes(PrimitiveFilterType.LINE);
  });
  let dashed = $state<boolean>(false);
  let showMissingData = $state<boolean>(false);
  let _missingDataLabel = $state<string>('');

  $effect(() => {
    if (visualization?.style) {
      thickness =
        visualization.style.lineWidth ?? VISUALIZATION_DEFAULTS.lineWidth;
      maxThickness =
        visualization.style.lineMaxWidth ?? VISUALIZATION_DEFAULTS.lineMaxWidth;
      opacity =
        visualization.style.lineOpacity ?? VISUALIZATION_DEFAULTS.lineOpacity;
      color = (visualization.style.lineColor as string) ?? DEFAULT_COLORS.line;
      dashed = visualization.style.lineDashed ?? false;
    }
    if (visualization?.modes) {
      thicknessMode = visualization.modes.thickness ?? ThicknessMode.UNIQUE;
      colorMode = visualization.modes.color ?? ColorMode.UNIQUE;
    }
    if (visualization?.missingData) {
      showMissingData = visualization.missingData.enabled ?? false;
      _missingDataLabel = visualization.missingData.label ?? '';
    }
  });

  const thicknessModeItems = [
    { icon: Subtract, label: m.thickness_mode_unique(), iconSize: 16 },
    { icon: Minimize, label: m.thickness_mode_proportional(), iconSize: 16 },
    { icon: Category, label: m.thickness_mode_classes(), iconSize: 16 }
  ];

  const colorModeItems = [
    { icon: Subtract, label: m.color_mode_unique(), iconSize: 16 },
    { icon: Category, label: m.color_mode_classes(), iconSize: 16 },
    { icon: Tag, label: m.color_mode_categories(), iconSize: 16 }
  ];

  function handleThicknessModeChange(index: number) {
    const modes = [
      ThicknessMode.UNIQUE,
      ThicknessMode.PROPORTIONAL,
      ThicknessMode.CLASSES
    ];
    thicknessMode = modes[index] || ThicknessMode.UNIQUE;
    onModesChange?.({ thickness: thicknessMode });
  }

  function handleColorModeChange(index: number) {
    const modes = [ColorMode.UNIQUE, ColorMode.CLASSES, ColorMode.CATEGORIES];
    colorMode = modes[index] || ColorMode.UNIQUE;
    onModesChange?.({ color: colorMode });
  }

  function handleThicknessChange(value: number) {
    thickness = value;
    onStyleChange?.({ lineWidth: value });
  }

  function handleMaxThicknessChange(value: number) {
    maxThickness = value;
    onStyleChange?.({ lineMaxWidth: value });
  }

  function handleColorChange(value: string) {
    color = value;
    onStyleChange?.({ lineColor: value });
  }

  function handleOpacityChange(value: number) {
    opacity = value;
    onStyleChange?.({ lineOpacity: value });
  }

  function handleDashedChange(value: boolean) {
    dashed = value;
    onStyleChange?.({ lineDashed: value });
  }

  function handleToggleChange(checked: boolean) {
    onToggleVisibility?.(checked);
  }

  function handleMissingDataToggle(checked: boolean) {
    showMissingData = checked;
    onMissingDataChange?.({ enabled: checked });
  }

  function handleMissingDataColorChange(value: string) {
    onMissingDataChange?.({ color: value });
  }

  function handleMissingDataOpacityChange(value: number) {
    onMissingDataChange?.({ opacity: value / 100 });
  }

  function handleMissingDataShapeChange(shape: string) {
    onMissingDataChange?.({ shape: shape as MissingDataShape });
  }

  function _handleMissingDataLabelChange(label: string) {
    _missingDataLabel = label;
    onMissingDataChange?.({ label });
  }

  const thicknessModeIndex = $derived(
    [
      ThicknessMode.UNIQUE,
      ThicknessMode.PROPORTIONAL,
      ThicknessMode.CLASSES
    ].indexOf(thicknessMode)
  );

  const colorModeIndex = $derived(
    [ColorMode.UNIQUE, ColorMode.CLASSES, ColorMode.CATEGORIES].indexOf(
      colorMode
    )
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
      [ClassificationMethod.MANUAL]: m.discretization_method_manual
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
  title={m.lines_title()}
  defaultOpen={false}
  showToggle
  toggleChecked={enabled}
  onToggleChange={handleToggleChange}
>
  {#snippet icon()}
    <InfoPopover text={m.lines_section_info()} />
  {/snippet}

  <div class="lines-config">
    <SectionHeading title={m.thickness()} />

    <div class="field-group">
      <ToggleTabs
        items={thicknessModeItems}
        activeIndex={thicknessModeIndex}
        onChange={handleThicknessModeChange}
        hideInactiveLabel={true}
      />
    </div>

    {#if thicknessMode === ThicknessMode.UNIQUE}
      <SliderWithInput
        label={m.thickness()}
        min={SLIDER_LIMITS.lineWidth.min}
        max={SLIDER_LIMITS.lineWidth.max}
        value={thickness}
        onchange={handleThicknessChange}
      />
    {:else if thicknessMode === ThicknessMode.PROPORTIONAL}
      <div class="field-group">
        <Dropdown
          titleText={m.thickness_according()}
          items={dataFields}
          selectedId={selectedFieldId}
          on:select={(e) => handleFieldSelect(e.detail.selectedId)}
          type="default"
        />
      </div>
      <SliderWithInput
        label={m.max_thickness()}
        min={1}
        max={SLIDER_LIMITS.lineMaxWidth.max}
        value={maxThickness}
        onchange={handleMaxThicknessChange}
      />
    {:else if thicknessMode === ThicknessMode.CLASSES}
      <div class="field-group">
        <Dropdown
          titleText={m.thickness_according()}
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
      <SliderWithInput
        label={m.max_thickness()}
        min={1}
        max={SLIDER_LIMITS.lineMaxWidth.max}
        value={maxThickness}
        onchange={handleMaxThicknessChange}
      />
    {/if}

    <SectionHeading title={m.color()} />

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
        oninvert={onInvertPalette}
      />
    {:else if colorMode === ColorMode.CATEGORIES}
      <div class="field-group">
        <Dropdown
          titleText={m.color_according()}
          items={dataFields}
          bind:selectedId={selectedFieldId}
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
      />
    {/if}

    <ToggleWithLabel
      label={m.dashed()}
      toggled={dashed}
      ontoggle={handleDashedChange}
    />

    <SliderWithInput
      label={m.opacity()}
      min={SLIDER_LIMITS.lineOpacity.min}
      max={SLIDER_LIMITS.lineOpacity.max}
      value={opacity}
      onchange={handleOpacityChange}
    />

    <MissingDataSection
      show={showMissingData}
      onshowchange={handleMissingDataToggle}
      color={visualization?.missingData?.color}
      oncolorchange={handleMissingDataColorChange}
      opacity={visualization?.missingData?.opacity}
      onopacitychange={handleMissingDataOpacityChange}
      shape={visualization?.missingData?.shape}
      onshapechange={handleMissingDataShapeChange}
      showShapeSelector={true}
    />
  </div>
</ExpandableSection>

<DiscretizationModal
  bind:open={discretizationModalOpen}
  visualization={visualization}
  onchange={handleClassificationChange}
/>

<style lang="scss">
  .lines-config {
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
</style>
