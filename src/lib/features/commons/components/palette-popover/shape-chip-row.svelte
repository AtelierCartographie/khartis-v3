<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import {
    PATTERN_SHAPES,
    type PatternShape
  } from '$lib/features/commons/constants/pattern.constants';
  import { buildShapeSwatchBackground } from './palette.constants';

  interface Props {
    value?: PatternShape;
    onselect: (shape: PatternShape) => void;
  }

  let { value, onselect }: Props = $props();

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
</script>

<div class="shape-chips">
  {#each PATTERN_SHAPES as shape (shape)}
    <button
      type="button"
      class="shape-chip"
      class:active={value === shape}
      aria-label={shapeLabels[shape]}
      aria-pressed={value === shape}
      onclick={() => onselect(shape)}
    >
      <span
        class="shape-swatch"
        style="background: {buildShapeSwatchBackground(shape)}"
      ></span>
    </button>
  {/each}
</div>

<style lang="scss">
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
</style>
