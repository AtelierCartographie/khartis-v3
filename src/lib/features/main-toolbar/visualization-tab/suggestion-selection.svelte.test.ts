import { describe, expect, it } from 'vitest';
import type { VizSuggestion } from '$lib/features/commons/services/viz-suggester.service';
import {
  getSuggestionSignature,
  resolveDisplayedSuggestionKey,
  resolveSuggestionCardAction,
  shouldAutoApplySuggestion
} from './suggestion-selection';

function createSuggestion(
  overrides: Partial<VizSuggestion> = {}
): VizSuggestion {
  return {
    id: 'choropleth',
    label: 'Choropleth',
    nbColumns: 1,
    semioTypes: ['QTR'],
    geometries: ['polygon'],
    columns: ['population'],
    score: 92,
    ...overrides
  };
}

describe('getSuggestionSignature', () => {
  it('differentiates suggestions that share an id but not the same columns', () => {
    const population = createSuggestion();
    const density = createSuggestion({ columns: ['density'] });

    expect(getSuggestionSignature(population)).not.toBe(
      getSuggestionSignature(density)
    );
  });
});

describe('resolveSuggestionCardAction', () => {
  it('clears only when the exact same suggestion is clicked again', () => {
    const suggestion = createSuggestion();

    expect(
      resolveSuggestionCardAction(
        getSuggestionSignature(suggestion),
        suggestion
      )
    ).toBe('clear');
  });

  it('re-applies when the suggestion id is the same but the mapped columns changed', () => {
    const previouslyApplied = createSuggestion();
    const nextSuggestion = createSuggestion({ columns: ['density'] });

    expect(
      resolveSuggestionCardAction(
        getSuggestionSignature(previouslyApplied),
        nextSuggestion
      )
    ).toBe('apply');
  });
});

describe('shouldAutoApplySuggestion', () => {
  it('auto-applies the top suggestion only for the auto-managed visualization', () => {
    expect(
      shouldAutoApplySuggestion({
        suggestionCount: 2,
        visualizationCount: 1,
        targetVisualizationOriginMode: 'auto-suggestion'
      })
    ).toBe(true);
  });

  it('blocks auto-apply for manual blank, custom, and legacy states', () => {
    expect(
      shouldAutoApplySuggestion({
        suggestionCount: 2,
        visualizationCount: 1,
        targetVisualizationOriginMode: 'manual-blank'
      })
    ).toBe(false);

    expect(
      shouldAutoApplySuggestion({
        suggestionCount: 1,
        visualizationCount: 1,
        targetVisualizationOriginMode: 'custom'
      })
    ).toBe(false);

    expect(
      shouldAutoApplySuggestion({
        suggestionCount: 1,
        visualizationCount: 1,
        targetVisualizationOriginMode: 'legacy'
      })
    ).toBe(false);
  });
});

describe('resolveDisplayedSuggestionKey', () => {
  it('prefers the in-memory selected suggestion key', () => {
    expect(
      resolveDisplayedSuggestionKey({
        selectedSuggestionKey: 'selected',
        persistedSuggestionKey: 'persisted',
        matchedSuggestionKey: 'matched'
      })
    ).toBe('selected');
  });

  it('falls back to the persisted origin suggestion key', () => {
    expect(
      resolveDisplayedSuggestionKey({
        persistedSuggestionKey: 'persisted',
        matchedSuggestionKey: 'matched'
      })
    ).toBe('persisted');
  });

  it('falls back to the matched suggestion when nothing else is set', () => {
    expect(
      resolveDisplayedSuggestionKey({
        matchedSuggestionKey: 'matched'
      })
    ).toBe('matched');
  });
});
