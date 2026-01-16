<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    Checkbox,
    Column,
    Grid,
    RadioButton,
    RadioButtonGroup,
    Row,
    Tile
  } from 'carbon-components-svelte';
  import { ArrowsHorizontal, Checkmark } from 'carbon-icons-svelte';

  type PaletteType = 'sequential' | 'diverging' | 'qualitative';

  interface Palette {
    id: string;
    name: string;
    colors: string[];
    type: PaletteType;
    colorBlindSafe?: boolean;
  }

  interface Props {
    selectedPaletteId?: string;
    paletteType?: PaletteType;
    colorBlindFilter?: boolean;
    onselect?: (palette: Palette) => void;
    oninvert?: () => void;
  }

  let {
    selectedPaletteId = 'blues',
    paletteType = $bindable<PaletteType>('sequential'),
    colorBlindFilter = $bindable(false),
    onselect,
    oninvert
  }: Props = $props();

  const sequentialPalettes: Palette[] = [
    {
      id: 'blues',
      name: 'Blues',
      colors: ['#f7fbff', '#6baed6', '#08519c'],
      type: 'sequential',
      colorBlindSafe: true
    },
    {
      id: 'greens',
      name: 'Greens',
      colors: ['#f7fcf5', '#74c476', '#006d2c'],
      type: 'sequential',
      colorBlindSafe: true
    },
    {
      id: 'oranges',
      name: 'Oranges',
      colors: ['#fff5eb', '#fd8d3c', '#a63603'],
      type: 'sequential',
      colorBlindSafe: true
    },
    {
      id: 'purples',
      name: 'Purples',
      colors: ['#fcfbfd', '#9e9ac8', '#54278f'],
      type: 'sequential',
      colorBlindSafe: true
    },
    {
      id: 'reds',
      name: 'Reds',
      colors: ['#fff5f0', '#fc9272', '#a50f15'],
      type: 'sequential',
      colorBlindSafe: true
    },
    {
      id: 'grays',
      name: 'Grays',
      colors: ['#ffffff', '#969696', '#252525'],
      type: 'sequential',
      colorBlindSafe: true
    }
  ];

  const divergingPalettes: Palette[] = [
    {
      id: 'rdbu',
      name: 'Red-Blue',
      colors: ['#b2182b', '#f7f7f7', '#2166ac'],
      type: 'diverging',
      colorBlindSafe: true
    },
    {
      id: 'rdylgn',
      name: 'Red-Yellow-Green',
      colors: ['#d73027', '#ffffbf', '#1a9850'],
      type: 'diverging',
      colorBlindSafe: false
    },
    {
      id: 'brbg',
      name: 'Brown-BlueGreen',
      colors: ['#8c510a', '#f5f5f5', '#01665e'],
      type: 'diverging',
      colorBlindSafe: true
    },
    {
      id: 'piyg',
      name: 'Pink-YellowGreen',
      colors: ['#c51b7d', '#f7f7f7', '#4d9221'],
      type: 'diverging',
      colorBlindSafe: false
    },
    {
      id: 'prgn',
      name: 'Purple-Green',
      colors: ['#7b3294', '#f7f7f7', '#008837'],
      type: 'diverging',
      colorBlindSafe: true
    }
  ];

  const qualitativePalettes: Palette[] = [
    {
      id: 'set1',
      name: 'Set 1',
      colors: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00'],
      type: 'qualitative',
      colorBlindSafe: false
    },
    {
      id: 'set2',
      name: 'Set 2',
      colors: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854'],
      type: 'qualitative',
      colorBlindSafe: true
    },
    {
      id: 'pastel',
      name: 'Pastel',
      colors: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6'],
      type: 'qualitative',
      colorBlindSafe: true
    },
    {
      id: 'dark',
      name: 'Dark',
      colors: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e'],
      type: 'qualitative',
      colorBlindSafe: true
    }
  ];

  const currentPalettes = $derived.by(() => {
    let palettes: Palette[];
    switch (paletteType) {
      case 'sequential':
        palettes = sequentialPalettes;
        break;
      case 'diverging':
        palettes = divergingPalettes;
        break;
      case 'qualitative':
        palettes = qualitativePalettes;
        break;
      default:
        palettes = sequentialPalettes;
    }

    if (colorBlindFilter) {
      return palettes.filter((p) => p.colorBlindSafe);
    }
    return palettes;
  });

  function selectPalette(palette: Palette) {
    selectedPaletteId = palette.id;
    onselect?.(palette);
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
</script>

<div class="palette-selector">
  <div class="section">
    <RadioButtonGroup
      legendText={m.color_palette()}
      bind:selected={paletteType}
    >
      <RadioButton
        id="palette-seq"
        value="sequential"
        labelText="Séquentielle"
      />
      <RadioButton id="palette-div" value="diverging" labelText="Divergente" />
      <RadioButton
        id="palette-qual"
        value="qualitative"
        labelText="Qualitative"
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
        <button
          type="button"
          class="palette-item"
          class:selected={selectedPaletteId === palette.id}
          onclick={() => selectPalette(palette)}
          aria-label={palette.name}
        >
          <div
            class="palette-preview"
            style="--gradient: {buildGradient(palette.colors)}"
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
        </button>
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
    <h6 class="label">Couleur personnalisée</h6>
    <Grid padding noGutter>
      <Row>
        <Column sm={2} md={4} lg={8}>
          <Tile class="color-input-tile">
            <label for="start-color" class="color-label">Début</label>
            <input
              type="color"
              id="start-color"
              class="color-input"
              value="#f7fbff"
            />
          </Tile>
        </Column>
        <Column sm={2} md={4} lg={8}>
          <Tile class="color-input-tile">
            <label for="end-color" class="color-label">Fin</label>
            <input
              type="color"
              id="end-color"
              class="color-input"
              value="#08519c"
            />
          </Tile>
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

  .palette-item {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-02);
    background: transparent;
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      background-color: var(--cds-layer-hover);
      border-color: var(--cds-border-strong);
    }

    &.selected {
      border-color: var(--cds-interactive);
      background-color: var(--cds-layer-selected);
    }
  }

  .palette-preview {
    width: 120px;
    height: 20px;
    border-radius: 3px;
    background: var(--gradient);
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

  :global(.color-input-tile) {
    padding: var(--cds-spacing-03) !important;
    min-height: auto !important;
  }

  .color-label {
    display: block;
    font-size: 0.75rem;
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-02);
  }

  .color-input {
    width: 100%;
    height: 32px;
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    cursor: pointer;
    padding: 2px;
    background: transparent;

    &::-webkit-color-swatch-wrapper {
      padding: 0;
    }

    &::-webkit-color-swatch {
      border: none;
      border-radius: 2px;
    }
  }
</style>
