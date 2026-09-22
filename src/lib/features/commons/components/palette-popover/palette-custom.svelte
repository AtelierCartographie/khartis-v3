<script lang="ts">
  import { untrack } from 'svelte';
  import * as m from '$lib/paraglide/messages';
  import SimpleRadioGroup from '$lib/features/commons/components/simple-radio-group.svelte';
  import ContentSwitcher from './content-switcher.svelte';
  import SingleColorPreview from './single-color-preview.svelte';
  import PatternPalettePicker from './pattern-palette-picker.svelte';
  import {
    ColorSelector,
    ToggleWithLabel
  } from '$lib/features/commons/components/viz-controls';
  import type { ContrastMode } from '@ateliercartographie/ok-palette';
  import type { PatternPaletteConfig } from '$lib/features/commons/constants/pattern.constants';
  import {
    PALETTE_TYPE,
    type DivergingPaletteSplit,
    type PaletteType,
    generatePaletteColors,
    generateSequentialFromColor,
    generateSequentialFromColors
  } from './palette.constants';

  interface Props {
    paletteType?: PaletteType;
    numClasses: number;
    currentColors?: string[];
    divergingSplit?: DivergingPaletteSplit;
    inverted?: boolean;
    allowPattern?: boolean;
    patternPaletteConfig?: PatternPaletteConfig;
    onColorsChange?: (colors: string[]) => void;
    onPatternPaletteChange?: (config: PatternPaletteConfig) => void;
    onInvertToggle?: (value: boolean) => void;
  }

  let {
    paletteType = PALETTE_TYPE.SEQUENTIAL,
    numClasses,
    currentColors = [],
    divergingSplit,
    inverted = false,
    allowPattern = true,
    patternPaletteConfig,
    onColorsChange,
    onPatternPaletteChange,
    onInvertToggle
  }: Props = $props();

  const DEFAULT_PATTERN_PALETTE_CONFIG: PatternPaletteConfig = {
    shape: 'line',
    angle: 45,
    scale: 0.7,
    color: '#000000'
  };

  const CUSTOM_PALETTE_ID = '__custom__';
  const FALLBACK_START_COLOR = '#f7fbff';
  const FALLBACK_END_COLOR = '#08519c';

  let activeTab = $state(0);
  let activeTabInitialized = false;
  let singleColor = $state(FALLBACK_END_COLOR);
  let startColor = $state(FALLBACK_START_COLOR);
  let endColor = $state(FALLBACK_END_COLOR);
  let contrastMode = $state<'low' | 'normal' | 'high'>('normal');
  let motifEnabled = $state(false);
  let emittedColors: string[] = [];

  let draftPatternPaletteConfig = $state<PatternPaletteConfig>(
    DEFAULT_PATTERN_PALETTE_CONFIG
  );

  const isQualitative = $derived(paletteType === PALETTE_TYPE.QUALITATIVE);

  const tabLabels = $derived(
    allowPattern
      ? [
          m.palette_custom_1_color(),
          m.palette_custom_2_colors(),
          m.palette_custom_patterns()
        ]
      : [m.palette_custom_1_color(), m.palette_custom_2_colors()]
  );

  $effect(() => {
    const next = patternPaletteConfig;
    if (next) {
      untrack(() => {
        draftPatternPaletteConfig = next;
        if (!activeTabInitialized) {
          activeTabInitialized = true;
          contrastMode =
            next.contrast === 'low' || next.contrast === 'high'
              ? next.contrast
              : 'normal';
          if (isQualitative) {
            motifEnabled = true;
          } else {
            activeTab = 2;
          }
        }
      });
    }
  });

  const resolvedContrast = $derived<ContrastMode | undefined>(
    contrastMode === 'normal' ? undefined : contrastMode
  );

  function emitColors(colors: string[]) {
    emittedColors = colors;
    onColorsChange?.(colors);
  }

  function buildColors(seedColors: string[]): string[] {
    if (paletteType === PALETTE_TYPE.DIVERGING) {
      return generatePaletteColors(
        {
          id: CUSTOM_PALETTE_ID,
          colors: seedColors,
          type: PALETTE_TYPE.DIVERGING
        },
        numClasses,
        resolvedContrast,
        undefined,
        divergingSplit
      );
    }

    return seedColors.length > 1
      ? generateSequentialFromColors(
          seedColors[0],
          seedColors[seedColors.length - 1],
          numClasses,
          resolvedContrast
        )
      : generateSequentialFromColor(
          seedColors[0],
          numClasses,
          resolvedContrast
        );
  }

  // The custom fields mirror the palette in progress: they follow every
  // suggestion the user tries, but must not snap back over the colour this
  // very section just emitted.
  $effect(() => {
    const incoming = currentColors;
    untrack(() => {
      if (
        incoming.length === emittedColors.length &&
        incoming.every((color, index) => color === emittedColors[index])
      ) {
        return;
      }
      emittedColors = [...incoming];
      if (incoming.length === 0) return;
      startColor = incoming[0];
      endColor = incoming[incoming.length - 1];
      singleColor = isQualitative ? incoming[0] : incoming[incoming.length - 1];
    });
  });

  function handleTabChange(index: number) {
    activeTabInitialized = true;
    if (index === 0 && activeTab === 1) {
      singleColor = endColor;
    } else if (index === 1 && activeTab === 0) {
      endColor = singleColor;
      // A diverging palette needs two opposite hues; a sequential ramp starts
      // from white so the single seed keeps its full range.
      startColor =
        paletteType === PALETTE_TYPE.DIVERGING
          ? (currentColors[0] ?? startColor)
          : '#ffffff';
    }
    activeTab = index;

    if (index === 0) {
      emitColors(buildColors([singleColor]));
    } else if (index === 1) {
      emitColors(buildColors([startColor, endColor]));
    } else if (index === 2) {
      emitPatternPaletteChange(draftPatternPaletteConfig);
    }
  }

  function handleContrastChange(value: string) {
    const next = value as 'low' | 'normal' | 'high';
    if (next === contrastMode) return;
    contrastMode = next;

    if (activeTab === 0) {
      emitColors(buildColors([singleColor]));
    } else if (activeTab === 1) {
      emitColors(buildColors([startColor, endColor]));
    } else if (activeTab === 2) {
      emitPatternPaletteChange(draftPatternPaletteConfig);
    }
  }

  function emitPatternPaletteChange(config: PatternPaletteConfig) {
    draftPatternPaletteConfig = { ...config, contrast: resolvedContrast };
    onPatternPaletteChange?.(draftPatternPaletteConfig);
  }

  function handlePatternPaletteChange(config: PatternPaletteConfig) {
    emitPatternPaletteChange(config);
  }

  function handleSingleColorChange(color: string) {
    singleColor = color;
    emitColors(isQualitative ? [color] : buildColors([color]));
  }

  function handleStartColorChange(color: string) {
    startColor = color;
    emitColors(buildColors([startColor, endColor]));
  }

  function handleEndColorChange(color: string) {
    endColor = color;
    emitColors(buildColors([startColor, endColor]));
  }

  function handleInvertToggle(value: boolean) {
    onInvertToggle?.(value);
  }

  function handleMotifToggle(value: boolean) {
    motifEnabled = value;
    if (!value) {
      emitColors([singleColor]);
      return;
    }

    emitPatternPaletteChange(draftPatternPaletteConfig);
  }
</script>

<div class="palette-custom">
  <div class="section-heading">
    <span class="section-heading-text"
      >{isQualitative ? m.palette_custom_color() : m.palette_custom()}</span
    >
    <div class="section-heading-line"></div>
  </div>

  {#if isQualitative}
    <ColorSelector
      label={m.color()}
      value={singleColor}
      onchange={handleSingleColorChange}
    />

    {#if allowPattern}
      <ToggleWithLabel
        label={m.pattern()}
        toggled={motifEnabled}
        ontoggle={handleMotifToggle}
      />
    {/if}

    {#if allowPattern && motifEnabled}
      <PatternPalettePicker
        config={draftPatternPaletteConfig}
        onchange={handlePatternPaletteChange}
      />
    {/if}
  {:else}
    <ContentSwitcher
      items={tabLabels}
      ariaLabel={m.palette_custom()}
      activeIndex={activeTab}
      onchange={handleTabChange}
    />

    <div class="tab-content">
      {#if activeTab === 0}
        <SingleColorPreview
          label={m.color()}
          color={singleColor}
          onchange={handleSingleColorChange}
        />
      {:else if activeTab === 1}
        <div class="two-colors">
          <SingleColorPreview
            label={m.color()}
            color={startColor}
            onchange={handleStartColorChange}
          />
          <SingleColorPreview
            label={m.color()}
            color={endColor}
            onchange={handleEndColorChange}
          />
        </div>
      {:else if activeTab === 2}
        <PatternPalettePicker
          config={draftPatternPaletteConfig}
          onchange={handlePatternPaletteChange}
        />
      {/if}
    </div>

    <div class="contrast-section">
      <span class="field-label">{m.contrast_label()}</span>
      <SimpleRadioGroup
        name="palette-contrast"
        items={[
          { value: 'low', labelText: m.contrast_low() },
          { value: 'normal', labelText: m.contrast_normal() },
          { value: 'high', labelText: m.contrast_high() }
        ]}
        selected={contrastMode}
        onchange={(value) => handleContrastChange(value)}
      />
    </div>

    <ToggleWithLabel
      label={m.invert_palette_tooltip()}
      toggled={inverted}
      ontoggle={handleInvertToggle}
    />
  {/if}
</div>

<style lang="scss">
  .palette-custom {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-group);
    width: 100%;
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 24px;
    width: 100%;
  }

  .section-heading-text {
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 600;
    font-size: 14px;
    line-height: 20px;
    letter-spacing: 0.16px;
    color: var(--cds-text-primary, #161616);
    white-space: nowrap;
  }

  .section-heading-line {
    flex: 1;
    height: 1px;
    background: var(--cds-border-subtle-01, #c6c6c6);
  }

  .tab-content {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-group);
  }

  .two-colors {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-group);
  }

  .contrast-section {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-inline);
  }
</style>
