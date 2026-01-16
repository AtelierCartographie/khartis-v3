<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Column, Grid, Row, Slider } from 'carbon-components-svelte';
  import { Checkmark } from 'carbon-icons-svelte';

  type PatternShape =
    | 'lines'
    | 'dots'
    | 'crosshatch'
    | 'diagonal'
    | 'zigzag'
    | 'waves';
  type PatternAngle = 0 | 45 | 90 | 135;

  interface Pattern {
    shape: PatternShape;
    angle: PatternAngle;
    size: number;
    spacing: number;
    color: string;
    backgroundColor: string;
  }

  interface Props {
    pattern?: Pattern;
    onchange?: (pattern: Pattern) => void;
  }

  let {
    pattern = $bindable<Pattern>({
      shape: 'lines',
      angle: 45,
      size: 2,
      spacing: 8,
      color: '#333333',
      backgroundColor: '#ffffff'
    }),
    onchange
  }: Props = $props();

  const patternShapes: Array<{
    id: PatternShape;
    name: string;
    preview: string;
  }> = [
    { id: 'lines', name: 'Lignes', preview: '─' },
    { id: 'dots', name: 'Points', preview: '•' },
    { id: 'crosshatch', name: 'Hachures croisées', preview: '╳' },
    { id: 'diagonal', name: 'Diagonales', preview: '╱' },
    { id: 'zigzag', name: 'Zigzag', preview: '∿' },
    { id: 'waves', name: 'Vagues', preview: '〰' }
  ];

  const angleOptions: PatternAngle[] = [0, 45, 90, 135];

  function selectShape(shape: PatternShape) {
    pattern.shape = shape;
    onchange?.(pattern);
  }

  function selectAngle(angle: PatternAngle) {
    pattern.angle = angle;
    onchange?.(pattern);
  }

  function updateSize(size: number) {
    pattern.size = size;
    onchange?.(pattern);
  }

  function updateSpacing(spacing: number) {
    pattern.spacing = spacing;
    onchange?.(pattern);
  }

  function updateColor(color: string) {
    pattern.color = color;
    onchange?.(pattern);
  }

  function updateBackgroundColor(color: string) {
    pattern.backgroundColor = color;
    onchange?.(pattern);
  }

  function generatePatternSvg(p: Pattern): string {
    const size = p.spacing;

    switch (p.shape) {
      case 'lines':
        return `
					<line x1="0" y1="${size / 2}" x2="${size}" y2="${size / 2}"
						stroke="${p.color}" stroke-width="${p.size}" />
				`;
      case 'dots':
        return `
					<circle cx="${size / 2}" cy="${size / 2}" r="${p.size}" fill="${p.color}" />
				`;
      case 'crosshatch':
        return `
					<line x1="0" y1="0" x2="${size}" y2="${size}"
						stroke="${p.color}" stroke-width="${p.size / 2}" />
					<line x1="${size}" y1="0" x2="0" y2="${size}"
						stroke="${p.color}" stroke-width="${p.size / 2}" />
				`;
      case 'diagonal':
        return `
					<line x1="0" y1="${size}" x2="${size}" y2="0"
						stroke="${p.color}" stroke-width="${p.size}" />
				`;
      case 'zigzag':
        return `
					<polyline points="0,${size} ${size / 2},0 ${size},${size}"
						stroke="${p.color}" stroke-width="${p.size}" fill="none" />
				`;
      case 'waves':
        return `
					<path d="M0,${size / 2} Q${size / 4},0 ${size / 2},${size / 2} T${size},${size / 2}"
						stroke="${p.color}" stroke-width="${p.size}" fill="none" />
				`;
      default:
        return '';
    }
  }

  const patternDataUrl = $derived.by(() => {
    const size = pattern.spacing;
    const svg = `
			<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
				<rect width="${size}" height="${size}" fill="${pattern.backgroundColor}" />
				<g transform="rotate(${pattern.angle}, ${size / 2}, ${size / 2})">
					${generatePatternSvg(pattern)}
				</g>
			</svg>
		`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg.trim())}")`;
  });
</script>

<div class="pattern-editor">
  <div class="section">
    <h6 class="label">{m.pattern()}</h6>
    <div class="shape-grid">
      {#each patternShapes as shape (shape.id)}
        <button
          type="button"
          class="shape-button"
          class:selected={pattern.shape === shape.id}
          onclick={() => selectShape(shape.id)}
          aria-label={shape.name}
        >
          <span class="shape-preview">{shape.preview}</span>
          <span class="shape-name">{shape.name}</span>
          {#if pattern.shape === shape.id}
            <div class="check-indicator">
              <Checkmark size={16} />
            </div>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <div class="section">
    <h6 class="label">Angle</h6>
    <div class="angle-options">
      {#each angleOptions as angle (angle)}
        <button
          type="button"
          class="angle-button"
          class:selected={pattern.angle === angle}
          onclick={() => selectAngle(angle)}
          aria-label="{angle}°"
        >
          <div class="angle-preview" style="--rotation: {angle}deg">
            <div class="angle-line"></div>
          </div>
          <span class="angle-label">{angle}°</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="section">
    <Grid padding noGutter>
      <Row>
        <Column sm={4} md={8} lg={16}>
          <div class="slider-row">
            <span class="setting-label">{m.size_label()}</span>
            <Slider
              min={1}
              max={10}
              step={0.5}
              value={pattern.size}
              hideTextInput
              on:change={(e) => updateSize(e.detail)}
            />
            <span class="setting-value">{pattern.size}px</span>
          </div>
        </Column>
      </Row>
      <Row>
        <Column sm={4} md={8} lg={16}>
          <div class="slider-row">
            <span class="setting-label">Espacement</span>
            <Slider
              min={4}
              max={32}
              step={1}
              value={pattern.spacing}
              hideTextInput
              on:change={(e) => updateSpacing(e.detail)}
            />
            <span class="setting-value">{pattern.spacing}px</span>
          </div>
        </Column>
      </Row>
    </Grid>
  </div>

  <div class="section">
    <Grid padding noGutter>
      <Row>
        <Column sm={2} md={4} lg={8}>
          <div class="color-field">
            <span class="setting-label">{m.color()}</span>
            <input
              type="color"
              class="color-input"
              value={pattern.color}
              oninput={(e: Event) => {
                const target = e.target as HTMLInputElement;
                updateColor(target.value);
              }}
            />
          </div>
        </Column>
        <Column sm={2} md={4} lg={8}>
          <div class="color-field">
            <span class="setting-label">{m.background()}</span>
            <input
              type="color"
              class="color-input"
              value={pattern.backgroundColor}
              oninput={(e: Event) => {
                const target = e.target as HTMLInputElement;
                updateBackgroundColor(target.value);
              }}
            />
          </div>
        </Column>
      </Row>
    </Grid>
  </div>

  <div class="section preview-section">
    <h6 class="label">{m.color_preview()}</h6>
    <div class="pattern-preview" style="--pattern: {patternDataUrl}"></div>
  </div>
</div>

<style lang="scss">
  .pattern-editor {
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

  .shape-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--cds-spacing-02);
  }

  .shape-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--cds-spacing-02);
    padding: var(--cds-spacing-03);
    background: var(--cds-layer);
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
    position: relative;

    &:hover {
      background-color: var(--cds-layer-hover);
      border-color: var(--cds-border-strong);
    }

    &.selected {
      border-color: var(--cds-interactive);
      background-color: var(--cds-layer-selected);
    }
  }

  .shape-preview {
    font-size: 1.5rem;
    line-height: 1;
    color: var(--cds-text-primary);
  }

  .shape-name {
    font-size: 0.625rem;
    color: var(--cds-text-02);
    text-align: center;
  }

  .check-indicator {
    position: absolute;
    top: 4px;
    right: 4px;
    color: var(--cds-interactive);
  }

  .angle-options {
    display: flex;
    gap: var(--cds-spacing-03);
  }

  .angle-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--cds-spacing-02);
    padding: var(--cds-spacing-03);
    background: var(--cds-layer);
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
    flex: 1;

    &:hover {
      background-color: var(--cds-layer-hover);
      border-color: var(--cds-border-strong);
    }

    &.selected {
      border-color: var(--cds-interactive);
      background-color: var(--cds-layer-selected);
    }
  }

  .angle-preview {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: rotate(var(--rotation));
  }

  .angle-line {
    width: 16px;
    height: 2px;
    background-color: var(--cds-text-primary);
    border-radius: 1px;
  }

  .angle-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-02) 0;
  }

  .setting-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    min-width: 70px;
  }

  .setting-value {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    min-width: 40px;
    text-align: right;
  }

  .color-field {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
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

  .preview-section {
    padding-top: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .pattern-preview {
    width: 100%;
    height: 80px;
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    background-image: var(--pattern);
    background-repeat: repeat;
  }
</style>
