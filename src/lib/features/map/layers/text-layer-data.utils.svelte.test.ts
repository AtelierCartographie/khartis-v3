import { describe, expect, it } from 'vitest';
import { SLIDER_LIMITS } from '$lib/features/commons/constants/visualization.constants';
import { resolveVariableTextSizeBounds } from './text-layer-data.utils';

describe('resolveVariableTextSizeBounds', () => {
  it('moves the smallest class with the largest one', () => {
    const small = resolveVariableTextSizeBounds(12);
    const large = resolveVariableTextSizeBounds(24);

    expect(large.maxSize).toBe(24);
    expect(large.minSize).toBeCloseTo(small.minSize * 2);
  });

  it('keeps the same spread at every size', () => {
    const ratios = [8, 12, 20, 40].map((baseSize) => {
      const { minSize, maxSize } = resolveVariableTextSizeBounds(baseSize);
      return minSize / maxSize;
    });

    for (const ratio of ratios) {
      expect(ratio).toBeCloseTo(ratios[0]);
    }
  });

  it('clamps the base size to the slider bounds', () => {
    expect(resolveVariableTextSizeBounds(1).maxSize).toBe(
      SLIDER_LIMITS.textSize.min
    );
    expect(resolveVariableTextSizeBounds(999).maxSize).toBe(
      SLIDER_LIMITS.textSize.max
    );
  });
});
