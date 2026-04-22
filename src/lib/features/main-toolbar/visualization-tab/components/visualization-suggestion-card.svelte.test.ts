import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'visualization-suggestion-card.svelte'),
  'utf8'
);

describe('VisualizationSuggestionCard', () => {
  it('renders variable badges as non-interactive preview content', () => {
    expect(source).toContain('interactive={false}');
  });

  it('uses the shared preview tile and localized preview label', () => {
    expect(source).toContain(
      "import TilePreview from '$lib/features/commons/components/tile-preview.svelte';"
    );
    expect(source).toContain('label={m.viz_preview_label()}');
  });

  it('maps hover state to the figma hover tokens', () => {
    expect(source).toContain('--khartis-additions-layer-hover-01-suggestions');
  });

  it('keeps a simple header layout without the stacking helper', () => {
    expect(source).not.toContain('stackCardHeader');
    expect(source).not.toContain('title-measure');
    expect(source).toContain('<p class="title">{suggestion.label}</p>');
  });

  it('uses the shared card radio theme overrides', () => {
    expect(source).toContain('class="radio-wrapper kh-card-radio"');
    expect(source).toContain('--kh-card-radio-color');
    expect(source).toContain('--kh-card-radio-focus-color');
    expect(source).toContain('--kh-card-radio-color: #003a6d;');
  });
});
