import { describe, it, expect, vi } from 'vitest';

vi.mock('./use-classification-breaks.svelte', () => ({
  CLASSIFICATION_BREAKS_TRIGGER: {
    MISSING_BREAKS: 'missing-breaks',
    CLASSIFICATION_PARAMS_CHANGED: 'classification-params-changed'
  }
}));

import {
  resolveBreaksTrigger,
  shouldFetchCategoryLabels
} from './breaks-trigger.utils';

describe('resolveBreaksTrigger', () => {
  it('returns null when usesBreaks is false', () => {
    expect(
      resolveBreaksTrigger({
        usesBreaks: false,
        valueColumn: 'col',
        classification: { method: 'jenks' } as never
      })
    ).toBeNull();
  });

  it('returns null when valueColumn is missing', () => {
    expect(
      resolveBreaksTrigger({
        usesBreaks: true,
        valueColumn: undefined,
        classification: { method: 'jenks' } as never
      })
    ).toBeNull();
  });

  it('returns null when classification has no method', () => {
    expect(
      resolveBreaksTrigger({
        usesBreaks: true,
        valueColumn: 'col',
        classification: undefined
      })
    ).toBeNull();
  });

  it('returns MISSING_BREAKS when no breaks are computed yet', () => {
    expect(
      resolveBreaksTrigger({
        usesBreaks: true,
        valueColumn: 'col',
        classification: { method: 'jenks', breaks: [] } as never
      })
    ).toBe('missing-breaks');
  });

  it('returns CLASSIFICATION_PARAMS_CHANGED when breaks exist + numClasses set', () => {
    expect(
      resolveBreaksTrigger({
        usesBreaks: true,
        valueColumn: 'col',
        classification: {
          method: 'jenks',
          breaks: [1, 2],
          numClasses: 3
        } as never
      })
    ).toBe('classification-params-changed');
  });
});

describe('shouldFetchCategoryLabels', () => {
  it('returns false for null/undefined', () => {
    expect(shouldFetchCategoryLabels(null)).toBe(false);
    expect(shouldFetchCategoryLabels(undefined)).toBe(false);
  });

  it('returns false when usesCategories is false', () => {
    expect(
      shouldFetchCategoryLabels({
        usesCategories: false,
        categoryColumn: 'col'
      })
    ).toBe(false);
  });

  it('returns false when categoryColumn is missing', () => {
    expect(
      shouldFetchCategoryLabels({
        usesCategories: true,
        categoryColumn: undefined
      })
    ).toBe(false);
  });

  it('returns false when labels already exist', () => {
    expect(
      shouldFetchCategoryLabels({
        usesCategories: true,
        categoryColumn: 'col',
        classification: { labels: ['A', 'B'] } as never
      })
    ).toBe(false);
  });

  it('returns true when labels are empty and column is set', () => {
    expect(
      shouldFetchCategoryLabels({
        usesCategories: true,
        categoryColumn: 'col',
        classification: undefined
      })
    ).toBe(true);
  });
});
