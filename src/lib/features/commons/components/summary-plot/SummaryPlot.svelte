<script lang="ts">
  let { svgElement, ...rest } = $props();

  function myplot(node: HTMLElement) {
    node.appendChild(svgElement);
  }
</script>

{#key svgElement}
  <div class="summary-plot-container" use:myplot {...rest}></div>
{/key}

<style>
  .summary-plot-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .summary-plot-container :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
