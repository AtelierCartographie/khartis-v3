<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    Checkbox,
    Column,
    Grid,
    RadioButton,
    RadioButtonGroup,
    Row
  } from 'carbon-components-svelte';
  import ColorSelector from './shared/ColorSelector.svelte';
  import { ArrowsHorizontal, Checkmark } from 'carbon-icons-svelte';
  import type { ClassificationConfig } from '$lib/features/commons/store/visualization.store.svelte';

  const PALETTE_TYPE = {
    SEQUENTIAL: 'sequential',
    DIVERGING: 'diverging',
    QUALITATIVE: 'qualitative',
    PATTERN: 'pattern'
  } as const;

  type PaletteType = (typeof PALETTE_TYPE)[keyof typeof PALETTE_TYPE];
  type PatternId = 'diagonal' | 'horizontal' | 'vertical' | 'dots' | 'cross';

  interface Palette {
    id: string;
    name: string;
    colors: string[];
    type: PaletteType;
    colorBlindSafe?: boolean;
    patternId?: PatternId;
  }

  interface Props {
    selectedPaletteId?: string;
    paletteType?: PaletteType;
    colorBlindFilter?: boolean;
    numClasses?: number;
    onselect?: (palette: Palette) => void;
    oninvert?: () => void;
    onClassificationChange?: (updates: Partial<ClassificationConfig>) => void;
  }

  let {
    selectedPaletteId = $bindable('blues'),
    paletteType = $bindable<PaletteType>(PALETTE_TYPE.SEQUENTIAL),
    colorBlindFilter = $bindable(false),
    numClasses = 5,
    onselect,
    oninvert,
    onClassificationChange
  }: Props = $props();

  const sequentialPalettes: Palette[] = [
    {
      id: 'blues',
      name: 'Blues',
      colors: ['#f7fbff', '#6baed6', '#08519c'],
      type: PALETTE_TYPE.SEQUENTIAL,
      colorBlindSafe: true
    },
    {
      id: 'greens',
      name: 'Greens',
      colors: ['#f7fcf5', '#74c476', '#006d2c'],
      type: PALETTE_TYPE.SEQUENTIAL,
      colorBlindSafe: true
    },
    {
      id: 'oranges',
      name: 'Oranges',
      colors: ['#fff5eb', '#fd8d3c', '#a63603'],
      type: PALETTE_TYPE.SEQUENTIAL,
      colorBlindSafe: true
    },
    {
      id: 'purples',
      name: 'Purples',
      colors: ['#fcfbfd', '#9e9ac8', '#54278f'],
      type: PALETTE_TYPE.SEQUENTIAL,
      colorBlindSafe: true
    },
    {
      id: 'reds',
      name: 'Reds',
      colors: ['#fff5f0', '#fc9272', '#a50f15'],
      type: PALETTE_TYPE.SEQUENTIAL,
      colorBlindSafe: true
    },
    {
      id: 'grays',
      name: 'Grays',
      colors: ['#ffffff', '#969696', '#252525'],
      type: PALETTE_TYPE.SEQUENTIAL,
      colorBlindSafe: true
    }
  ];

  const divergingPalettes: Palette[] = [
    {
      id: 'rdbu',
      name: 'Red-Blue',
      colors: ['#b2182b', '#f7f7f7', '#2166ac'],
      type: PALETTE_TYPE.DIVERGING,
      colorBlindSafe: true
    },
    {
      id: 'rdylgn',
      name: 'Red-Yellow-Green',
      colors: ['#d73027', '#ffffbf', '#1a9850'],
      type: PALETTE_TYPE.DIVERGING,
      colorBlindSafe: false
    },
    {
      id: 'brbg',
      name: 'Brown-BlueGreen',
      colors: ['#8c510a', '#f5f5f5', '#01665e'],
      type: PALETTE_TYPE.DIVERGING,
      colorBlindSafe: true
    },
    {
      id: 'piyg',
      name: 'Pink-YellowGreen',
      colors: ['#c51b7d', '#f7f7f7', '#4d9221'],
      type: PALETTE_TYPE.DIVERGING,
      colorBlindSafe: false
    },
    {
      id: 'prgn',
      name: 'Purple-Green',
      colors: ['#7b3294', '#f7f7f7', '#008837'],
      type: PALETTE_TYPE.DIVERGING,
      colorBlindSafe: true
    }
  ];

  const qualitativePalettes: Palette[] = [
    {
      id: 'set1',
      name: 'Set 1',
      colors: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00'],
      type: PALETTE_TYPE.QUALITATIVE,
      colorBlindSafe: false
    },
    {
      id: 'set2',
      name: 'Set 2',
      colors: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854'],
      type: PALETTE_TYPE.QUALITATIVE,
      colorBlindSafe: true
    },
    {
      id: 'pastel',
      name: 'Pastel',
      colors: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6'],
      type: PALETTE_TYPE.QUALITATIVE,
      colorBlindSafe: true
    },
    {
      id: 'dark',
      name: 'Dark',
      colors: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e'],
      type: PALETTE_TYPE.QUALITATIVE,
      colorBlindSafe: true
    }
  ];

  const patternPalettes: Palette[] = [
    {
      id: 'pattern-diagonal',
      name: m.pattern_diagonal(),
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'diagonal'
    },
    {
      id: 'pattern-horizontal',
      name: m.pattern_horizontal(),
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'horizontal'
    },
    {
      id: 'pattern-vertical',
      name: m.pattern_vertical(),
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'vertical'
    },
    {
      id: 'pattern-dots',
      name: m.pattern_dots(),
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'dots'
    },
    {
      id: 'pattern-cross',
      name: m.pattern_cross(),
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'cross'
    }
  ];

  const currentPalettes = $derived.by(() => {
    let palettes: Palette[];
    switch (paletteType) {
      case PALETTE_TYPE.SEQUENTIAL:
        palettes = sequentialPalettes;
        break;
      case PALETTE_TYPE.DIVERGING:
        palettes = divergingPalettes;
        break;
      case PALETTE_TYPE.QUALITATIVE:
        palettes = qualitativePalettes;
        break;
      case PALETTE_TYPE.PATTERN:
        palettes = patternPalettes;
        break;
      default:
        palettes = sequentialPalettes;
    }

    if (colorBlindFilter) {
      return palettes.filter((p) => p.colorBlindSafe);
    }
    return palettes;
  });

  function interpolateColors(colors: string[], count: number): string[] {
    if (colors.length === count) return colors;
    if (colors.length >= count) return colors.slice(0, count);

    const result: string[] = [];
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const idx = t * (colors.length - 1);
      const lowIdx = Math.floor(idx);
      const highIdx = Math.min(lowIdx + 1, colors.length - 1);
      const frac = idx - lowIdx;

      if (frac === 0) {
        result.push(colors[lowIdx]);
      } else {
        const c1 = hexToRgb(colors[lowIdx]);
        const c2 = hexToRgb(colors[highIdx]);
        const r = Math.round(c1.r + (c2.r - c1.r) * frac);
        const g = Math.round(c1.g + (c2.g - c1.g) * frac);
        const b = Math.round(c1.b + (c2.b - c1.b) * frac);
        result.push(rgbToHex(r, g, b));
      }
    }
    return result;
  }

  function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        }
      : { r: 0, g: 0, b: 0 };
  }

  function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  let customStartColor = $state('#f7fbff');
  let customEndColor = $state('#08519c');

  function handleCustomColorChange(color: string, which: 'start' | 'end') {
    if (which === 'start') customStartColor = color;
    else customEndColor = color;
    const interpolatedColors = interpolateColors(
      [customStartColor, customEndColor],
      numClasses
    );
    onClassificationChange?.({ colors: interpolatedColors });
  }

  function selectPalette(palette: Palette) {
    selectedPaletteId = palette.id;
    onselect?.(palette);

    const interpolatedColors = interpolateColors(palette.colors, numClasses);
    onClassificationChange?.({ colors: interpolatedColors });
  }

  function buildGradient(colors: string[]): string {
    if (colors.length === 2) {
      return `linear-gradient(90deg, ${colors[0]}, ${colors[1]})`;
    }
    const stops = colors.map(
      (c, i) => `${c} ${(i / (colors.length - 1)) * 100}%`
    );
    return `linear-gradient(90deg, ${stops.join(', ')})`;
  }

  function buildPatternBackground(palette: Palette): string {
    const accent = palette.colors[0] ?? '#3d3d3d';
    const base = palette.colors[1] ?? '#f4f4f4';
    switch (palette.patternId) {
      case 'horizontal':
        return `repeating-linear-gradient(0deg, ${accent} 0 4px, ${base} 4px 8px)`;
      case 'vertical':
        return `repeating-linear-gradient(90deg, ${accent} 0 4px, ${base} 4px 8px)`;
      case 'dots':
        return `radial-gradient(${accent} 16%, transparent 17%), linear-gradient(${base}, ${base})`;
      case 'cross':
        return `repeating-linear-gradient(0deg, transparent 0 5px, ${accent} 5px 7px), repeating-linear-gradient(90deg, transparent 0 5px, ${accent} 5px 7px), linear-gradient(${base}, ${base})`;
      case 'diagonal':
      default:
        return `repeating-linear-gradient(45deg, ${accent} 0 4px, ${base} 4px 8px)`;
    }
  }

  function buildPaletteBackground(palette: Palette): string {
    if (palette.type === PALETTE_TYPE.PATTERN) {
      return buildPatternBackground(palette);
    }
    return buildGradient(palette.colors);
  }
</script>

<div class="palette-selector">
  <div class="section">
    <RadioButtonGroup
      legendText={m.color_palette()}
      bind:selected={paletteType}
    >
      <RadioButton
        id="palette-seq"
        value={PALETTE_TYPE.SEQUENTIAL}
        labelText="Séquentielle"
      />
      <RadioButton
        id="palette-div"
        value={PALETTE_TYPE.DIVERGING}
        labelText="Divergente"
      />
      <RadioButton
        id="palette-qual"
        value={PALETTE_TYPE.QUALITATIVE}
        labelText="Qualitative"
      />
      <RadioButton
        id="palette-pattern"
        value={PALETTE_TYPE.PATTERN}
        labelText={m.pattern()}
      />
    </RadioButtonGroup>
  </div>

  <div class="section filter-section">
    <Checkbox
      id="colorblind-filter"
      labelText={m.colorblind_simulation()}
      bind:checked={colorBlindFilter}
    />
  </div>

  <div class="section">
    <div class="palette-grid">
      {#each currentPalettes as palette (palette.id)}
        <Button
          kind="ghost"
          class="palette-item {selectedPaletteId === palette.id
            ? 'selected'
            : ''}"
          on:click={() => selectPalette(palette)}
          aria-label={palette.name}
        >
          <div
            class="palette-preview"
            style="--preview-bg: {buildPaletteBackground(palette)}"
          >
            {#if selectedPaletteId === palette.id}
              <div class="check-icon">
                <Checkmark size={16} />
              </div>
            {/if}
          </div>
          <span class="palette-name">{palette.name}</span>
          {#if palette.colorBlindSafe}
            <span class="colorblind-badge" title="Daltonisme safe">✓</span>
          {/if}
        </Button>
      {/each}
    </div>
  </div>

  <div class="section actions-section">
    <Button
      kind="ghost"
      size="small"
      icon={ArrowsHorizontal}
      on:click={() => oninvert?.()}
    >
      {m.invert_palette_tooltip()}
    </Button>
  </div>

  <div class="section custom-section">
    <p class="label">Couleur personnalisée</p>
    <Grid padding noGutter>
      <Row>
        <Column sm={2} md={4} lg={8}>
          <ColorSelector
            label="Début"
            value={customStartColor}
            onchange={(color) => handleCustomColorChange(color, 'start')}
          />
        </Column>
        <Column sm={2} md={4} lg={8}>
          <ColorSelector
            label="Fin"
            value={customEndColor}
            onchange={(color) => handleCustomColorChange(color, 'end')}
          />
        </Column>
      </Row>
    </Grid>
  </div>
</div>

<style lang="scss">
  .palette-selector {
    padding: var(--cds-spacing-03);
  }

  .section {
    margin-bottom: var(--cds-spacing-05);
  }

  .label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-03);
    text-transform: uppercase;
    letter-spacing: 0.32px;
  }

  .filter-section {
    padding: var(--cds-spacing-03) 0;
    border-bottom: 1px solid var(--cds-border-subtle);
  }

  .palette-grid {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  :global(.palette-item) {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-02);
    background: transparent;
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  :global(.palette-item:hover) {
    background-color: var(--cds-layer-hover);
    border-color: var(--cds-border-strong);
  }

  :global(.palette-item.selected) {
    border-color: var(--cds-interactive);
    background-color: var(--cds-layer-selected);
  }

  .palette-preview {
    width: 120px;
    height: 20px;
    border-radius: 3px;
    background: var(--preview-bg);
    background-size:
      auto,
      8px 8px,
      auto;
    border: 1px solid var(--cds-border-subtle);
    position: relative;
    flex-shrink: 0;
  }

  .check-icon {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    color: white;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  }

  .palette-name {
    font-size: 0.875rem;
    color: var(--cds-text-primary);
    flex: 1;
    text-align: left;
  }

  .colorblind-badge {
    font-size: 0.75rem;
    color: var(--cds-support-success);
    padding: 2px 6px;
    background-color: var(--cds-support-success-inverse);
    border-radius: 10px;
  }

  .actions-section {
    display: flex;
    justify-content: flex-start;
    padding-top: var(--cds-spacing-03);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .custom-section {
    padding-top: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
  }
</style>
