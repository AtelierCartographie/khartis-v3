<script lang="ts">
  import * as m from '$lib/paraglide/messages';

  interface Props {
    currentColors: string[];
    newColors: string[];
  }

  let { currentColors, newColors }: Props = $props();
</script>

<div class="palette-comparison">
  <div class="comparison-row">
    <span class="comparison-label">{m.palette_current()}</span>
    <div class="swatch-row">
      {#each currentColors as color, i (i)}
        <div class="swatch-cell" style="background-color: {color}"></div>
      {/each}
    </div>
  </div>
  <div class="comparison-row">
    <span class="comparison-label">{m.palette_new()}</span>
    <div class="swatch-row">
      {#each newColors as color, i (i)}
        <div class="swatch-cell" style="background-color: {color}"></div>
      {/each}
    </div>
  </div>
</div>

<style lang="scss">
  .palette-comparison {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    padding-top: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .comparison-row {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .comparison-label {
    font-size: 0.75rem;
    color: var(--cds-text-secondary);
    font-weight: 400;
  }

  .swatch-row {
    display: flex;
    height: 20px;
    border-radius: 2px;
    overflow: hidden;
  }

  .swatch-cell {
    flex: 1;
    height: 100%;
  }
</style>
