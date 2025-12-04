<script lang="ts">
  let { svgElement, ...rest } = $props();

  function myplot(node: HTMLElement) {
    node.appendChild(svgElement);
    const textElements = svgElement.querySelectorAll('text');
    textElements.forEach((text: SVGTextElement) => {
      text.style.fontSize = '9px';
      text.setAttribute('font-size', '9');
      text.removeAttribute('transform');
      text.style.transform = 'none';
    });
  }
</script>

{#key svgElement}
  <div class="summary-plot-container" use:myplot {...rest}></div>
{/key}

<style>
  .summary-plot-container :global(text) {
    font-size: 9px !important;
    transform: none !important;
  }
</style>
