<script lang="ts">
  import * as m from '$lib/paraglide/messages';

  interface Props {
    currentColors: string[];
    newColors: string[];
  }

  let { currentColors, newColors }: Props = $props();
</script>

<div class="palette-comparison">
  <span class="comparison-label">{m.palette_current()}</span>
  <div class="swatch-rows">
    <div class="swatch-row">
      {#each currentColors as color, i (i)}
        <div class="swatch-cell" style="background-color: {color}"></div>
      {/each}
    </div>
    <div class="swatch-row">
      {#each newColors as color, i (i)}
        <div class="swatch-cell" style="background-color: {color}"></div>
      {/each}
    </div>
  </div>
  <span class="comparison-label">{m.palette_new()}</span>
</div>

<style lang="scss">
  .palette-comparison {
    display: flex;
    flex-direction: column;
    padding-top: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .comparison-label {
    font-size: 0.75rem;
    color: var(--cds-text-secondary);
    font-weight: 400;

    &:first-child {
      padding-bottom: 8px;
    }

    &:last-child {
      padding-top: 8px;
    }
  }

  .swatch-rows {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .swatch-row {
    display: flex;
    height: 16px;
    overflow: hidden;
  }

  .swatch-cell {
    flex: 1;
    height: 100%;
  }
</style>
