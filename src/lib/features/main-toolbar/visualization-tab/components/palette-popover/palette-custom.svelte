<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { ColorSelector, SliderWithInput } from '../shared';
  import {
    type Palette,
    type PatternParams,
    getPatternPalettes,
    generateSequentialFromColor,
    generateSequentialFromColors,
    buildPatternBackground
  } from './palette.constants';

  interface Props {
    selectedPaletteId?: string;
    numClasses: number;
    colorBlindFilter?: boolean;
    onColorsChange?: (colors: string[]) => void;
    onPatternSelect?: (palette: Palette, params: PatternParams) => void;
  }

  let {
    selectedPaletteId,
    numClasses,
    colorBlindFilter = false,
    onColorsChange,
    onPatternSelect
  }: Props = $props();

  let activeTab = $state(0);
  let singleColor = $state('#08519c');
  let startColor = $state('#f7fbff');
  let endColor = $state('#08519c');

  // Pattern state
  let selectedPatternId = $state<string | null>(null);
  let patternSize = $state(4);
  let patternScale = $state(8);

  const tabItems = $derived([
    { label: m.palette_custom_1_color() },
    { label: m.palette_custom_2_colors() },
    { label: m.palette_custom_patterns() }
  ]);

  const patternPalettes = $derived(getPatternPalettes());

  $effect(() => {
    if (selectedPaletteId?.startsWith('pattern-')) {
      const match = patternPalettes.find((p) => p.id === selectedPaletteId);
      if (match) {
        selectedPatternId = match.id;
      }
    }
  });

  // Line patterns support angle selection (CDC §2.B.2.c)
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
    patternPalettes.find((p) => p.id === selectedPatternId) ?? null
  );

  const isLinePattern = $derived(
    selectedPalette !== null &&
      LINE_PATTERN_IDS.includes(selectedPalette.patternId as LinePatternId)
  );

  const currentAngle = $derived.by((): 0 | 45 | 315 | undefined => {
    if (!selectedPalette) return undefined;
    if (selectedPalette.patternId === 'horizontal') return 0;
    if (selectedPalette.patternId === 'diagonal') return 45;
    if (selectedPalette.patternId === 'diagonal-reverse') return 315;
    return undefined;
  });

  const currentPatternParams = $derived<PatternParams>({
    angle: currentAngle,
    size: patternSize,
    scale: patternScale
  });

  const livePreviewBg = $derived(
    selectedPalette
      ? buildPatternBackground(selectedPalette, currentPatternParams)
      : ''
  );

  function handleTabChange(index: number) {
    activeTab = index;
  }

  const contrast = $derived(colorBlindFilter ? ('high' as const) : undefined);

  function handleSingleColorChange(color: string) {
    singleColor = color;
    const colors = generateSequentialFromColor(color, numClasses, contrast);
    onColorsChange?.(colors);
  }

  function handleStartColorChange(color: string) {
    startColor = color;
    const colors = generateSequentialFromColors(
      startColor,
      endColor,
      numClasses,
      contrast
    );
    onColorsChange?.(colors);
  }

  function handleEndColorChange(color: string) {
    endColor = color;
    const colors = generateSequentialFromColors(
      startColor,
      endColor,
      numClasses,
      contrast
    );
    onColorsChange?.(colors);
  }

  function handlePatternClick(palette: Palette) {
    selectedPatternId = palette.id;
    emitPatternSelect(palette, currentPatternParams);
  }

  function handleAngleSelect(option: (typeof ANGLE_OPTIONS)[number]) {
    const targetPalette = patternPalettes.find(
      (p) => p.patternId === option.patternId
    );
    if (targetPalette) {
      selectedPatternId = targetPalette.id;
      emitPatternSelect(targetPalette, {
        ...currentPatternParams,
        angle: option.angle
      });
    }
  }

  function handleSizeChange(value: number) {
    patternSize = value;
    if (selectedPalette) {
      emitPatternSelect(selectedPalette, {
        ...currentPatternParams,
        size: value
      });
    }
  }

  function handleScaleChange(value: number) {
    patternScale = value;
    if (selectedPalette) {
      emitPatternSelect(selectedPalette, {
        ...currentPatternParams,
        scale: value
      });
    }
  }

  function emitPatternSelect(palette: Palette, params: PatternParams) {
    onPatternSelect?.(palette, params);
  }
</script>

<div class="palette-custom">
  <div class="section-divider">
    <span class="divider-label">{m.palette_custom()}</span>
  </div>

  <ToggleTabs
    items={tabItems}
    activeIndex={activeTab}
    onChange={handleTabChange}
    hideInactiveLabel={false}
  />

  <div class="tab-content">
    {#if activeTab === 0}
      <ColorSelector
        label={m.color()}
        value={singleColor}
        onchange={handleSingleColorChange}
      />
    {:else if activeTab === 1}
      <div class="two-colors">
        <ColorSelector
          label={m.color()}
          value={startColor}
          onchange={handleStartColorChange}
        />
        <ColorSelector
          label={m.color()}
          value={endColor}
          onchange={handleEndColorChange}
        />
      </div>
    {:else if activeTab === 2}
      <div class="pattern-list">
        {#each patternPalettes as palette (palette.id)}
          <button
            type="button"
            class="pattern-item"
            class:selected={selectedPatternId === palette.id}
            onclick={() => handlePatternClick(palette)}
            aria-label={palette.name}
            aria-pressed={selectedPatternId === palette.id}
          >
            <div
              class="pattern-preview"
              style="background: {buildPatternBackground(palette)}"
            ></div>
            <span class="pattern-name">{palette.name}</span>
          </button>
        {/each}
      </div>

      {#if selectedPalette}
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
            value={patternSize}
            onchange={handleSizeChange}
          />

          <SliderWithInput
            label={m.pattern_scale()}
            min={4}
            max={24}
            value={patternScale}
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
      {/if}
    {/if}
  </div>
</div>

<style lang="scss">
  .palette-custom {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .section-divider {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding-top: var(--cds-spacing-03);

    &::before,
    &::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--cds-border-subtle);
    }
  }

  .divider-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--cds-text-secondary);
    white-space: nowrap;
  }

  .tab-content {
    padding-top: var(--cds-spacing-02);
  }

  .two-colors {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .pattern-list {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .pattern-item {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-02);
    background: transparent;
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    cursor: pointer;
    width: 100%;

    &:hover {
      background-color: var(--cds-layer-hover);
      border-color: var(--cds-border-strong);
    }

    &.selected {
      background-color: var(--cds-layer-selected);
      border-color: var(--cds-border-interactive);
    }
  }

  .pattern-preview {
    width: 60px;
    height: 20px;
    border-radius: 2px;
    flex-shrink: 0;
    background-size:
      auto,
      8px 8px,
      auto;
  }

  .pattern-name {
    font-size: 0.875rem;
    color: var(--cds-text-primary);
  }

  .pattern-params {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-03);
    background: var(--cds-layer-01);
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    margin-top: var(--cds-spacing-02);
  }

  .param-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .param-label {
    font-size: 0.75rem;
    color: var(--cds-text-secondary);
    white-space: nowrap;
    min-width: 48px;
  }

  .angle-buttons {
    display: flex;
    gap: var(--cds-spacing-02);
  }

  .angle-btn {
    padding: 2px 8px;
    font-size: 0.75rem;
    background: var(--cds-field);
    border: 1px solid var(--cds-border-strong);
    border-radius: 2px;
    cursor: pointer;
    color: var(--cds-text-primary);

    &:hover {
      background: var(--cds-layer-hover);
    }

    &.active {
      background: var(--cds-interactive);
      color: var(--cds-text-on-color);
      border-color: var(--cds-interactive);
    }
  }

  .live-preview {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .live-preview-swatch {
    flex: 1;
    height: 24px;
    border-radius: 2px;
    background-size:
      auto,
      8px 8px,
      auto;
  }
</style>
