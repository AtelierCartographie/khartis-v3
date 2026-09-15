<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { MagicWandFilled, Checkmark } from 'carbon-icons-svelte';
  import QualitativeColorGrid from './qualitative-color-grid.svelte';
  import {
    PALETTE_TYPE,
    type DivergingPaletteSplit,
    type PaletteType,
    type Palette,
    type SuggestionPreset,
    type QualitativePreset,
    getSuggestionPresetsForType,
    getSuggestionPresetLabel,
    getSuggestionPalettes,
    getQualitativeColorBands,
    resolveQualitativeGeneratorPreset,
    getPaletteDisplayName,
    generatePaletteColors,
    generateIntensityShades,
    buildPatternBackground,
    VIF_MIXTE_COLORS
  } from './palette.constants';
  import { DEFAULT_VISUALIZATION_COLOR } from '$lib/features/commons/constants/colors.constants';
  import PaletteSwatchRow from './palette-swatch-row.svelte';

  interface Props {
    paletteType: PaletteType;
    selectedPaletteId: string;
    selectedColor?: string;
    numClasses: number;
    divergingSplit?: DivergingPaletteSplit;
    qualitativeMode?: 'single' | 'categories';
    onSelect?: (palette: Palette) => void;
    onColorSelect?: (color: string) => void;
    onPaletteSelect?: (colors: string[]) => void;
    onIntensitySelect?: (color: string) => void;
    onQualitativePresetChange?: (preset: QualitativePreset) => void;
  }

  let {
    paletteType = PALETTE_TYPE.SEQUENTIAL,
    selectedPaletteId,
    selectedColor,
    numClasses,
    divergingSplit,
    qualitativeMode = 'single',
    onSelect,
    onColorSelect,
    onPaletteSelect,
    onIntensitySelect,
    onQualitativePresetChange
  }: Props = $props();

  const isQualitative = $derived(paletteType === PALETTE_TYPE.QUALITATIVE);
  const isCategoriesQualitative = $derived(
    isQualitative && qualitativeMode === 'categories'
  );

  let requestedPreset = $state<SuggestionPreset | undefined>(undefined);

  const availablePresets = $derived(getSuggestionPresetsForType(paletteType));

  const activePreset = $derived(
    requestedPreset && availablePresets.includes(requestedPreset)
      ? requestedPreset
      : availablePresets[0]
  );

  const suggestedPalettes = $derived(
    getSuggestionPalettes(paletteType, activePreset)
  );

  const qualitativeBands = $derived(getQualitativeColorBands(activePreset));

  const qualitativeSelectedColor = $derived(
    selectedColor ?? VIF_MIXTE_COLORS[0]
  );

  function isCategoryBandSelected(colors: readonly string[]): boolean {
    return (
      colors.length > 0 &&
      colors[0].toLowerCase() === qualitativeSelectedColor.toLowerCase()
    );
  }

  const intensityShades = $derived.by(() => {
    if (isQualitative) {
      return generateIntensityShades(qualitativeSelectedColor);
    }
    const selected = suggestedPalettes.find((p) => p.id === selectedPaletteId);
    const seedColor = selected?.colors?.[0] ?? DEFAULT_VISUALIZATION_COLOR;
    return generateIntensityShades(seedColor);
  });

  let selectedIntensityIndex = $state<number>(-1);

  function setPreset(preset: SuggestionPreset) {
    requestedPreset = preset;

    if (isQualitative) {
      onQualitativePresetChange?.(resolveQualitativeGeneratorPreset(preset));
      return;
    }

    const nextPalettes = getSuggestionPalettes(paletteType, preset);
    if (
      !nextPalettes.some((p) => p.id === selectedPaletteId) &&
      nextPalettes.length > 0
    ) {
      onSelect?.(nextPalettes[0]);
    }
  }

  function selectPalette(palette: Palette) {
    onSelect?.(palette);
  }

  function selectQualitativeColor(hex: string) {
    selectedIntensityIndex = -1;
    onColorSelect?.(hex);
  }

  function selectQualitativePalette(colors: string[]) {
    selectedIntensityIndex = -1;
    onPaletteSelect?.(colors);
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

  <div class="filter-tags">
    {#each availablePresets as preset (preset)}
      <button
        type="button"
        class="filter-tag"
        class:selected={activePreset === preset}
        aria-pressed={activePreset === preset}
        onclick={() => setPreset(preset)}
      >
        {getSuggestionPresetLabel(preset)}
      </button>
    {/each}
  </div>

  {#if isQualitative}
    {#if isCategoriesQualitative}
      {#each qualitativeBands as band (band.key)}
        <div class="palette-box">
          <p class="palette-label">{band.label}</p>
          <button
            type="button"
            class="palette-row"
            class:selected={isCategoryBandSelected(band.colors)}
            onclick={() => selectQualitativePalette([...band.colors])}
            aria-label={band.label}
            aria-pressed={isCategoryBandSelected(band.colors)}
          >
            <PaletteSwatchRow colors={band.colors} />
            {#if isCategoryBandSelected(band.colors)}
              <div class="check-icon">
                <Checkmark size={20} />
              </div>
            {/if}
          </button>
        </div>
      {/each}
    {:else}
      {#each qualitativeBands as band (band.key)}
        <QualitativeColorGrid
          label={band.label}
          colors={band.colors}
          selectedColor={qualitativeSelectedColor}
          onColorSelect={selectQualitativeColor}
        />
      {/each}

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
    <div class="palette-list">
      {#each suggestedPalettes as palette (palette.id)}
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
              <PaletteSwatchRow background={buildPatternBackground(palette)} />
            {:else}
              <PaletteSwatchRow
                colors={generatePaletteColors(
                  palette,
                  numClasses,
                  undefined,
                  undefined,
                  divergingSplit
                )}
              />
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
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
    white-space: nowrap;
  }

  .section-heading-icon {
    display: inline-flex;
    align-items: center;
    padding-top: 2px;
    color: var(--khartis-additions-interactive-suggestions, #003a6d);
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
