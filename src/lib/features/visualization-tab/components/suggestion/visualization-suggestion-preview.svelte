<script lang="ts">
  import type { VizSuggestion } from '$lib/features/commons/services/viz-suggester.service';
  import {
    buildVizPreview,
    VIZ_PREVIEW_SIZE
  } from '../../utils/viz-preview.utils';

  interface Props {
    suggestion: VizSuggestion;
  }

  let { suggestion }: Props = $props();

  const shapes = $derived(buildVizPreview(suggestion));
</script>

<svg
  class="visualization-suggestion-preview"
  viewBox="0 0 {VIZ_PREVIEW_SIZE} {VIZ_PREVIEW_SIZE}"
  preserveAspectRatio="xMidYMid meet"
  aria-hidden="true"
  focusable="false"
>
  {#each shapes as shape, index (index)}
    {#if shape.kind === 'rect'}
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        fill={shape.fill}
        opacity={shape.opacity}
        shape-rendering="crispEdges"
      />
    {:else if shape.kind === 'path'}
      <path
        d={shape.d}
        fill={shape.fill}
        stroke={shape.stroke}
        stroke-width={shape.strokeWidth}
        opacity={shape.opacity}
      />
    {:else if shape.kind === 'circle'}
      <circle
        cx={shape.cx}
        cy={shape.cy}
        r={shape.r}
        fill={shape.fill}
        stroke={shape.stroke}
        stroke-width={shape.strokeWidth}
      />
    {:else}
      <text
        x={shape.x}
        y={shape.y}
        font-size={shape.fontSize}
        fill={shape.fill}
        stroke={shape.halo}
        stroke-width="3"
        text-anchor="middle"
        paint-order="stroke"
        stroke-linejoin="round">{shape.value}</text
      >
    {/if}
  {/each}
</svg>

<style>
  .visualization-suggestion-preview {
    --kh-preview-canvas: var(--khartis-additions-layer-02-suggestions, #ffffff);
    --kh-preview-neutral: #e4e7ea;
    --kh-preview-seam: #ffffff;
    --kh-preview-ink: #161616;
    --kh-preview-tick: var(
      --khartis-additions-text-secondary-suggestions,
      #00539a
    );
    display: block;
    width: 100%;
    height: 100%;
    background: var(--kh-preview-canvas);
  }

  :global(html[theme='g100']) .visualization-suggestion-preview {
    --kh-preview-neutral: #0a3560;
    --kh-preview-seam: #012749;
    --kh-preview-ink: #f4f4f4;
  }

  .visualization-suggestion-preview text {
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 600;
  }
</style>
