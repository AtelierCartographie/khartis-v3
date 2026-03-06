import { describe, expect, it } from 'vitest';

import type { ClassificationMethod } from '$lib/features/commons/store/visualization.store.svelte';
import {
  DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX,
  NESTED_MEANS_CLASS_COUNTS,
  normalizeClassificationMethod,
  resolveComputedClassCount,
  resolveHeadTailClassCountMax,
  resolveRequestedClassCount
} from '$lib/features/main-toolbar/visualization-tab/components/discretization.utils';

describe('discretization utils', () => {
  const HEAD_TAIL = 'head_tail' as ClassificationMethod;
  const NESTED_MEANS = 'nested_means' as ClassificationMethod;
  const QUANTILES = 'quantiles' as ClassificationMethod;
  const Q6 = 'q6' as ClassificationMethod;
  const STANDARD_DEVIATION = 'standard_deviation' as ClassificationMethod;

  it('caps head-tail classes to the computed class count', () => {
    expect(resolveComputedClassCount(HEAD_TAIL, 7, 5)).toBe(5);
  });

  it('keeps the requested class count when head-tail can produce enough classes', () => {
    expect(resolveComputedClassCount(HEAD_TAIL, 4, 5)).toBe(4);
  });

  it('does not clamp non head-tail methods to the computed count', () => {
    expect(resolveComputedClassCount(QUANTILES, 7, 5)).toBe(7);
  });

  it('normalizes legacy standard deviation to nested means', () => {
    expect(normalizeClassificationMethod(STANDARD_DEVIATION)).toBe(
      NESTED_MEANS
    );
  });

  it('enforces fixed and constrained class counts', () => {
    expect(resolveRequestedClassCount(Q6, 12)).toBe(6);
    expect(resolveRequestedClassCount(NESTED_MEANS, 5)).toBe(4);
    expect(resolveRequestedClassCount(STANDARD_DEVIATION, 9)).toBe(8);
  });

  it('exposes nested-means options and head-tail max fallback values', () => {
    expect(NESTED_MEANS_CLASS_COUNTS).toEqual([2, 4, 8, 16]);
    expect(resolveHeadTailClassCountMax(5)).toBe(5);
    expect(resolveHeadTailClassCountMax(undefined)).toBe(
      DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX
    );
  });
});
