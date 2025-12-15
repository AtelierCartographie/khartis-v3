<script lang="ts">
  let { svgElement, ...rest } = $props();

  function myplot(node: HTMLElement) {
    node.appendChild(svgElement);
  }
</script>

{#key svgElement}
  <div class="summary-plot-container" use:myplot {...rest}></div>
{/key}
