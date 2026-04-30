<script lang="ts">
  interface Props {
    markup: string;
    width: number;
    height: number;
    ariaLabel?: string;
    decorative?: boolean;
    class?: string;
    textColor?: string;
  }

  let {
    markup,
    width,
    height,
    ariaLabel,
    decorative = true,
    class: className = '',
    textColor
  }: Props = $props();
</script>

<svg
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
</style>
