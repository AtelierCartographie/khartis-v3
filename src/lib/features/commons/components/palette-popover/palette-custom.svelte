<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import SimpleRadioGroup from '$lib/features/commons/components/simple-radio-group.svelte';
  import ContentSwitcher from './content-switcher.svelte';
  import SingleColorPreview from './single-color-preview.svelte';
  import PatternPicker from './pattern-picker.svelte';
  import {
    ColorSelector,
    ToggleWithLabel
  } from '$lib/features/commons/components/viz-controls';
  import {
    PALETTE_TYPE,
    type Palette,
    type PaletteType,
    type PatternParams,
    type ContrastMode,
    getPatternPalettes,
    generateSequentialFromColor,
    generateSequentialFromColors
  } from './palette.constants';

  interface Props {
    selectedPaletteId?: string;
    paletteType?: PaletteType;
    numClasses: number;
    colorBlindFilter?: boolean;
    inverted?: boolean;
    allowPattern?: boolean;
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
    allowPattern = true,
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

  const tabLabels = $derived(
    allowPattern
      ? [
          m.palette_custom_1_color(),
          m.palette_custom_2_colors(),
          m.palette_custom_patterns()
        ]
      : [m.palette_custom_1_color(), m.palette_custom_2_colors()]
  );

  const patternPalettes = $derived(getPatternPalettes());

  $effect(() => {
    if (selectedPaletteId?.startsWith('pattern-')) {
      const match = patternPalettes.find((p) => p.id === selectedPaletteId);
      if (match) {
        selectedPatternId = match.id;
      }
    }
  });

  const selectedPalette = $derived(
    patternPalettes.find((p) => p.id === selectedPatternId) ?? null
  );

  const currentPatternParams = $derived<PatternParams>({
    size: patternSize,
    scale: patternScale
  });

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

  function handlePatternChange(patternId: string, params: PatternParams) {
    selectedPatternId = `pattern-${patternId}`;
    patternSize = params.size ?? patternSize;
    patternScale = params.scale ?? patternScale;
    const palette = patternPalettes.find((p) => p.patternId === patternId);
    if (palette) emitPatternSelect(palette, params);
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
      onColorsChange?.([singleColor]);
      return;
    }

    const palette = selectedPalette ?? patternPalettes[0];
    if (palette) {
      selectedPatternId = palette.id;
      emitPatternSelect(palette, currentPatternParams);
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

    {#if allowPattern}
      <ToggleWithLabel
        label={m.pattern()}
        toggled={motifEnabled}
        ontoggle={handleMotifToggle}
      />
    {/if}

    {#if allowPattern && motifEnabled}
      <PatternPicker
        patternId={selectedPalette?.patternId}
        patternParams={currentPatternParams}
        onChange={handlePatternChange}
      />
    {/if}
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
        <PatternPicker
          patternId={selectedPalette?.patternId}
          patternParams={currentPatternParams}
          onChange={handlePatternChange}
        />
      {/if}
    </div>

    {#if activeTab !== 2}
      <div class="contrast-section">
        <span class="field-label">{m.contrast_label()}</span>
        <SimpleRadioGroup
          name="palette-contrast"
          items={[
            { value: 'low', labelText: m.contrast_low() },
            { value: 'normal', labelText: m.contrast_normal() },
            { value: 'high', labelText: m.contrast_high() }
          ]}
          selected={contrastMode}
          onchange={(value) => handleContrastChange(value)}
        />
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
</style>
