import { describe, expect, it } from 'vitest';
import { scaleSymbolMinSize } from './classed-size.utils';

describe('scaleSymbolMinSize', () => {
  it('scales the smallest class by the same factor as the largest', () => {
    expect(scaleSymbolMinSize({ minSize: 5, maxSize: 24 }, 48)).toBe(10);
    expect(scaleSymbolMinSize({ minSize: 5, maxSize: 24 }, 12)).toBe(2.5);
  });

  it('keeps the spread the ramp was created with', () => {
    const nextMaxSize = 37;
    const nextMinSize = scaleSymbolMinSize(
      { minSize: 4, maxSize: 18 },
      nextMaxSize
    );

    expect(nextMinSize).toBeDefined();
    expect((nextMinSize as number) / nextMaxSize).toBeCloseTo(4 / 18);
  });

  it('leaves the minimum alone when there is no ramp to scale', () => {
    expect(scaleSymbolMinSize(undefined, 24)).toBeUndefined();
    expect(scaleSymbolMinSize({ minSize: 5, maxSize: 0 }, 24)).toBeUndefined();
    expect(scaleSymbolMinSize({ minSize: 5, maxSize: 24 }, 0)).toBeUndefined();
  });
});
