import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { VizSuggestion } from '$lib/features/commons/services/viz-suggester.service';
import VisualizationSuggestionCard from './visualization-suggestion-card.svelte';

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
});
