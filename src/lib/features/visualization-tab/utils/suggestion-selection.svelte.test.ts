import { describe, expect, it } from 'vitest';
import type { VizSuggestion } from '$lib/features/commons/services/viz-suggester.service';
import {
  getSuggestionSignature,
  includePersistedSuggestion,
  parseSuggestionSignature,
  resolveDisplayedSuggestionKey,
  resolveSuggestionCardAction,
  shouldAutoApplySuggestion,
  shouldIncludePersistedSuggestion
} from './suggestion-selection.utils';

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

  it('round-trips persisted suggestion signatures', () => {
    const suggestion = createSuggestion();
    const parsed = parseSuggestionSignature(getSuggestionSignature(suggestion));

    expect(parsed).toMatchObject({
      id: suggestion.id,
      label: suggestion.id,
      nbColumns: suggestion.nbColumns,
      columns: suggestion.columns,
      geometries: suggestion.geometries,
      semioTypes: suggestion.semioTypes
    });
  });

  it('prepends a persisted suggestion when the generated list no longer contains it', () => {
    const persistedSuggestion = createSuggestion();
    const generatedSuggestion = createSuggestion({
      id: 'symbols_proportional',
      nbColumns: 1,
      columns: ['population'],
      geometries: ['polygon'],
      semioTypes: ['QTA']
    });

    const suggestions = includePersistedSuggestion(
      [generatedSuggestion],
      getSuggestionSignature(persistedSuggestion),
      'polygon'
    );

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toMatchObject({
      id: 'choropleth',
      columns: ['population'],
      dataGeometry: 'polygon'
    });
  });

  it('does not duplicate an already generated persisted suggestion', () => {
    const suggestion = createSuggestion();

    expect(
      includePersistedSuggestion(
        [suggestion],
        getSuggestionSignature(suggestion)
      )
    ).toEqual([suggestion]);
  });
});

describe('shouldIncludePersistedSuggestion', () => {
  it('keeps auto and manual suggestion cards when they are backed by origin', () => {
    expect(
      shouldIncludePersistedSuggestion({
        hasPersistedSuggestionKey: true,
        originMode: 'auto-suggestion'
      })
    ).toBe(true);
    expect(
      shouldIncludePersistedSuggestion({
        hasPersistedSuggestionKey: true,
        originMode: 'manual-suggestion'
      })
    ).toBe(true);
  });

  it('keeps a cleared suggestion card only when remembered state can reapply it', () => {
    expect(
      shouldIncludePersistedSuggestion({
        hasAppliedSuggestionState: true,
        hasPersistedSuggestionKey: true,
        originMode: 'manual-blank'
      })
    ).toBe(true);
    expect(
      shouldIncludePersistedSuggestion({
        hasAppliedSuggestionState: false,
        hasPersistedSuggestionKey: true,
        originMode: 'manual-blank'
      })
    ).toBe(false);
  });

  it('does not keep custom or missing persisted suggestion cards', () => {
    expect(
      shouldIncludePersistedSuggestion({
        hasAppliedSuggestionState: true,
        hasPersistedSuggestionKey: true,
        originMode: 'custom'
      })
    ).toBe(false);
    expect(
      shouldIncludePersistedSuggestion({
        hasAppliedSuggestionState: true,
        hasPersistedSuggestionKey: false,
        originMode: 'manual-suggestion'
      })
    ).toBe(false);
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

  it('clears in one click when the visualization is still suggestion-managed', () => {
    const suggestion = createSuggestion();

    expect(
      resolveSuggestionCardAction(
        {
          displayedSuggestionKey: undefined,
          originSuggestionKey: getSuggestionSignature(suggestion),
          originMode: 'manual-suggestion',
          hasRestoreState: true
        },
        suggestion
      )
    ).toBe('clear');
  });

  it('re-applies when a manual edit diverged the visualization into custom mode', () => {
    const suggestion = createSuggestion();

    expect(
      resolveSuggestionCardAction(
        {
          displayedSuggestionKey: undefined,
          originSuggestionKey: getSuggestionSignature(suggestion),
          originMode: 'custom',
          hasRestoreState: true
        },
        suggestion
      )
    ).toBe('apply');
  });

  it('re-applies instead of clearing when the target visualization is inactive', () => {
    const suggestion = createSuggestion();

    expect(
      resolveSuggestionCardAction(
        {
          displayedSuggestionKey: getSuggestionSignature(suggestion),
          originSuggestionKey: getSuggestionSignature(suggestion),
          hasRestoreState: true,
          isTargetActive: false
        },
        suggestion
      )
    ).toBe('apply');
  });

  it('re-applies the same origin suggestion when no restore state is available', () => {
    const suggestion = createSuggestion();

    expect(
      resolveSuggestionCardAction(
        {
          displayedSuggestionKey: undefined,
          originSuggestionKey: getSuggestionSignature(suggestion),
          hasRestoreState: false
        },
        suggestion
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

  it('does not auto-apply over a restored persisted suggestion', () => {
    expect(
      shouldAutoApplySuggestion({
        hasPersistedSuggestionKey: true,
        suggestionCount: 1,
        visualizationCount: 1,
        targetVisualizationOriginMode: 'auto-suggestion'
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

  it('suppresses the matched suggestion when the origin has been explicitly cleared (manual-blank)', () => {
    expect(
      resolveDisplayedSuggestionKey({
        matchedSuggestionKey: 'matched',
        originMode: 'manual-blank'
      })
    ).toBeUndefined();
  });

  it('suppresses the matched suggestion when the viz has diverged into custom mode', () => {
    expect(
      resolveDisplayedSuggestionKey({
        matchedSuggestionKey: 'matched',
        originMode: 'custom'
      })
    ).toBeUndefined();
  });

  it('clears the persisted key once the viz diverges into custom (a manual edit unchecks the suggestion)', () => {
    expect(
      resolveDisplayedSuggestionKey({
        persistedSuggestionKey: 'persisted',
        matchedSuggestionKey: 'matched',
        originMode: 'custom'
      })
    ).toBeUndefined();
  });
});
