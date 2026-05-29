<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { SliderWithInput } from '$lib/features/commons/components/viz-controls';
  import {
    type Palette,
    type PatternParams,
    type PatternId,
    getPaletteDisplayName,
    getPatternPalettes,
    buildPatternBackground
  } from './palette.constants';

  interface Props {
    patternId?: string;
    patternParams?: PatternParams;
    onChange: (patternId: PatternId, params: PatternParams) => void;
  }

  let { patternId, patternParams, onChange }: Props = $props();

  const DEFAULT_SIZE = 4;
  const DEFAULT_SCALE = 8;

  const patternPalettes = getPatternPalettes();

  const LINE_PATTERN_IDS = [
    'diagonal',
    'diagonal-reverse',
    'horizontal',
    'vertical'
  ] as const;
  type LinePatternId = (typeof LINE_PATTERN_IDS)[number];

  const ANGLE_OPTIONS: {
    label: string;
    angle: 0 | 45 | 315;
    patternId: LinePatternId;
  }[] = [
    { label: '0°', angle: 0, patternId: 'horizontal' },
    { label: '45°', angle: 45, patternId: 'diagonal' },
    { label: '315°', angle: 315, patternId: 'diagonal-reverse' }
  ];

  const selectedPalette = $derived(
    patternPalettes.find((p) => p.patternId === patternId) ?? patternPalettes[0]
  );
  const size = $derived(patternParams?.size ?? DEFAULT_SIZE);
  const scale = $derived(patternParams?.scale ?? DEFAULT_SCALE);

  const isLinePattern = $derived(
    LINE_PATTERN_IDS.includes(selectedPalette.patternId as LinePatternId)
  );

  const currentAngle = $derived.by((): 0 | 45 | 315 | undefined => {
    if (selectedPalette.patternId === 'horizontal') return 0;
    if (selectedPalette.patternId === 'diagonal') return 45;
    if (selectedPalette.patternId === 'diagonal-reverse') return 315;
    return undefined;
  });

  const currentParams = $derived<PatternParams>({
    angle: currentAngle,
    size,
    scale
  });

  const livePreviewBg = $derived(
    buildPatternBackground(selectedPalette, currentParams)
  );

  function emit(palette: Palette, params: PatternParams) {
    if (palette.patternId) onChange(palette.patternId, params);
  }

  function handlePatternClick(palette: Palette) {
    emit(palette, { ...currentParams });
  }

  function handleAngleSelect(option: (typeof ANGLE_OPTIONS)[number]) {
    const target = patternPalettes.find(
      (p) => p.patternId === option.patternId
    );
    if (target) emit(target, { ...currentParams, angle: option.angle });
  }

  function handleSizeChange(value: number) {
    emit(selectedPalette, { ...currentParams, size: value });
  }

  function handleScaleChange(value: number) {
    emit(selectedPalette, { ...currentParams, scale: value });
  }
</script>

<div class="pattern-picker">
  <div class="pattern-list">
    {#each patternPalettes as palette (palette.id)}
      <button
        type="button"
        class="pattern-item"
        class:selected={selectedPalette.id === palette.id}
        onclick={() => handlePatternClick(palette)}
        aria-label={getPaletteDisplayName(palette)}
        aria-pressed={selectedPalette.id === palette.id}
      >
        <div
          class="pattern-preview"
          style="background: {buildPatternBackground(palette)}"
        ></div>
        <span class="pattern-name">{getPaletteDisplayName(palette)}</span>
      </button>
    {/each}
  </div>

  <div class="pattern-params">
    {#if isLinePattern}
      <div class="param-row">
        <span class="param-label">{m.pattern_angle()}</span>
        <div class="angle-buttons">
          {#each ANGLE_OPTIONS as opt (opt.angle)}
            <button
              type="button"
              class="angle-btn"
              class:active={currentAngle === opt.angle}
              onclick={() => handleAngleSelect(opt)}
              aria-pressed={currentAngle === opt.angle}
            >
              {opt.label}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <SliderWithInput
      label={m.pattern_size()}
      min={1}
      max={10}
      value={size}
      onchange={handleSizeChange}
    />

    <SliderWithInput
      label={m.pattern_scale()}
      min={4}
      max={24}
      value={scale}
      onchange={handleScaleChange}
    />

    <div class="live-preview">
      <span class="param-label">{m.pattern_preview()}</span>
      <div
        class="live-preview-swatch"
        style="background: {livePreviewBg}"
      ></div>
    </div>
  </div>
</div>

<style lang="scss">
  .pattern-picker {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
  }

  .pattern-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .pattern-item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 7px 12px;
    background: var(--cds-field-01, #f4f4f4);
    border: none;
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
    cursor: pointer;
    width: 100%;

    &:hover {
      background: var(--cds-field-hover-01, #e8e8e8);
    }

    &.selected {
      outline: 1px solid #012749;
      outline-offset: -1px;
    }
  }

  .pattern-preview {
    width: 56px;
    height: 18px;
    border: 1px solid var(--khartis-palette-swatch-border-color);
    flex-shrink: 0;
    background-size:
      auto,
      8px 8px,
      auto;
  }

  .pattern-name {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 14px;
    line-height: 18px;
    letter-spacing: 0.16px;
    color: var(--cds-text-primary, #161616);
  }

  .pattern-params {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 8px;
  }

  .param-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .param-label {
    font-size: 12px;
    color: var(--cds-text-secondary);
    white-space: nowrap;
    min-width: 48px;
  }

  .angle-buttons {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .angle-btn {
    min-height: 24px;
    padding: 0 8px 2px;
    font-size: 12px;
    background: #e5f6ff;
    border: 1px solid #82cfff;
    border-radius: 9px;
    cursor: pointer;
    color: #003a6d;

    &:hover {
      background: #cceeff;
    }

    &.active {
      background: #0072c3;
      color: #ffffff;
      border-color: #0072c3;
    }
  }

  .live-preview {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .live-preview-swatch {
    flex: 1;
    height: 18px;
    border: 1px solid var(--khartis-palette-swatch-border-color);
    background-size:
      auto,
      8px 8px,
      auto;
  }
</style>
