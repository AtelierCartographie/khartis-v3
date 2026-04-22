<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { MagicWandFilled, Checkmark } from 'carbon-icons-svelte';
  import QualitativeColorGrid from './qualitative-color-grid.svelte';
  import {
    PALETTE_TYPE,
    type PaletteType,
    type Palette,
    type SuggestionPreset,
    type QualitativePreset,
    DEFAULT_QUALITATIVE_PRESET,
    getSuggestionPalettes,
    getQualitativeColorGroups,
    getPaletteDisplayName,
    generatePaletteColors,
    generateIntensityShadesForColor,
    buildPatternBackground,
    VIF_MIXTE_COLORS
  } from './palette.constants';

  interface Props {
    paletteType: PaletteType;
    colorBlindFilter: boolean;
    selectedPaletteId: string;
    selectedColor?: string;
    numClasses: number;
    divergingSplit?: import('./palette.constants').DivergingPaletteSplit;
    qualitativeMode?: 'single' | 'categories';
    onTypeChange?: (type: PaletteType) => void;
    onColorBlindChange?: (enabled: boolean) => void;
    onSelect?: (palette: Palette) => void;
    onColorSelect?: (color: string) => void;
    onIntensitySelect?: (color: string) => void;
    onQualitativePresetChange?: (preset: QualitativePreset) => void;
  }

  let {
    paletteType = $bindable(PALETTE_TYPE.SEQUENTIAL),
    colorBlindFilter = $bindable(false),
    selectedPaletteId,
    selectedColor,
    numClasses,
    divergingSplit,
    qualitativeMode = 'single',
    onTypeChange: _onTypeChange,
    onColorBlindChange,
    onSelect,
    onColorSelect,
    onIntensitySelect,
    onQualitativePresetChange
  }: Props = $props();

  const isQualitative = $derived(paletteType === PALETTE_TYPE.QUALITATIVE);
  const isCategoriesQualitative = $derived(
    isQualitative && qualitativeMode === 'categories'
  );

  let sequentialPreset = $state<SuggestionPreset>('monochrome');
  let qualitativePreset = $state<QualitativePreset>(DEFAULT_QUALITATIVE_PRESET);

  const sequentialPalettes = $derived(
    getSuggestionPalettes(sequentialPreset, colorBlindFilter)
  );

  const qualitativeGroups = $derived(
    getQualitativeColorGroups(qualitativePreset, colorBlindFilter)
  );

  const qualitativeSelectedColor = $derived(
    selectedColor ?? VIF_MIXTE_COLORS[0]
  );

  const intensityShades = $derived.by(() => {
    if (isQualitative) {
      return generateIntensityShadesForColor(qualitativeSelectedColor);
    }
    const selected = sequentialPalettes.find((p) => p.id === selectedPaletteId);
    const seedColor = selected?.colors?.[0] ?? '#08519c';
    return generateIntensityShadesForColor(seedColor);
  });

  let selectedIntensityIndex = $state<number>(-1);

  function setSequentialPreset(preset: SuggestionPreset) {
    sequentialPreset = preset;
    const newPalettes = getSuggestionPalettes(preset, colorBlindFilter);
    if (
      !newPalettes.some((p) => p.id === selectedPaletteId) &&
      newPalettes.length > 0
    ) {
      onSelect?.(newPalettes[0]);
    }
  }

  function setQualitativePreset(preset: QualitativePreset) {
    qualitativePreset = preset;
    onQualitativePresetChange?.(preset);
  }

  function toggleColorBlind() {
    colorBlindFilter = !colorBlindFilter;
    onColorBlindChange?.(colorBlindFilter);
  }

  function selectPalette(palette: Palette) {
    onSelect?.(palette);
  }

  function selectQualitativeColor(hex: string) {
    selectedIntensityIndex = -1;
    onColorSelect?.(hex);
  }

  function selectIntensity(index: number, color: string) {
    selectedIntensityIndex = index;
    onIntensitySelect?.(color);
  }
</script>

<div class="palette-suggestions">
  <div class="section-heading">
    <span class="section-heading-text">{m.palette_suggestions()}</span>
    <span class="section-heading-icon">
      <MagicWandFilled size={16} />
    </span>
    <div class="section-heading-line"></div>
  </div>

  {#if isQualitative}
    <div class="filter-tags">
      <button
        type="button"
        class="filter-tag"
        class:selected={qualitativePreset === 'vif'}
        onclick={() => setQualitativePreset('vif')}
      >
        {m.preset_vif()}
      </button>
      <button
        type="button"
        class="filter-tag"
        class:selected={qualitativePreset === 'pastel'}
        onclick={() => setQualitativePreset('pastel')}
      >
        {m.preset_pastel()}
      </button>
      <button
        type="button"
        class="filter-tag"
        class:selected={qualitativePreset === 'sepia'}
        onclick={() => setQualitativePreset('sepia')}
      >
        {m.preset_sepia()}
      </button>
      {#if isCategoriesQualitative}
        <button
          type="button"
          class="filter-tag"
          class:selected={qualitativePreset === 'grayscale'}
          onclick={() => setQualitativePreset('grayscale')}
        >
          {m.preset_grayscale()}
        </button>
      {/if}
      <button
        type="button"
        class="filter-tag filter-tag--toggle"
        class:active={colorBlindFilter}
        onclick={toggleColorBlind}
      >
        {m.preset_colorblind()}
      </button>
    </div>

    <QualitativeColorGrid
      label={m.palette_theme_mixte()}
      colors={qualitativeGroups.mixte}
      selectedColor={qualitativeSelectedColor}
      onColorSelect={selectQualitativeColor}
    />
    <QualitativeColorGrid
      label={m.palette_theme_chaud()}
      colors={qualitativeGroups.chaud}
      selectedColor={qualitativeSelectedColor}
      onColorSelect={selectQualitativeColor}
    />
    <QualitativeColorGrid
      label={m.palette_theme_froid()}
      colors={qualitativeGroups.froid}
      selectedColor={qualitativeSelectedColor}
      onColorSelect={selectQualitativeColor}
    />

    {#if !isCategoriesQualitative}
      <div class="intensity-section">
        <p class="palette-label">{m.palette_intensity()}</p>
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
  {:else}
    <div class="filter-tags">
      <button
        type="button"
        class="filter-tag"
        class:selected={sequentialPreset === 'monochrome'}
        onclick={() => setSequentialPreset('monochrome')}
      >
        {m.preset_monochrome()}
      </button>
      <button
        type="button"
        class="filter-tag"
        class:selected={sequentialPreset === 'bicolor'}
        onclick={() => setSequentialPreset('bicolor')}
      >
        {m.preset_bicolor()}
      </button>
      <button
        type="button"
        class="filter-tag"
        class:selected={sequentialPreset === 'sepia'}
        onclick={() => setSequentialPreset('sepia')}
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

    <div class="palette-list">
      {#each sequentialPalettes as palette (palette.id)}
        <div class="palette-box">
          <p class="palette-label">{getPaletteDisplayName(palette)}</p>
          <button
            type="button"
            class="palette-row"
            class:selected={selectedPaletteId === palette.id}
            onclick={() => selectPalette(palette)}
            aria-label={getPaletteDisplayName(palette)}
            aria-pressed={selectedPaletteId === palette.id}
          >
            {#if palette.type === PALETTE_TYPE.PATTERN}
              <div
                class="swatch-row pattern-row"
                style="background: {buildPatternBackground(palette)}"
              ></div>
            {:else}
              <div class="swatch-row">
                {#each generatePaletteColors(palette, numClasses, colorBlindFilter ? 'high' : undefined, undefined, divergingSplit) as color, i (i)}
                  <div
                    class="swatch-cell"
                    style="background-color: {color}"
                  ></div>
                {/each}
              </div>
            {/if}
            {#if selectedPaletteId === palette.id}
              <div class="check-icon">
                <Checkmark size={20} />
              </div>
            {/if}
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .palette-suggestions {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 24px;
    width: 100%;
  }

  .section-heading-text {
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 600;
    font-size: 14px;
    line-height: 20px;
    letter-spacing: 0.16px;
    color: #003a6d;
    white-space: nowrap;
  }

  .section-heading-icon {
    display: inline-flex;
    align-items: center;
    padding-top: 2px;
    color: #003a6d;
  }

  .section-heading-line {
    flex: 1;
    height: 1px;
    background: var(--cds-border-subtle-01, #c6c6c6);
  }

  .filter-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-content: flex-start;
  }

  .filter-tag {
    padding: 0 8px 2px 8px;
    font-family: 'IBM Plex Sans', sans-serif;
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
      color: #ffffff;
      border-color: #0072c3;
    }

    &.filter-tag--toggle.active {
      background: #003a6d;
      color: #ffffff;
      border-color: #003a6d;
    }
  }

  .palette-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .palette-box {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .palette-label {
    margin: 0;
    padding: 0 0 8px 0;
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 400;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
    width: 100%;
  }

  .palette-row {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 24px;
    padding: 0;
    background: transparent;
    border: 2px solid transparent;
    overflow: hidden;
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
    height: 100%;
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
    color: #ffffff;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
    display: flex;
    align-items: center;
  }

  .intensity-section {
    display: flex;
    flex-direction: column;
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
    color: #ffffff;
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
