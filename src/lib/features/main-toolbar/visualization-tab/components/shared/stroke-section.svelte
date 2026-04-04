<script lang="ts">
  import { Dropdown } from 'carbon-components-svelte';
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
  import PalettePreview from './palette-preview.svelte';
  import SectionHeading from './section-heading.svelte';
  import SliderWithInput from './slider-with-input.svelte';
  import ToggleWithLabel from './toggle-with-label.svelte';

  interface Props {
    visualization?: VisualizationConfig;
    dataFields?: Array<{ id: number; text: string }>;
    infoText?: string;
    showDashed?: boolean;
    classesPalette?: string[];
    categoriesPalette?: string[];
    discretizationLabel?: string;
    categoryCount?: number;
    onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
    onModesChange?: (updates: Partial<VisualizationModes>) => void;
    onInvertPalette?: () => void;
    onOpenDiscretization?: () => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
  }

  const DEFAULT_SEQUENTIAL_PALETTE = [
    '#c8ddf0',
    '#78a9cf',
    '#2171b5',
    '#084594'
  ];
  const DEFAULT_QUALITATIVE_PALETTE = [
    '#009d9a',
    '#f1c21b',
    '#ff832b',
    '#a56eff'
  ];

  let {
    visualization,
    dataFields = [],
    infoText,
    showDashed = true,
    classesPalette = DEFAULT_SEQUENTIAL_PALETTE,
    categoriesPalette = DEFAULT_QUALITATIVE_PALETTE,
    discretizationLabel,
    categoryCount = 4,
    onStyleChange,
    onModesChange,
    onInvertPalette,
    onOpenDiscretization,
    onClassificationChange
  }: Props = $props();

  let strokeMode = $state<StrokeMode>(StrokeMode.NONE);
  let strokeWidth = $state<number>(VISUALIZATION_DEFAULTS.strokeWidth);
  let strokeColor = $state<string>(DEFAULT_COLORS.stroke);
  let strokeOpacity = $state<number>(VISUALIZATION_DEFAULTS.strokeOpacity);
  let strokeDashed = $state<boolean>(false);
  let colorFieldId = $state<number>(0);

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
      <Dropdown
        titleText={m.color_according()}
        items={dataFields}
        bind:selectedId={colorFieldId}
        type="default"
      />
    </div>
    <DiscretizationRow
      label={m.discretization()}
      value={discretizationLabel ?? ''}
      onsettings={onOpenDiscretization}
    />
    <PalettePreview
      label={m.color_palette()}
      colors={classesPalette}
      selectedPaletteId={visualization?.classification?.paletteId}
      inverted={visualization?.classification?.inverted ?? false}
      oninvert={onInvertPalette}
      onClassificationChange={onClassificationChange}
    />
  {:else if strokeMode === StrokeMode.CATEGORIES}
    <div class="field-group">
      <Dropdown
        titleText={m.color_according()}
        items={dataFields}
        bind:selectedId={colorFieldId}
        type="default"
      />
    </div>
    <DiscretizationRow
      label={m.category_aspect()}
      value={m.categories_count({ count: categoryCount })}
      onsettings={onOpenDiscretization}
    />
    <PalettePreview
      label={m.color_palette()}
      colors={categoriesPalette}
      selectedPaletteId={visualization?.classification?.paletteId}
      inverted={visualization?.classification?.inverted ?? false}
      oninvert={onInvertPalette}
      onClassificationChange={onClassificationChange}
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
