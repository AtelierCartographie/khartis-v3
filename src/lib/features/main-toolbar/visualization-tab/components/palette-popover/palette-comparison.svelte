<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { PALETTE_TYPE, type PaletteType } from './palette.constants';

  interface Props {
    currentColors: string[];
    newColors: string[];
    paletteType?: PaletteType;
  }

  let {
    currentColors,
    newColors,
    paletteType = PALETTE_TYPE.SEQUENTIAL
  }: Props = $props();

  const isQualitative = $derived(paletteType === PALETTE_TYPE.QUALITATIVE);

  const currentPrimary = $derived(currentColors[0] ?? '#f287ac');
  const newPrimary = $derived(newColors[0] ?? currentPrimary);
</script>

<div class="palette-comparison" class:side-by-side={isQualitative}>
  {#if isQualitative}
    <div class="comparison-column">
      <span class="comparison-label">{m.palette_current()}</span>
      <div
        class="solid-swatch"
        style="background-color: {currentPrimary}"
      ></div>
    </div>
    <div class="comparison-column">
      <span class="comparison-label">{m.palette_new()}</span>
      <div class="solid-swatch" style="background-color: {newPrimary}"></div>
    </div>
  {:else}
    <div class="comparison-box">
      <span class="comparison-label">{m.palette_current()}</span>
      <div class="swatch-row">
        {#each currentColors as color, i (i)}
          <div class="swatch-cell" style="background-color: {color}"></div>
        {/each}
      </div>
    </div>
    <div class="comparison-box">
      <span class="comparison-label">{m.palette_new()}</span>
      <div class="swatch-row">
        {#each newColors as color, i (i)}
          <div class="swatch-cell" style="background-color: {color}"></div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style lang="scss">
  .palette-comparison {
    display: flex;
    flex-direction: column;
    gap: 1px;
    width: 100%;

    &.side-by-side {
      flex-direction: row;
      gap: 1px;
      align-items: stretch;
    }
  }

  .comparison-box {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .comparison-column {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .comparison-label {
    padding: 0 0 8px 0;
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 400;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
  }

  .swatch-row {
    display: flex;
    width: 100%;
    height: 18px;
    overflow: hidden;
  }

  .swatch-cell {
    flex: 1;
    height: 100%;
  }

  .solid-swatch {
    width: 100%;
    height: 32px;
  }
</style>
