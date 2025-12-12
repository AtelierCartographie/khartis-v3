<script lang="ts">
  let { svgElement, ...rest } = $props();

  function myplot(node: HTMLElement) {
    node.appendChild(svgElement);

    const svg = node.querySelector('svg');
    if (svg) {
      svg.style.pointerEvents = 'auto';
      svg.style.touchAction = 'none';
    }
  }
</script>

{#key svgElement}
  <div class="summary-plot-container" use:myplot {...rest}></div>
{/key}

<style>
  .summary-plot-container {
    overflow: visible;
    position: relative;
    pointer-events: auto;
    isolation: isolate;
  }

  .summary-plot-container :global(svg) {
    pointer-events: auto;
    touch-action: none;
  }

  .summary-plot-container :global(rect),
  .summary-plot-container :global(path) {
    pointer-events: all;
  }
</style>
