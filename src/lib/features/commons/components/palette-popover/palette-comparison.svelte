<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { PATTERN_OVERLAY_OPACITY } from '$lib/features/commons/constants/pattern.constants';
  import { getPatternOverlayColorHex } from '$lib/features/map/layers/pattern-texture';
  import {
    PALETTE_TYPE,
    buildPatternSvgBackground,
    resolveEffectivePatternId,
    type PaletteType,
    type PatternId,
    type PatternParams
  } from './palette.constants';
  import PaletteSwatchRow from './palette-swatch-row.svelte';

  interface Props {
    currentColors: string[];
    newColors: string[];
    paletteType?: PaletteType;
    currentPatternId?: PatternId;
    currentPatternParams?: PatternParams;
    newPatternId?: PatternId;
    newPatternParams?: PatternParams;
  }

  let {
    currentColors,
    newColors,
    paletteType = PALETTE_TYPE.SEQUENTIAL,
    currentPatternId,
    currentPatternParams,
    newPatternId,
    newPatternParams
  }: Props = $props();

  const isQualitative = $derived(paletteType === PALETTE_TYPE.QUALITATIVE);

  const currentPrimary = $derived(currentColors[0] ?? '#f287ac');
  const newPrimary = $derived(newColors[0] ?? currentPrimary);

  function patternedBackground(
    color: string,
    patternId: PatternId,
    params?: PatternParams
  ): string {
    const overlay = buildPatternSvgBackground(
      resolveEffectivePatternId(patternId, params),
      getPatternOverlayColorHex(color),
      'transparent',
      params,
      PATTERN_OVERLAY_OPACITY
    );
    return `${overlay}, ${color}`;
  }

  function swatchStyle(
    color: string,
    patternId?: PatternId,
    params?: PatternParams
  ): string {
    return patternId
      ? `background: ${patternedBackground(color, patternId, params)}`
      : `background-color: ${color}`;
  }

  function rowBackgrounds(
    colors: string[],
    patternId?: PatternId,
    params?: PatternParams
  ): string[] | undefined {
    if (!patternId) return undefined;
    return colors.map((color) => patternedBackground(color, patternId, params));
  }
</script>

<div class="palette-comparison" class:side-by-side={isQualitative}>
  {#if isQualitative}
    <div class="comparison-column">
      <span class="comparison-label">{m.palette_current()}</span>
      <div
        class="solid-swatch"
        style={swatchStyle(
          currentPrimary,
          currentPatternId,
          currentPatternParams
        )}
      ></div>
    </div>
    <div class="comparison-column">
      <span class="comparison-label">{m.palette_new()}</span>
      <div
        class="solid-swatch"
        style={swatchStyle(newPrimary, newPatternId, newPatternParams)}
      ></div>
    </div>
  {:else}
    <div class="comparison-box">
      <span class="comparison-label">{m.palette_current()}</span>
      <PaletteSwatchRow
        colors={currentColors}
        backgrounds={rowBackgrounds(
          currentColors,
          currentPatternId,
          currentPatternParams
        )}
        height="16px"
      />
    </div>
    <div class="comparison-box">
      <span class="comparison-label">{m.palette_new()}</span>
      <PaletteSwatchRow
        colors={newColors}
        backgrounds={rowBackgrounds(newColors, newPatternId, newPatternParams)}
        height="16px"
      />
    </div>
  {/if}
</div>

<style lang="scss">
  .palette-comparison {
    display: flex;
    flex-direction: column;
    gap: 8px;
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
    display: block;
    margin: 0;
    padding: 0 0 8px 0;
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 400;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
  }

  .solid-swatch {
    width: 100%;
    height: 32px;
  }
</style>
