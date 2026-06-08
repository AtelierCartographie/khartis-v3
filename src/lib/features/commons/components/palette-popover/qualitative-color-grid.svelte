<script lang="ts">
  import { Checkmark } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    label: string;
    colors: readonly string[];
    selectedColor?: string;
    onColorSelect?: (hex: string) => void;
    onPaletteSelect?: (colors: string[]) => void;
  }

  let { label, colors, selectedColor, onColorSelect, onPaletteSelect }: Props =
    $props();
</script>

<div class="qualitative-grid">
  <div class="grid-header">
    <p class="grid-label">{label}</p>
    {#if onPaletteSelect}
      <button
        type="button"
        class="apply-palette-button"
        onclick={() => onPaletteSelect?.([...colors])}
      >
        {m.apply_palette()}
      </button>
    {/if}
  </div>
  <div class="color-row" role="radiogroup" aria-label={label}>
    {#each colors as color (color)}
      <button
        type="button"
        class="color-cell"
        class:selected={selectedColor === color}
        style="background-color: {color}"
        role="radio"
        aria-checked={selectedColor === color}
        aria-label={color}
        onclick={() => onColorSelect?.(color)}
      >
        {#if selectedColor === color}
          <div class="check-icon">
            <Checkmark size={20} />
          </div>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style lang="scss">
  .qualitative-grid {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .grid-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 0 8px 0;
  }

  .grid-label {
    margin: 0;
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 400;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
  }

  .apply-palette-button {
    flex-shrink: 0;
    padding: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 400;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-link-primary, #0f62fe);

    &:hover {
      text-decoration: underline;
    }

    &:focus-visible {
      outline: 2px solid var(--cds-focus, #0f62fe);
      outline-offset: 2px;
    }
  }

  .color-row {
    display: flex;
    width: 100%;
    height: 32px;
    gap: 4px;
    overflow: hidden;
  }

  .color-cell {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 2px solid transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.15s ease;

    &:hover {
      border-color: var(--cds-border-strong);
    }

    &.selected {
      border-color: #012749;
    }
  }

  .check-icon {
    color: #ffffff;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
