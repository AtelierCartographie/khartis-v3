<script lang="ts">
  import clsx from 'clsx';
  import type {
    SemioType,
    SimplifiedGeometryType
  } from '$lib/features/commons/services/viz-suggester.service';

  interface Props {
    suggestionId: string;
    label: string;
    semioTypes?: SemioType[];
    geometries?: SimplifiedGeometryType[];
  }

  let {
    suggestionId,
    label,
    semioTypes = [],
    geometries = []
  }: Props = $props();

  const kind = $derived.by(() => {
    if (suggestionId.startsWith('lines_')) return 'line';
    if (suggestionId.startsWith('texts_')) return 'text';
    if (geometries.includes('line')) return 'line';
    if (geometries.includes('polygon') && !geometries.includes('point')) {
      return 'polygon';
    }
    return 'symbol';
  });

  const hasProportional = $derived(suggestionId.includes('proportional'));
  const hasDifferentSymbols = $derived(suggestionId.includes('differents'));
  const hasColor = $derived(
    suggestionId.includes('colorful') ||
      suggestionId.includes('choropleth') ||
      semioTypes.some(
        (type) => type === 'QL' || type === 'QLO' || type === 'QTR'
      )
  );
  const isDouble = $derived(
    suggestionId.includes('double') || semioTypes.length > 1
  );
  const previewClasses = $derived(
    clsx(
      'viz-preview',
      'visualization-suggestion-preview',
      `viz-preview--${kind}`,
      {
        'viz-preview--color': hasColor,
        'viz-preview--proportional': hasProportional,
        'viz-preview--double': isDouble
      }
    )
  );
</script>

<svg
  class={previewClasses}
  viewBox="0 0 120 120"
  role="img"
  aria-label={label}
  preserveAspectRatio="xMidYMid meet"
>
  <rect class="preview-background" x="0" y="0" width="120" height="120" />

  <g class="preview-map" aria-hidden="true">
    <path d="M18 27 L55 20 L94 34 L102 70 L70 98 L26 88 Z" />
    <path d="M20 61 L54 54 L84 65 L100 83" />
    <path d="M47 22 L42 88" />
    <path d="M75 29 L70 98" />
  </g>

  {#if kind === 'polygon'}
    <g class="polygon-layer" aria-hidden="true">
      <path class="fill-a" d="M20 29 L48 24 L43 56 L20 60 Z" />
      <path class="fill-b" d="M49 24 L76 29 L70 59 L44 56 Z" />
      <path class="fill-c" d="M77 30 L96 39 L98 70 L71 59 Z" />
      <path class="fill-d" d="M20 61 L43 57 L39 87 L27 84 Z" />
      <path class="fill-e" d="M44 57 L70 60 L67 94 L40 87 Z" />
      <path class="fill-f" d="M71 61 L98 72 L70 96 L68 94 Z" />
    </g>
  {:else if kind === 'line'}
    <g class="line-layer" aria-hidden="true">
      <path class="route route-a" d="M18 83 C37 49 57 79 79 36" />
      <path class="route route-b" d="M24 37 C43 65 62 46 96 73" />
      <path class="route route-c" d="M36 95 C54 68 71 76 93 48" />
    </g>
  {:else if kind === 'text'}
    <g class="text-layer" aria-hidden="true">
      <text class="label-a" x="30" y="42">A</text>
      <text class="label-b" x="66" y="67">B</text>
      <text class="label-c" x="45" y="91">C</text>
    </g>
  {:else}
    <g class="symbol-layer" aria-hidden="true">
      {#if hasDifferentSymbols}
        <path class="symbol symbol-a" d="M34 31 L44 49 H24 Z" />
        <rect class="symbol symbol-b" x="69" y="34" width="18" height="18" />
        <circle class="symbol symbol-c" cx="46" cy="78" r="11" />
      {:else}
        <circle
          class="symbol symbol-a"
          cx="34"
          cy="38"
          r={hasProportional ? 8 : 6}
        />
        <circle
          class="symbol symbol-b"
          cx="78"
          cy="48"
          r={hasProportional ? 16 : 6}
        />
        <circle
          class="symbol symbol-c"
          cx="51"
          cy="83"
          r={hasProportional ? 12 : 6}
        />
      {/if}
    </g>
  {/if}

  {#if isDouble}
    <g class="second-variable" aria-hidden="true">
      <circle cx="90" cy="32" r="7" />
      <circle cx="95" cy="88" r="5" />
    </g>
  {/if}
</svg>

<style>
  .viz-preview {
    display: block;
    width: 100%;
    height: 100%;
    background: #ffffff;
  }

  .preview-background {
    fill: #ffffff;
  }

  .preview-map path {
    fill: none;
    stroke: #d0e2ff;
    stroke-width: 2;
  }

  .polygon-layer path {
    stroke: #ffffff;
    stroke-width: 2;
  }

  .fill-a {
    fill: #edf5ff;
  }

  .fill-b {
    fill: #d0e2ff;
  }

  .fill-c {
    fill: #a6c8ff;
  }

  .fill-d {
    fill: #78a9ff;
  }

  .fill-e {
    fill: #4589ff;
  }

  .fill-f {
    fill: #0f62fe;
  }

  .viz-preview:not(.viz-preview--color) .polygon-layer path {
    fill: #d0e2ff;
  }

  .route {
    fill: none;
    stroke-linecap: round;
  }

  .route-a {
    stroke: #0f62fe;
    stroke-width: 8;
  }

  .route-b {
    stroke: #24a148;
    stroke-width: 5;
  }

  .route-c {
    stroke: #ff832b;
    stroke-width: 3;
  }

  .viz-preview:not(.viz-preview--color) .route {
    stroke: #0f62fe;
  }

  .symbol {
    stroke: #ffffff;
    stroke-width: 2;
  }

  .symbol-a {
    fill: #0f62fe;
  }

  .symbol-b {
    fill: #24a148;
  }

  .symbol-c {
    fill: #ff832b;
  }

  .viz-preview:not(.viz-preview--color) .symbol {
    fill: #0f62fe;
  }

  .text-layer text {
    font-family:
      IBM Plex Sans,
      Arial,
      sans-serif;
    font-weight: 600;
    fill: #0f62fe;
  }

  .label-a {
    font-size: 20px;
  }

  .label-b {
    font-size: 28px;
  }

  .label-c {
    font-size: 16px;
  }

  .second-variable circle {
    fill: none;
    stroke: #8a3ffc;
    stroke-width: 3;
  }
</style>
