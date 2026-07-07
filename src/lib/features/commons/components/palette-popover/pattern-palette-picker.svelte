<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import {
    ColorSelector,
    SliderWithInput
  } from '$lib/features/commons/components/viz-controls';
  import {
    PATTERN_SHAPES,
    type PatternPaletteConfig,
    type PatternShape
  } from '$lib/features/commons/constants/pattern.constants';
  import { buildShapeSwatchBackground } from './palette.constants';

  interface Props {
    config: PatternPaletteConfig;
    onchange: (config: PatternPaletteConfig) => void;
  }

  let { config, onchange }: Props = $props();

  const DEFAULT_ANGLE = 45;
  const DEFAULT_SCALE = 3;
  const DEFAULT_COLOR = '#000000';

  const ANGLE_OPTIONS = [0, 45, 90, 135] as const;

  const shapeLabels: Record<PatternShape, string> = {
    line: m.pattern_shape_line(),
    circle: m.pattern_shape_circle(),
    plaid: m.pattern_shape_plaid(),
    triangle: m.pattern_shape_triangle(),
    square: m.pattern_shape_square(),
    diamond: m.pattern_shape_diamond(),
    plus: m.pattern_shape_plus(),
    cross: m.pattern_shape_cross()
  };

  const angle = $derived(config.angle ?? DEFAULT_ANGLE);
  const scale = $derived(config.scale ?? DEFAULT_SCALE);
  const color = $derived(config.color ?? DEFAULT_COLOR);

  function handleShapeSelect(shape: PatternShape) {
    onchange({ ...config, shape });
  }

  function handleAngleSelect(nextAngle: (typeof ANGLE_OPTIONS)[number]) {
    onchange({ ...config, angle: nextAngle });
  }

  function handleScaleChange(value: number) {
    onchange({ ...config, scale: value });
  }

  function handleColorChange(value: string) {
    onchange({ ...config, color: value });
  }
</script>

<div class="pattern-palette-picker">
  <div class="param-block">
    <span class="param-label">{m.pattern_shape()}</span>
    <div class="shape-chips">
      {#each PATTERN_SHAPES as shape (shape)}
        <button
          type="button"
          class="shape-chip"
          class:active={config.shape === shape}
          aria-label={shapeLabels[shape]}
          aria-pressed={config.shape === shape}
          onclick={() => handleShapeSelect(shape)}
        >
          <span
            class="shape-swatch"
            style="background: {buildShapeSwatchBackground(shape)}"
          ></span>
        </button>
      {/each}
    </div>
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
    max={8}
    value={scale}
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

  .shape-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .shape-chip {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: var(--cds-field-01, #f4f4f4);
    border: 1px solid var(--cds-border-subtle-01, #c6c6c6);
    cursor: pointer;

    &:hover {
      background: var(--cds-field-hover-01, #e8e8e8);
    }

    &.active {
      outline: 1px solid #012749;
      outline-offset: -1px;
    }
  }

  .shape-swatch {
    width: 20px;
    height: 20px;
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
