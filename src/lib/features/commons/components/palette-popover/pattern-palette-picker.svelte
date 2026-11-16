<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import {
    ColorSelector,
    SliderWithInput
  } from '$lib/features/commons/components/viz-controls';
  import {
    DIVERGING_PATTERN_DEFAULT_ANGLE,
    DIVERGING_PATTERN_SHAPES,
    type PatternPaletteConfig,
    type PatternShape
  } from '$lib/features/commons/constants/pattern.constants';
  import { DEFAULT_DIVERGING_COLORS } from '$lib/features/commons/constants/colors.constants';
  import { resolveDivergingPatternShape } from '$lib/features/commons/services/pattern-palette.service';
  import SimpleRadioGroup from '$lib/features/commons/components/simple-radio-group.svelte';
  import ShapeChipRow from './shape-chip-row.svelte';

  interface Props {
    config: PatternPaletteConfig;
    /** The classification has a breakpoint: one motif ramp per side. */
    diverging?: boolean;
    onchange: (config: PatternPaletteConfig) => void;
  }

  let { config, diverging = false, onchange }: Props = $props();

  const DEFAULT_ANGLE = 45;
  const DEFAULT_SCALE = 0.7;
  const DEFAULT_COLOR = '#000000';
  const DEFAULT_BACKGROUND = '#ffffff';

  type BackgroundMode = 'transparent' | 'color';

  const ANGLE_OPTIONS = [0, 45, 90, 135] as const;

  // A diverging ramp draws a cross as a plus turned by 45° and replaces the
  // shapes it cannot oppose: the controls show what the map draws.
  const divergingShape = $derived(
    diverging ? resolveDivergingPatternShape(config) : undefined
  );
  const shape = $derived(divergingShape?.shape ?? config.shape);
  const angle = $derived(
    divergingShape
      ? divergingShape.angle % 180
      : (config.angle ?? DEFAULT_ANGLE)
  );
  const divergingColors = $derived(
    config.divergingColors ?? DEFAULT_DIVERGING_COLORS
  );
  const scale = $derived(config.scale ?? DEFAULT_SCALE);
  const displayScale = $derived(Math.round(scale * 10));
  const color = $derived(config.color ?? DEFAULT_COLOR);
  const backgroundMode = $derived<BackgroundMode>(
    config.background ? 'color' : 'transparent'
  );
  // Remembers the last background color while the motif is transparent.
  let lastBackground = $state(DEFAULT_BACKGROUND);

  function handleShapeSelect(nextShape: PatternShape) {
    if (divergingShape && nextShape !== divergingShape.shape) {
      const divergingNext = resolveDivergingPatternShape({
        ...config,
        shape: nextShape,
        angle: undefined
      });
      onchange({
        ...config,
        shape: divergingNext.shape,
        angle: DIVERGING_PATTERN_DEFAULT_ANGLE[divergingNext.shape]
      });
      return;
    }
    onchange({ ...config, shape: nextShape });
  }

  function handleAngleSelect(nextAngle: (typeof ANGLE_OPTIONS)[number]) {
    onchange({ ...config, shape, angle: nextAngle });
  }

  function handleDivergingColorChange(side: 0 | 1, value: string) {
    const next: [string, string] = [divergingColors[0], divergingColors[1]];
    next[side] = value;
    onchange({ ...config, divergingColors: next });
  }

  function handleScaleChange(value: number) {
    onchange({ ...config, scale: value / 10 });
  }

  function handleColorChange(value: string) {
    onchange({ ...config, color: value });
  }

  function handleBackgroundModeChange(mode: BackgroundMode) {
    if (mode === 'color') {
      onchange({ ...config, background: lastBackground });
      return;
    }
    if (config.background) lastBackground = config.background;
    const { background: _background, ...rest } = config;
    onchange(rest);
  }

  function handleBackgroundChange(value: string) {
    lastBackground = value;
    onchange({ ...config, background: value });
  }
</script>

<div class="pattern-palette-picker">
  <div class="param-block">
    <span class="param-label">{m.pattern_shape()}</span>
    <ShapeChipRow
      value={shape}
      shapes={diverging ? DIVERGING_PATTERN_SHAPES : undefined}
      onselect={handleShapeSelect}
    />
  </div>

  <div class="param-block">
    <span class="param-label">{m.pattern_angle()}</span>
    <div class="angle-chips">
      {#each ANGLE_OPTIONS as option (option)}
        <button
          type="button"
          class="angle-chip"
          class:active={angle === option}
          aria-pressed={angle === option}
          onclick={() => handleAngleSelect(option)}
        >
          {option}°
        </button>
      {/each}
    </div>
  </div>

  <SliderWithInput
    label={m.pattern_scale()}
    min={1}
    max={30}
    step={1}
    value={displayScale}
    onchange={handleScaleChange}
  />

  {#if diverging}
    <ColorSelector
      label={m.pattern_color_below_breakpoint()}
      value={divergingColors[0]}
      onchange={(value) => handleDivergingColorChange(0, value)}
    />
    <ColorSelector
      label={m.pattern_color_above_breakpoint()}
      value={divergingColors[1]}
      onchange={(value) => handleDivergingColorChange(1, value)}
    />
  {:else}
    <ColorSelector
      label={m.pattern_color()}
      value={color}
      onchange={handleColorChange}
    />
  {/if}

  <div class="param-block">
    <SimpleRadioGroup
      name="pattern-background"
      legendText={m.background()}
      items={[
        {
          value: 'transparent',
          labelText: m.pattern_background_transparent()
        },
        { value: 'color', labelText: m.pattern_background_color() }
      ]}
      selected={backgroundMode}
      onchange={handleBackgroundModeChange}
    />
    {#if config.background}
      <ColorSelector
        ariaLabel={m.background()}
        value={config.background}
        onchange={handleBackgroundChange}
      />
    {/if}
  </div>
</div>

<style lang="scss">
  .pattern-palette-picker {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-group);
    width: 100%;
  }

  .param-block {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-inline);
  }

  .param-label {
    font-size: 0.75rem;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary);
    font-weight: 400;
  }

  .angle-chips {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .angle-chip {
    min-height: 24px;
    padding: 0 8px 2px;
    font-size: 12px;
    background: #e5f6ff;
    border: 1px solid #82cfff;
    border-radius: 9px;
    cursor: pointer;
    color: #003a6d;

    &:hover {
      background: #cceeff;
    }

    &.active {
      background: #0072c3;
      color: #ffffff;
      border-color: #0072c3;
    }
  }
</style>
