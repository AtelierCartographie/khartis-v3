import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { VizSuggestion } from '$lib/features/commons/services/viz-suggester.service';
import VisualizationSuggestionCard from './visualization-suggestion-card.svelte';

const source = readFileSync(
  resolve(import.meta.dirname, 'visualization-suggestion-card.svelte'),
  'utf8'
);

function createSuggestion(
  overrides: Partial<VizSuggestion> = {}
): VizSuggestion {
  return {
    id: 'lines_colorful_QL',
    label: 'Lignes colorées (qualitatif)',
    nbColumns: 1,
    semioTypes: ['QL'],
    geometries: ['line'],
    columns: ['li_type'],
    score: 98,
    ...overrides
  };
}

describe('VisualizationSuggestionCard', () => {
  it('invokes the explicit activate callback when the card is clicked', async () => {
    const activate = vi.fn();
    const { getAllByRole } = render(VisualizationSuggestionCard, {
      suggestion: createSuggestion(),
      resolveBadgeType: () => 'string',
      activate
    });

    await fireEvent.click(getAllByRole('radio')[0]);

    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('keeps the onclick callback as a backward-compatible fallback', async () => {
    const onclick = vi.fn();
    const { getAllByRole } = render(VisualizationSuggestionCard, {
      suggestion: createSuggestion(),
      resolveBadgeType: () => 'string',
      onclick
    });

    await fireEvent.click(getAllByRole('radio')[0]);

    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('renders variable badges as non-interactive preview content', () => {
    expect(source).toContain('interactive={false}');
  });

  it('uses the static suggestion preview and localized preview label', () => {
    expect(source).toContain(
      "import VisualizationSuggestionPreview from './visualization-suggestion-preview.svelte';"
    );
    expect(source).toContain('label={m.viz_preview_label()}');
    expect(source).toContain('suggestionId={suggestion.id}');
  });

  it('maps hover state to the card token while keeping the preview white', () => {
    expect(source).toContain('--khartis-additions-layer-hover-01-suggestions');
    expect(source).toContain('background: #ffffff;');
    expect(source).toContain('min-height: 120px;');
    expect(source).toContain('align-self: stretch;');
    expect(source).toContain('align-items: center;');
    expect(source).not.toContain(
      '.viz-suggestion-card:hover:not(.disabled) .preview-panel'
    );
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
    expect(source).toContain('--khartis-additions-text-primary-suggestions');
    expect(source).toContain('--khartis-additions-icon-disabled-suggestions');
  });

  it('keeps the card radio accessible without showing duplicate card text', () => {
    expect(source).toContain('labelText={suggestion.label}');
    expect(source).toContain('hideLabel');
  });
});
