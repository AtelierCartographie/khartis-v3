<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { RadioButtonGroup, RadioButton } from 'carbon-components-svelte';
  import ContentSwitcher from './content-switcher.svelte';
  import SingleColorPreview from './single-color-preview.svelte';
  import {
    ColorSelector,
    SliderWithInput,
    ToggleWithLabel
  } from '$lib/features/commons/components/viz-controls';
  import {
    PALETTE_TYPE,
    type Palette,
    type PaletteType,
    type PatternParams,
    type ContrastMode,
    getPaletteDisplayName,
    getPatternPalettes,
    generateSequentialFromColor,
    generateSequentialFromColors,
    buildPatternBackground
  } from './palette.constants';

  interface Props {
    selectedPaletteId?: string;
    paletteType?: PaletteType;
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
    paletteType = PALETTE_TYPE.SEQUENTIAL,
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
  let motifEnabled = $state(false);

  let selectedPatternId = $state<string | null>(null);
  let patternSize = $state(4);
  let patternScale = $state(8);

  const isQualitative = $derived(paletteType === PALETTE_TYPE.QUALITATIVE);

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
    if (index === 0 && activeTab === 1) {
      singleColor = endColor;
    } else if (index === 1 && activeTab === 0) {
      endColor = singleColor;
      startColor = '#ffffff';
    }
    activeTab = index;

    if (index === 0) {
      onColorsChange?.(
        generateSequentialFromColor(singleColor, numClasses, resolvedContrast)
      );
    } else if (index === 1) {
      onColorsChange?.(
        generateSequentialFromColors(
          startColor,
          endColor,
          numClasses,
          resolvedContrast
        )
      );
    }
  }

  function handleContrastChange(value: string) {
    const next = value as 'low' | 'normal' | 'high';
    if (next === contrastMode) return;
    contrastMode = next;
    onContrastChange?.(resolvedContrast);

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
    const colors = isQualitative
      ? [color]
      : generateSequentialFromColor(color, numClasses, resolvedContrast);
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

  function handleMotifToggle(value: boolean) {
    motifEnabled = value;
    if (!value) {
      selectedPatternId = null;
    }
  }
</script>

<div class="palette-custom">
  <div class="section-heading">
    <span class="section-heading-text"
      >{isQualitative ? m.palette_custom_color() : m.palette_custom()}</span
    >
    <div class="section-heading-line"></div>
  </div>

  {#if isQualitative}
    <ColorSelector
      label={m.color()}
      value={singleColor}
      onchange={handleSingleColorChange}
    />

    <ToggleWithLabel
      label={m.pattern()}
      toggled={motifEnabled}
      ontoggle={handleMotifToggle}
    />
  {:else}
    <ContentSwitcher
      items={tabLabels}
      activeIndex={activeTab}
      onchange={handleTabChange}
    />

    <div class="tab-content">
      {#if activeTab === 0}
        <SingleColorPreview
          label={m.color()}
          color={singleColor}
          onchange={handleSingleColorChange}
        />
      {:else if activeTab === 1}
        <div class="two-colors">
          <SingleColorPreview
            label={m.color()}
            color={startColor}
            onchange={handleStartColorChange}
          />
          <SingleColorPreview
            label={m.color()}
            color={endColor}
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
              aria-label={getPaletteDisplayName(palette)}
              aria-pressed={selectedPatternId === palette.id}
            >
              <div
                class="pattern-preview"
                style="background: {buildPatternBackground(palette)}"
              ></div>
              <span class="pattern-name">{getPaletteDisplayName(palette)}</span>
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
        <span class="field-label">{m.contrast_label()}</span>
        <RadioButtonGroup
          selected={contrastMode}
          legendText=""
          orientation="horizontal"
          on:change={(e) => {
            const next = String(e.detail);
            if (next === contrastMode) return;
            handleContrastChange(next);
          }}
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
  {/if}
</div>

<style lang="scss">
  .palette-custom {
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
    color: var(--cds-text-primary, #161616);
    white-space: nowrap;
  }

  .section-heading-line {
    flex: 1;
    height: 1px;
    background: var(--cds-border-subtle-01, #c6c6c6);
  }

  .field-label {
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 400;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
  }

  .tab-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .two-colors {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .contrast-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
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

  .contrast-section :global(.bx--radio-button-group) {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .contrast-section :global(.bx--radio-button-wrapper) {
    margin: 0;
  }

  .contrast-section :global(.bx--radio-button__label) {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 14px;
    line-height: 18px;
    letter-spacing: 0.16px;
  }
</style>
