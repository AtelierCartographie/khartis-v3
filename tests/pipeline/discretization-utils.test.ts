import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  ClassificationMethod: {
    EQUAL_INTERVAL: 'equal_interval',
    QUANTILES: 'quantiles',
    KMEANS: 'kmeans',
    MANUAL: 'manual',
    Q6: 'q6',
    NESTED_MEANS: 'nested_means',
    HEAD_TAIL: 'head_tail'
  }
}));

import {
  DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX,
  normalizeClassificationMethod,
  resolveBreakpointLowerClassCount,
  resolveComputedClassCount,
  resolveHeadTailClassCountMax,
  resolveNestedMeansClassCount,
  resolveRequestedClassCount
} from '$lib/features/visualization-tab/components/discretization/discretization.utils';

// ─── normalizeClassificationMethod ────────────────────────────────────────

describe('normalizeClassificationMethod', () => {
  it('normalizes legacy standard_deviation to kmeans', () => {
    expect(normalizeClassificationMethod('standard_deviation' as never)).toBe(
      'kmeans'
    );
  });

  it('normalizes legacy jenks to kmeans', () => {
    expect(normalizeClassificationMethod('jenks' as never)).toBe('kmeans');
  });

  it('passes through every other method unchanged', () => {
    expect(normalizeClassificationMethod('kmeans' as never)).toBe('kmeans');
    expect(normalizeClassificationMethod('quantiles' as never)).toBe(
      'quantiles'
    );
    expect(normalizeClassificationMethod('q6' as never)).toBe('q6');
    expect(normalizeClassificationMethod('head_tail' as never)).toBe(
      'head_tail'
    );
    expect(normalizeClassificationMethod('nested_means' as never)).toBe(
      'nested_means'
    );
  });
});

// ─── resolveNestedMeansClassCount ─────────────────────────────────────────

describe('resolveNestedMeansClassCount', () => {
  it('snaps to the closest value of [2, 4, 8, 16]', () => {
    expect(resolveNestedMeansClassCount(2)).toBe(2);
    expect(resolveNestedMeansClassCount(3)).toBe(2);
    expect(resolveNestedMeansClassCount(5)).toBe(4);
    expect(resolveNestedMeansClassCount(7)).toBe(8);
    expect(resolveNestedMeansClassCount(10)).toBe(8);
    expect(resolveNestedMeansClassCount(13)).toBe(16);
    expect(resolveNestedMeansClassCount(100)).toBe(16);
  });

  it('clamps requests below 2 up to 2', () => {
    expect(resolveNestedMeansClassCount(0)).toBe(2);
    expect(resolveNestedMeansClassCount(1)).toBe(2);
    expect(resolveNestedMeansClassCount(-5)).toBe(2);
  });

  it('floors non-integer requests before snapping', () => {
    expect(resolveNestedMeansClassCount(4.9)).toBe(4);
  });
});

// ─── resolveRequestedClassCount ───────────────────────────────────────────

describe('resolveRequestedClassCount', () => {
  it('always returns 6 for q6', () => {
    expect(resolveRequestedClassCount('q6' as never, 3)).toBe(6);
    expect(resolveRequestedClassCount('q6' as never, 100)).toBe(6);
  });

  it('snaps to nested-means scale for nested_means', () => {
    expect(resolveRequestedClassCount('nested_means' as never, 5)).toBe(4);
    expect(resolveRequestedClassCount('nested_means' as never, 10)).toBe(8);
  });

  it('keeps requested class count for kmeans', () => {
    expect(resolveRequestedClassCount('kmeans' as never, 5)).toBe(5);
  });

  it('keeps requested class count for legacy standard_deviation after normalization', () => {
    expect(resolveRequestedClassCount('standard_deviation' as never, 5)).toBe(
      5
    );
  });

  it('returns the request as-is for quantiles / equal_interval', () => {
    expect(resolveRequestedClassCount('quantiles' as never, 7)).toBe(7);
    expect(resolveRequestedClassCount('equal_interval' as never, 5)).toBe(5);
  });

  it('clamps requests below 2 up to 2', () => {
    expect(resolveRequestedClassCount('quantiles' as never, 1)).toBe(2);
    expect(resolveRequestedClassCount('quantiles' as never, 0)).toBe(2);
  });
});

// ─── resolveComputedClassCount ────────────────────────────────────────────

describe('resolveComputedClassCount', () => {
  it('returns min(requested, actual) for head_tail with valid actualClassCount', () => {
    expect(resolveComputedClassCount('head_tail' as never, 10, 5)).toBe(5);
    expect(resolveComputedClassCount('head_tail' as never, 3, 5)).toBe(3);
  });

  it('returns requested for head_tail when actualClassCount is invalid', () => {
    expect(resolveComputedClassCount('head_tail' as never, 5, NaN)).toBe(5);
    expect(resolveComputedClassCount('head_tail' as never, 5, 1)).toBe(5);
  });

  it('returns requested for non-head_tail methods regardless of actual', () => {
    expect(resolveComputedClassCount('quantiles' as never, 7, 3)).toBe(7);
  });

  it('returns requested for legacy standard_deviation after normalization', () => {
    expect(resolveComputedClassCount('standard_deviation' as never, 5, 4)).toBe(
      5
    );
  });
});

// ─── resolveBreakpointLowerClassCount ────────────────────────────────────

describe('resolveBreakpointLowerClassCount', () => {
  it('defaults to the lower half of the total class count', () => {
    expect(resolveBreakpointLowerClassCount(5)).toBe(2);
    expect(resolveBreakpointLowerClassCount(4)).toBe(2);
  });

  it('clamps the split to one class on each side', () => {
    expect(resolveBreakpointLowerClassCount(5, 0)).toBe(1);
    expect(resolveBreakpointLowerClassCount(5, 9)).toBe(4);
  });

  it('floors non-integer lower class requests', () => {
    expect(resolveBreakpointLowerClassCount(5, 3.9)).toBe(3);
  });
});

// ─── resolveHeadTailClassCountMax ─────────────────────────────────────────

describe('resolveHeadTailClassCountMax', () => {
  it('returns floor(actualClassCount) when valid and >= 2', () => {
    expect(resolveHeadTailClassCountMax(7)).toBe(7);
    expect(resolveHeadTailClassCountMax(5.9)).toBe(5);
  });

  it('returns the default max when actualClassCount is invalid', () => {
    expect(resolveHeadTailClassCountMax(null)).toBe(
      DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX
    );
    expect(resolveHeadTailClassCountMax(undefined)).toBe(
      DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX
    );
    expect(resolveHeadTailClassCountMax(1)).toBe(
      DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX
    );
    expect(resolveHeadTailClassCountMax(NaN)).toBe(
      DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX
    );
  });
});
