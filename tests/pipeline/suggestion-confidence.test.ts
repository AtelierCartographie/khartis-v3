import { describe, expect, it } from 'vitest';
import { hasConfidentTopSuggestion } from '$lib/features/commons/services/suggestion-confidence';

describe('hasConfidentTopSuggestion', () => {
  it('returns false when the list is empty', () => {
    expect(hasConfidentTopSuggestion([])).toBe(false);
  });

  it('returns true when there is a single suggestion', () => {
    expect(hasConfidentTopSuggestion([42])).toBe(true);
  });

  it('returns true when the top is strictly higher than the runner-up', () => {
    expect(hasConfidentTopSuggestion([100, 80, 60])).toBe(true);
  });

  it('returns false when the top ties with another suggestion (default epsilon)', () => {
    expect(hasConfidentTopSuggestion([100, 100, 80])).toBe(false);
  });

  it('returns false when the top and runner-up differ by less than epsilon', () => {
    expect(hasConfidentTopSuggestion([100, 99.9999])).toBe(false);
    expect(hasConfidentTopSuggestion([100, 99.9999], { epsilon: 1e-6 })).toBe(
      true
    );
  });

  it('returns false when top is below minScore', () => {
    expect(hasConfidentTopSuggestion([10, 5, 1], { minScore: 50 })).toBe(false);
    expect(hasConfidentTopSuggestion([60, 5, 1], { minScore: 50 })).toBe(true);
  });

  it('returns false when the top is non-finite', () => {
    expect(hasConfidentTopSuggestion([NaN, 50])).toBe(false);
    expect(hasConfidentTopSuggestion([Infinity, 50])).toBe(false);
  });

  it('ignores non-finite values among the runners-up', () => {
    expect(hasConfidentTopSuggestion([100, NaN, 50])).toBe(true);
  });

  it('respects a custom epsilon for stricter tie detection', () => {
    expect(hasConfidentTopSuggestion([100, 95], { epsilon: 10 })).toBe(false);
    expect(hasConfidentTopSuggestion([100, 95], { epsilon: 1 })).toBe(true);
  });

  it('handles the NUTS2 case (Europe NUTS 2/Monde/NUTS 1 all at 100 %)', () => {
    // After granularity sort the top is now NUTS 2; even with NUTS 1 + Monde tied,
    // we want auto-selection to be blocked because they all share the same top score.
    expect(hasConfidentTopSuggestion([100, 100, 100, 99.7])).toBe(false);
  });

  it('handles the textual France case (region code dataset)', () => {
    // After computeJoinSynthesis on a region code, only france-region matches (100 %)
    // and other basemaps fall sharply: clearly confident.
    expect(hasConfidentTopSuggestion([100, 12, 4])).toBe(true);
  });
});
