import { describe, expect, it } from 'vitest';
import { ClassificationMethod } from '$lib/features/commons/stores/visualization.store.svelte';
import {
  normalizeClassificationMethod,
  resolveBreakpointLowerClassCount,
  resolveComputedClassCount,
  resolveHeadTailClassCountMax,
  resolveRequestedClassCount
} from './discretization.utils';

describe('discretization utils', () => {
  it('normalizes unsupported methods to k-means', () => {
    expect(normalizeClassificationMethod('unsupported')).toBe(
      ClassificationMethod.KMEANS
    );
  });

  it('resolves special requested class counts', () => {
    expect(resolveRequestedClassCount(ClassificationMethod.Q6, 3)).toBe(6);
    expect(
      resolveRequestedClassCount(ClassificationMethod.NESTED_MEANS, 7)
    ).toBe(8);
  });

  it('caps computed class count to available classes', () => {
    expect(
      resolveComputedClassCount(ClassificationMethod.QUANTILES, 8, 5)
    ).toBe(5);
  });

  it('keeps diverging breakpoint lower class count in range', () => {
    expect(resolveBreakpointLowerClassCount(5, 99)).toBe(4);
    expect(resolveBreakpointLowerClassCount(5, null)).toBe(2);
  });

  it('uses available head-tail class count when valid', () => {
    expect(resolveHeadTailClassCountMax(9)).toBe(9);
  });
});
