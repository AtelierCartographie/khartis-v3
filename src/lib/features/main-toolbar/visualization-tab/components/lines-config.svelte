<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import type {
    MissingDataConfig as MissingDataConfigType,
    VisualizationConfig,
    VisualizationModes
  } from '$lib/features/commons/store/visualization.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import { Dropdown } from 'carbon-components-svelte';
  import { Category, ChartLine, Filter, Tag } from 'carbon-icons-svelte';
  import {
    DEFAULT_COLORS,
    FillMode,
    SLIDER_LIMITS,
    ThicknessMode,
    VISUALIZATION_DEFAULTS
  } from '../../constants';
  import MissingDataConfigComponent from './missing-data-config.svelte';
  import {
    ColorSelector,
    DiscretizationRow,
    PalettePreview,
    SectionTitle,
    SliderWithInput,
    ToggleWithLabel
  } from './shared';
  import DiscretizationModal from './discretization-modal.svelte';
  import {
    ClassificationMethod,
    type ClassificationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';

  interface Props {
    dataFields?: Array<{ id: number; text: string }>;
    enabled?: boolean;
    visualization?: VisualizationConfig;
    onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
    onModesChange?: (updates: Partial<VisualizationModes>) => void;
    onMissingDataChange?: (updates: Partial<MissingDataConfigType>) => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
    onInvertPalette?: () => void;
    onEnabledChange?: (enabled: boolean) => void;
  }

  let {
    dataFields = [],
    enabled = $bindable(false),
    visualization,
    onStyleChange,
    onModesChange: _onModesChange,
    onMissingDataChange,
    onClassificationChange,
    onInvertPalette: _onInvertPalette,
    onEnabledChange
  }: Props = $props();

  let discretizationModalOpen = $state(false);

  let thicknessMode = $state<ThicknessMode>(ThicknessMode.UNIQUE);
  let colorMode = $state<FillMode>(FillMode.CATEGORIES);
  let lineWidth = $state<number>(VISUALIZATION_DEFAULTS.lineWidth);
  let lineOpacity = $state<number>(VISUALIZATION_DEFAULTS.lineOpacity);
  let selectedColorFieldId = $state<number>(0);
  let categoryCount = $state<number>(4);
  let showMissingData = $state<boolean>(true);
  let missingDataColor = $state<string>(DEFAULT_COLORS.missingData);
  let missingDataDashed = $state<boolean>(false);
  let missingDataWidth = $state<number>(1);
  let lineColor = $state<string>(DEFAULT_COLORS.stroke);
  let lineDashed = $state<boolean>(false);

  $effect(() => {
    if (visualization?.style) {
      lineWidth =
        visualization.style.strokeWidth ?? VISUALIZATION_DEFAULTS.lineWidth;
      lineOpacity =
        visualization.style.strokeOpacity !== undefined
          ? Math.round(visualization.style.strokeOpacity * 100)
          : VISUALIZATION_DEFAULTS.lineOpacity;
      lineColor = visualization.style.strokeColor ?? DEFAULT_COLORS.stroke;
      lineDashed = visualization.style.strokeDashed ?? false;
    }
    if (visualization?.missingData) {
      showMissingData = visualization.missingData.show ?? true;
      missingDataColor =
        visualization.missingData.color ?? DEFAULT_COLORS.missingData;
    }
  });

  const sequentialPalette = ['#c8ddf0', '#78a9cf', '#2171b5', '#084594'];
  const qualitativePalette = ['#009d9a', '#f1c21b', '#ff832b', '#a56eff'];

  const thicknessModeItems = [
    { icon: ChartLine, label: m.unique(), iconSize: 16 }
  ];

  const colorModeItems = [
    { icon: ChartLine, label: m.fill_mode_classes(), iconSize: 16 },
    { icon: Category, label: m.fill_mode_classes(), iconSize: 16 },
    { icon: Tag, label: m.fill_mode_categories(), iconSize: 16 }
  ];

  const thicknessModeIndex = $derived(
    [
      ThicknessMode.UNIQUE,
      ThicknessMode.GRADUATED,
      ThicknessMode.CLASSES
    ].indexOf(thicknessMode)
  );

  const colorModeIndex = $derived(
    [FillMode.UNIQUE, FillMode.CLASSES, FillMode.CATEGORIES].indexOf(colorMode)
  );

  function handleThicknessModeChange(index: number) {
    const modes = [
      ThicknessMode.UNIQUE,
      ThicknessMode.GRADUATED,
      ThicknessMode.CLASSES
    ];
    thicknessMode = modes[index] || ThicknessMode.UNIQUE;
  }

  function handleColorModeChange(index: number) {
    const modes = [FillMode.UNIQUE, FillMode.CLASSES, FillMode.CATEGORIES];
    colorMode = modes[index] || FillMode.CATEGORIES;
  }

  function handleToggleChange(checked: boolean) {
    enabled = checked;
    onEnabledChange?.(checked);
  }

  function handleLineWidthChange(value: number) {
    lineWidth = value;
    onStyleChange?.({ strokeWidth: value });
  }

  function handleLineOpacityChange(value: number) {
    lineOpacity = value;
    onStyleChange?.({ strokeOpacity: value / 100 });
  }

  function handleLineColorChange(value: string) {
    lineColor = value;
    onStyleChange?.({ strokeColor: value });
  }

  function handleLineDashedChange(value: boolean) {
    lineDashed = value;
    onStyleChange?.({ strokeDashed: value });
  }

  function _handleMissingDataShowChange(value: boolean) {
    showMissingData = value;
    onMissingDataChange?.({ show: value });
  }

  function _handleMissingDataColorChange(value: string) {
    missingDataColor = value;
    onMissingDataChange?.({ color: value });
  }

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
    <button type="button" class="filter-btn" aria-label={m.filter_data()}>
      <Filter size={16} />
    </button>
  {/snippet}

  <div class="lines-config">
    <SectionTitle title={m.thickness()} />

    <div class="field-group">
      <ToggleTabs
        items={thicknessModeItems}
        activeIndex={thicknessModeIndex}
        onChange={handleThicknessModeChange}
        hideInactiveLabel={true}
      />
    </div>

    <SliderWithInput
      label={m.thickness()}
      bind:value={lineWidth}
      min={1}
      max={SLIDER_LIMITS.strokeWidth.max}
      onchange={handleLineWidthChange}
    />

    <SectionTitle title={m.color()} />

    <div class="field-group">
      <ToggleTabs
        items={colorModeItems}
        activeIndex={colorModeIndex}
        onChange={handleColorModeChange}
        hideInactiveLabel={true}
      />
    </div>

    {#if colorMode === FillMode.CATEGORIES}
      <div class="field-group">
        <Dropdown
          titleText={m.color_according()}
          items={dataFields}
          bind:selectedId={selectedColorFieldId}
          type="default"
        />
      </div>

      <DiscretizationRow
        label={m.category_aspect()}
        value={m.categories_count({ count: categoryCount })}
        onsettings={handleOpenDiscretization}
      />

      <PalettePreview label={m.color_palette()} colors={qualitativePalette} />

      <SliderWithInput
        label={m.opacity()}
        bind:value={lineOpacity}
        min={SLIDER_LIMITS.opacity.min}
        max={SLIDER_LIMITS.opacity.max}
        onchange={handleLineOpacityChange}
      />

      <MissingDataConfigComponent
        bind:show={showMissingData}
        bind:color={missingDataColor}
        bind:dashed={missingDataDashed}
        bind:width={missingDataWidth}
        showDashed={true}
        showWidth={true}
      />
    {:else if colorMode === FillMode.CLASSES}
      <div class="field-group">
        <Dropdown
          titleText={m.color_according()}
          items={dataFields}
          bind:selectedId={selectedColorFieldId}
          type="default"
        />
      </div>

      <DiscretizationRow
        label={m.discretization()}
        value={discretizationLabel}
        onsettings={handleOpenDiscretization}
      />

      <PalettePreview label={m.color_palette()} colors={sequentialPalette} />

      <SliderWithInput
        label={m.opacity()}
        bind:value={lineOpacity}
        min={SLIDER_LIMITS.opacity.min}
        max={SLIDER_LIMITS.opacity.max}
        onchange={handleLineOpacityChange}
      />

      <MissingDataConfigComponent
        bind:show={showMissingData}
        bind:color={missingDataColor}
        bind:dashed={missingDataDashed}
        bind:width={missingDataWidth}
        showDashed={true}
        showWidth={true}
      />
    {:else}
      <ColorSelector
        label={m.color()}
        value={lineColor}
        onchange={handleLineColorChange}
      />

      <ToggleWithLabel
        label={m.dashed_line()}
        toggled={lineDashed}
        ontoggle={handleLineDashedChange}
      />

      <SliderWithInput
        label={m.opacity()}
        bind:value={lineOpacity}
        min={SLIDER_LIMITS.opacity.min}
        max={SLIDER_LIMITS.opacity.max}
        onchange={handleLineOpacityChange}
      />
    {/if}
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

  .filter-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--cds-spacing-02);
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--cds-icon-01);

    &:hover {
      background: var(--cds-hover-ui);
    }
  }

  :global(.lines-config .bx--dropdown) {
    max-width: 100%;
  }
</style>
