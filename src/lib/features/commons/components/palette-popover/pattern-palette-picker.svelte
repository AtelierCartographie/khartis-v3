<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import {
    ColorSelector,
    SliderWithInput
  } from '$lib/features/commons/components/viz-controls';
  import type {
    PatternPaletteConfig,
    PatternShape
  } from '$lib/features/commons/constants/pattern.constants';
  import ShapeChipRow from './shape-chip-row.svelte';

  interface Props {
    config: PatternPaletteConfig;
    onchange: (config: PatternPaletteConfig) => void;
  }

  let { config, onchange }: Props = $props();

  const DEFAULT_ANGLE = 45;
  const DEFAULT_SCALE = 1;
  const DEFAULT_COLOR = '#000000';

  const ANGLE_OPTIONS = [0, 45, 90, 135] as const;

  const angle = $derived(config.angle ?? DEFAULT_ANGLE);
  const scale = $derived(config.scale ?? DEFAULT_SCALE);
  const displayScale = $derived(Math.round(scale * 10));
  const color = $derived(config.color ?? DEFAULT_COLOR);

  function handleShapeSelect(shape: PatternShape) {
    onchange({ ...config, shape });
  }

  function handleAngleSelect(nextAngle: (typeof ANGLE_OPTIONS)[number]) {
    onchange({ ...config, angle: nextAngle });
  }

  function handleScaleChange(value: number) {
    onchange({ ...config, scale: value / 10 });
  }

  function handleColorChange(value: string) {
    onchange({ ...config, color: value });
  }
</script>

<div class="pattern-palette-picker">
  <div class="param-block">
    <span class="param-label">{m.pattern_shape()}</span>
    <ShapeChipRow value={config.shape} onselect={handleShapeSelect} />
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

  <ColorSelector label={m.color()} value={color} onchange={handleColorChange} />
</div>

<style lang="scss">
  .pattern-palette-picker {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
  }

  .param-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
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
