<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { MagicWandFilled, Checkmark } from 'carbon-icons-svelte';
  import {
    PALETTE_TYPE,
    type PaletteType,
    type Palette,
    type SuggestionPreset,
    getSuggestionPalettes,
    generatePaletteColors,
    generateIntensityShades,
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
    onIntensitySelect?: (color: string) => void;
  }

  let {
    paletteType = $bindable(PALETTE_TYPE.SEQUENTIAL),
    colorBlindFilter = $bindable(false),
    selectedPaletteId,
    numClasses,
    onTypeChange: _onTypeChange,
    onColorBlindChange,
    onSelect,
    onIntensitySelect
  }: Props = $props();

  let activePreset = $state<SuggestionPreset>('monochrome');
  let selectedIntensityIndex = $state(3); // center = original color

  const palettes = $derived(
    getSuggestionPalettes(activePreset, colorBlindFilter)
  );

  function setPreset(preset: SuggestionPreset) {
    activePreset = preset;
    // Auto-select first palette if current selection isn't in the new preset
    const newPalettes = getSuggestionPalettes(preset, colorBlindFilter);
    if (
      !newPalettes.some((p) => p.id === selectedPaletteId) &&
      newPalettes.length > 0
    ) {
      onSelect?.(newPalettes[0]);
    }
  }

  function toggleColorBlind() {
    colorBlindFilter = !colorBlindFilter;
    onColorBlindChange?.(colorBlindFilter);
  }

  function selectPalette(palette: Palette) {
    onSelect?.(palette);
  }

  /** Intensity shades: 7 variations of the first color of the selected palette */
  const intensityShades = $derived.by(() => {
    const selected = palettes.find((p) => p.id === selectedPaletteId);
    const seedColor = selected?.colors?.[0] ?? '#08519c';
    return generateIntensityShades(seedColor);
  });

  function selectIntensity(index: number, color: string) {
    selectedIntensityIndex = index;
    onIntensitySelect?.(color);
  }
</script>

<div class="palette-suggestions">
  <div class="section-title">
    <MagicWandFilled size={16} />
    <span class="section-title-text">{m.palette_suggestions()}</span>
    <div class="section-title-line"></div>
  </div>

  <div class="filter-tags">
    <button
      type="button"
      class="filter-tag"
      class:selected={activePreset === 'monochrome'}
      onclick={() => setPreset('monochrome')}
    >
      {m.preset_monochrome()}
    </button>
    <button
      type="button"
      class="filter-tag"
      class:selected={activePreset === 'bicolor'}
      onclick={() => setPreset('bicolor')}
    >
      {m.preset_bicolor()}
    </button>
    <button
      type="button"
      class="filter-tag"
      class:selected={activePreset === 'sepia'}
      onclick={() => setPreset('sepia')}
    >
      {m.preset_sepia()}
    </button>
    <button
      type="button"
      class="filter-tag filter-tag--toggle"
      class:active={colorBlindFilter}
      onclick={toggleColorBlind}
    >
      {m.preset_colorblind()}
    </button>
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
            {#each generatePaletteColors(palette, numClasses, colorBlindFilter ? 'high' : undefined) as color, i (i)}
              <div class="swatch-cell" style="background-color: {color}"></div>
            {/each}
          </div>
        {/if}
        {#if selectedPaletteId === palette.id}
          <div class="check-icon">
            <Checkmark size={20} />
          </div>
        {/if}
      </button>
    {/each}
  </div>

  {#if intensityShades.length > 0}
    <div class="intensity-section">
      <p class="intensity-label">{m.palette_intensity()}</p>
      <div class="intensity-row">
        {#each intensityShades as shade, i (i)}
          <button
            type="button"
            class="intensity-cell"
            class:selected={selectedIntensityIndex === i}
            style="background-color: {shade}"
            onclick={() => selectIntensity(i, shade)}
            aria-label="{m.palette_intensity()} {i + 1}"
          >
            {#if selectedIntensityIndex === i}
              <Checkmark size={20} />
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style lang="scss">
  .palette-suggestions {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    color: #003a6d;
  }

  .section-title-text {
    font-size: 0.875rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .section-title-line {
    flex: 1;
    height: 1px;
    background: var(--cds-border-subtle);
  }

  .filter-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .filter-tag {
    padding: 2px 8px;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
    border-radius: 9px;
    cursor: pointer;
    background: #e5f6ff;
    border: 1px solid #82cfff;
    color: #003a6d;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;

    &:hover {
      background: #cceeff;
    }

    &.selected {
      background: #0072c3;
      color: white;
      border-color: #0072c3;
    }

    &.filter-tag--toggle.active {
      background: #003a6d;
      color: white;
      border-color: #003a6d;
    }
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
    padding: 0;
    background: transparent;
    border: 2px solid transparent;
    cursor: pointer;
    transition: border-color 0.15s ease;

    &:hover {
      border-color: var(--cds-border-strong);
    }

    &.selected {
      border-color: #012749;
    }
  }

  .swatch-row {
    display: flex;
    width: 100%;
    height: 24px;
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
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    color: white;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
    display: flex;
    align-items: center;
  }

  .intensity-section {
    display: flex;
    flex-direction: column;
  }

  .intensity-label {
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
    padding-bottom: 8px;
  }

  .intensity-row {
    display: flex;
    height: 32px;
    overflow: hidden;
  }

  .intensity-cell {
    flex: 1;
    height: 100%;
    border: 2px solid transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    padding: 0;
    transition: border-color 0.15s ease;

    &:hover {
      border-color: var(--cds-border-strong);
    }

    &.selected {
      border-color: #012749;
    }

    :global(svg) {
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
    }
  }
</style>
