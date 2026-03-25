<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { RadioButtonGroup, RadioButton } from 'carbon-components-svelte';
  import ContentSwitcher from './content-switcher.svelte';
  import { ColorSelector, SliderWithInput, ToggleWithLabel } from '../shared';
  import {
    type Palette,
    type PatternParams,
    type ContrastMode,
    getPatternPalettes,
    generateSequentialFromColor,
    generateSequentialFromColors,
    buildPatternBackground
  } from './palette.constants';

  interface Props {
    selectedPaletteId?: string;
    numClasses: number;
    colorBlindFilter?: boolean;
    inverted?: boolean;
    onColorsChange?: (colors: string[]) => void;
    onPatternSelect?: (palette: Palette, params: PatternParams) => void;
    onContrastChange?: (contrast: ContrastMode | undefined) => void;
    onInvertToggle?: (value: boolean) => void;
  }

  let {
    selectedPaletteId,
    numClasses,
    colorBlindFilter: _colorBlindFilter = false,
    inverted = $bindable(false),
    onColorsChange,
    onPatternSelect,
    onContrastChange,
    onInvertToggle
  }: Props = $props();

  let activeTab = $state(0);
  let singleColor = $state('#08519c');
  let startColor = $state('#f7fbff');
  let endColor = $state('#08519c');
  let contrastMode = $state<'low' | 'normal' | 'high'>('normal');

  // Pattern state
  let selectedPatternId = $state<string | null>(null);
  let patternSize = $state(4);
  let patternScale = $state(8);

  const tabLabels = $derived([
    m.palette_custom_1_color(),
    m.palette_custom_2_colors(),
    m.palette_custom_patterns()
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

  const resolvedContrast = $derived<ContrastMode | undefined>(
    contrastMode === 'normal' ? undefined : contrastMode
  );

  function handleTabChange(index: number) {
    activeTab = index;
  }

  function handleContrastChange(value: string) {
    contrastMode = value as 'low' | 'normal' | 'high';
    onContrastChange?.(resolvedContrast);

    // Re-emit current colors with new contrast
    if (activeTab === 0) {
      const colors = generateSequentialFromColor(
        singleColor,
        numClasses,
        resolvedContrast
      );
      onColorsChange?.(colors);
    } else if (activeTab === 1) {
      const colors = generateSequentialFromColors(
        startColor,
        endColor,
        numClasses,
        resolvedContrast
      );
      onColorsChange?.(colors);
    }
  }

  function handleSingleColorChange(color: string) {
    singleColor = color;
    const colors = generateSequentialFromColor(
      color,
      numClasses,
      resolvedContrast
    );
    onColorsChange?.(colors);
  }

  function handleStartColorChange(color: string) {
    startColor = color;
    const colors = generateSequentialFromColors(
      startColor,
      endColor,
      numClasses,
      resolvedContrast
    );
    onColorsChange?.(colors);
  }

  function handleEndColorChange(color: string) {
    endColor = color;
    const colors = generateSequentialFromColors(
      startColor,
      endColor,
      numClasses,
      resolvedContrast
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

  function handleInvertToggle(value: boolean) {
    inverted = value;
    onInvertToggle?.(value);
  }
</script>

<div class="palette-custom">
  <div class="section-title">
    <span class="section-title-text">{m.palette_custom()}</span>
    <div class="section-title-line"></div>
  </div>

  <ContentSwitcher
    items={tabLabels}
    activeIndex={activeTab}
    onchange={handleTabChange}
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

  {#if activeTab !== 2}
    <div class="contrast-section">
      <span class="contrast-label">{m.contrast_label()}</span>
      <RadioButtonGroup
        selected={contrastMode}
        legendText=""
        orientation="horizontal"
        on:change={(e) => handleContrastChange(String(e.detail))}
      >
        <RadioButton labelText={m.contrast_low()} value="low" />
        <RadioButton labelText={m.contrast_normal()} value="normal" />
        <RadioButton labelText={m.contrast_high()} value="high" />
      </RadioButtonGroup>
    </div>
  {/if}

  <ToggleWithLabel
    label={m.invert_palette_tooltip()}
    toggled={inverted}
    ontoggle={handleInvertToggle}
  />
</div>

<style lang="scss">
  .palette-custom {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .section-title-text {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-primary);
    white-space: nowrap;
  }

  .section-title-line {
    flex: 1;
    height: 1px;
    background: var(--cds-border-subtle);
  }

  .tab-content {
    padding-top: var(--cds-spacing-02);
  }

  .two-colors {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .contrast-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .contrast-label {
    font-size: 0.75rem;
    color: var(--cds-text-secondary);
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
