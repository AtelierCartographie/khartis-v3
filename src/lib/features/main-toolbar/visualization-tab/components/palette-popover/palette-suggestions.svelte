<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Tag } from 'carbon-components-svelte';
  import { PaintBrush, Checkmark } from 'carbon-icons-svelte';
  import {
    PALETTE_TYPE,
    type PaletteType,
    type Palette,
    getPalettesForType,
    interpolateColors,
    buildPatternBackground
  } from './palette.constants';

  interface Props {
    paletteType: PaletteType;
    colorBlindFilter: boolean;
    selectedPaletteId: string;
    numClasses: number;
    onTypeChange?: (type: PaletteType) => void;
    onColorBlindChange?: (enabled: boolean) => void;
    onSelect?: (palette: Palette) => void;
  }

  let {
    paletteType = $bindable(PALETTE_TYPE.SEQUENTIAL),
    colorBlindFilter = $bindable(false),
    selectedPaletteId,
    numClasses,
    onTypeChange,
    onColorBlindChange,
    onSelect
  }: Props = $props();

  const palettes = $derived(getPalettesForType(paletteType, colorBlindFilter));

  function setType(type: PaletteType) {
    paletteType = type;
    onTypeChange?.(type);
  }

  function toggleColorBlind() {
    colorBlindFilter = !colorBlindFilter;
    onColorBlindChange?.(colorBlindFilter);
  }

  function selectPalette(palette: Palette) {
    onSelect?.(palette);
  }
</script>

<div class="palette-suggestions">
  <div class="section-title">
    <PaintBrush size={16} />
    <span>{m.palette_suggestions()}</span>
  </div>

  <div class="filter-tags">
    <Tag
      on:click={() => setType(PALETTE_TYPE.SEQUENTIAL)}
      type={paletteType === PALETTE_TYPE.SEQUENTIAL ? 'blue' : undefined}
      size="sm"
    >
      {m.palette_sequential()}
    </Tag>
    <Tag
      on:click={() => setType(PALETTE_TYPE.DIVERGING)}
      type={paletteType === PALETTE_TYPE.DIVERGING ? 'blue' : undefined}
      size="sm"
    >
      {m.palette_diverging()}
    </Tag>
    <Tag
      on:click={() => setType(PALETTE_TYPE.QUALITATIVE)}
      type={paletteType === PALETTE_TYPE.QUALITATIVE ? 'blue' : undefined}
      size="sm"
    >
      {m.palette_qualitative()}
    </Tag>
    <Tag
      on:click={toggleColorBlind}
      type={colorBlindFilter ? 'blue' : undefined}
      size="sm"
    >
      {m.colorblind_simulation()}
    </Tag>
  </div>

  <div class="palette-grid">
    {#each palettes as palette (palette.id)}
      <button
        type="button"
        class="palette-row"
        class:selected={selectedPaletteId === palette.id}
        onclick={() => selectPalette(palette)}
        aria-label={palette.name}
        aria-pressed={selectedPaletteId === palette.id}
      >
        {#if palette.type === PALETTE_TYPE.PATTERN}
          <div
            class="swatch-row pattern-row"
            style="background: {buildPatternBackground(palette)}"
          ></div>
        {:else}
          <div class="swatch-row">
            {#each interpolateColors(palette.colors, numClasses) as color, i (i)}
              <div class="swatch-cell" style="background-color: {color}"></div>
            {/each}
          </div>
        {/if}
        {#if selectedPaletteId === palette.id}
          <div class="check-icon">
            <Checkmark size={16} />
          </div>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style lang="scss">
  .palette-suggestions {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-primary);
  }

  .filter-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cds-spacing-02);
  }

  .palette-grid {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .palette-row {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    padding: var(--cds-spacing-02);
    background: transparent;
    border: 2px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    transition: border-color 0.15s ease;

    &:hover {
      border-color: var(--cds-border-strong);
    }

    &.selected {
      border-color: var(--cds-interactive);
    }
  }

  .swatch-row {
    display: flex;
    flex: 1;
    height: 24px;
    border-radius: 2px;
    overflow: hidden;
  }

  .pattern-row {
    background-size:
      auto,
      8px 8px,
      auto;
  }

  .swatch-cell {
    flex: 1;
    height: 100%;
  }

  .check-icon {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    color: white;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
    display: flex;
    align-items: center;
  }
</style>
