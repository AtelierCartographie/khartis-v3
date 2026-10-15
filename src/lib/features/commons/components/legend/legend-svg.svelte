<script lang="ts">
  import { LEGEND_ENTRY_ATTRIBUTE } from './utils';

  interface Props {
    markup: string;
    width: number;
    height: number;
    ariaLabel?: string;
    decorative?: boolean;
    class?: string;
    textColor?: string;
    /** Entry of the hovered map feature: the other entries step back. */
    activeEntry?: string | null;
  }

  let {
    markup,
    width,
    height,
    ariaLabel,
    decorative = true,
    class: className = '',
    textColor,
    activeEntry = null
  }: Props = $props();

  let svgElement = $state<SVGSVGElement | null>(null);

  // The markup is static, so the entries are toggled in place rather than
  // redrawn: hovering costs no legend layout. Nothing steps back when the
  // feature has no entry of its own here.
  $effect(() => {
    void markup;
    const entries = svgElement?.querySelectorAll<SVGElement>(
      `[${LEGEND_ENTRY_ATTRIBUTE}]`
    );
    if (!entries) {
      return;
    }
    const hasMatch =
      activeEntry !== null &&
      Array.from(entries).some(
        (entry) => entry.getAttribute(LEGEND_ENTRY_ATTRIBUTE) === activeEntry
      );
    for (const entry of entries) {
      entry.classList.toggle(
        'legend-entry--receded',
        hasMatch && entry.getAttribute(LEGEND_ENTRY_ATTRIBUTE) !== activeEntry
      );
    }
  });
</script>

<svg
  bind:this={svgElement}
  class="legend-svg {className}"
  viewBox={`0 0 ${width} ${height}`}
  width={width}
  height={height}
  role={decorative ? undefined : 'img'}
  aria-label={decorative ? undefined : ariaLabel}
  aria-hidden={decorative ? 'true' : undefined}
  focusable="false"
  fill="currentColor"
  style:color={textColor}
>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- Markup is produced by escaped legend generators. -->
  {@html markup}
</svg>

<style>
  .legend-svg {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 0;
    overflow: visible;
    color: inherit;
    font-family: inherit;
  }

  :global(.legend-svg text) {
    fill: currentColor;
  }

  :global(.legend-svg .legend-entry--receded) {
    opacity: 0.25;
  }
</style>
