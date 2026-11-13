<script lang="ts">
  import { ShapeType } from '$lib/features/commons/constants/visualization.constants';
  import { PrimitiveFilterType } from '$lib/features/commons/stores/visualization.store.svelte';
  import type { TooltipGlyph } from '../types';

  interface Props {
    glyph: TooltipGlyph;
  }

  let { glyph }: Props = $props();

  const NEUTRAL = 'var(--cds-icon-secondary, #6f6f6f)';
  const SIZE = 10;

  const color = $derived(glyph.color ?? NEUTRAL);
  // A color, or a size drawn in a single color, reads as a fill; a size
  // whose color another variable carries reads as an outline.
  const isFilled = $derived(
    glyph.channel === 'color' || (glyph.channel === 'size' && !!glyph.color)
  );
  const fill = $derived(isFilled ? color : 'none');
  const stroke = $derived(isFilled ? 'none' : (glyph.outline ?? color));

  function symbolPath(shape: ShapeType | undefined): string {
    switch (shape) {
      case ShapeType.SQUARE:
        return 'M1.5 1.5h7v7h-7z';
      case ShapeType.BAR:
        return 'M3.5 1h3v8h-3z';
      case ShapeType.RECTANGLE:
        return 'M1 3h8v4H1z';
      case ShapeType.SPIKE:
        return 'M5 0.5 7 9.5H3z';
      case ShapeType.TRIANGLE:
        return 'M5 1 9 9H1z';
      case ShapeType.DIAMOND:
        return 'M5 0.5 9.5 5 5 9.5 0.5 5z';
      case ShapeType.CROSS:
        return 'M3.5 0.5h3v3h3v3h-3v3h-3v-3h-3v-3h3z';
      case ShapeType.STAR:
        return 'M5 0.5 6.3 3.6 9.6 3.8 7.1 6 7.9 9.3 5 7.5 2.1 9.3 2.9 6 0.4 3.8 3.7 3.6z';
      default:
        return 'M5 1a4 4 0 1 1 0 8a4 4 0 1 1 0-8z';
    }
  }
</script>

<svg
  class="tooltip-glyph"
  width={SIZE}
  height={SIZE}
  viewBox="0 0 10 10"
  aria-hidden="true"
>
  {#if glyph.primitive === PrimitiveFilterType.TEXT}
    <text
      x="5"
      y="9"
      text-anchor="middle"
      font-size="11"
      font-weight="700"
      fill={color}>T</text
    >
  {:else if glyph.primitive === PrimitiveFilterType.LINE}
    <path
      d="M0.5 5h9"
      stroke={color}
      stroke-width={glyph.channel === 'size' ? 3.5 : 2}
      fill="none"
    />
  {:else if glyph.primitive === PrimitiveFilterType.POLYGON}
    <path
      d="M1 1h8v8H1z"
      fill={glyph.channel === 'stroke' ? 'none' : color}
      stroke={glyph.channel === 'stroke' ? color : 'rgba(22, 22, 22, 0.25)'}
      stroke-width={glyph.channel === 'stroke' ? 1.5 : 0.5}
    />
  {:else}
    <path
      d={symbolPath(glyph.shape)}
      fill={fill}
      stroke={stroke}
      stroke-width={isFilled ? 0 : 1.2}
    />
  {/if}
</svg>

<style>
  .tooltip-glyph {
    flex: 0 0 auto;
    overflow: visible;
  }
</style>
