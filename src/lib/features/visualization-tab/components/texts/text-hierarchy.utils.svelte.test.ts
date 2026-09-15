import { describe, expect, it } from 'vitest';
import { MIN_FONT_SIZE } from '$lib/features/step-toolbar/fonts.constants';
import {
  TEXT_HIERARCHY,
  resolveSecondaryTextSize,
  resolveTextHierarchy
} from './text-hierarchy.utils';

describe('resolveSecondaryTextSize', () => {
  it('keeps both texts at the same size on an equal hierarchy', () => {
    expect(resolveSecondaryTextSize(20, TEXT_HIERARCHY.EQUAL)).toBe(20);
  });

  it('shrinks the secondary text as the hierarchy strengthens', () => {
    expect(resolveSecondaryTextSize(20, TEXT_HIERARCHY.MODERATE)).toBe(15);
    expect(resolveSecondaryTextSize(20, TEXT_HIERARCHY.STRONG)).toBe(11);
  });

  it('never drops the secondary text below the legibility floor', () => {
    expect(resolveSecondaryTextSize(MIN_FONT_SIZE, TEXT_HIERARCHY.STRONG)).toBe(
      MIN_FONT_SIZE
    );
  });
});

describe('resolveTextHierarchy', () => {
  it('reads the hierarchy back from the two sizes', () => {
    expect(resolveTextHierarchy(20, 20)).toBe(TEXT_HIERARCHY.EQUAL);
    expect(resolveTextHierarchy(20, 15)).toBe(TEXT_HIERARCHY.MODERATE);
    expect(resolveTextHierarchy(20, 11)).toBe(TEXT_HIERARCHY.STRONG);
  });

  it('snaps a ratio that no preset produces to the closest one', () => {
    expect(resolveTextHierarchy(9, 8)).toBe(TEXT_HIERARCHY.EQUAL);
    expect(resolveTextHierarchy(20, 13)).toBe(TEXT_HIERARCHY.MODERATE);
  });

  it('falls back to an equal hierarchy when a size is missing', () => {
    expect(resolveTextHierarchy(0, 8)).toBe(TEXT_HIERARCHY.EQUAL);
  });
});

describe('a size change applied through the hierarchy', () => {
  it('keeps the ratio between the two texts', () => {
    const ratios = [12, 20, 40].map(
      (primarySize) =>
        resolveSecondaryTextSize(primarySize, TEXT_HIERARCHY.MODERATE) /
        primarySize
    );

    for (const ratio of ratios) {
      expect(ratio).toBeCloseTo(ratios[0]);
    }
  });
});
