import { describe, expect, it } from 'vitest';
import { resolveTextLabelPlacement } from '$lib/features/map/utils/text-label-placement.utils';

describe('resolveTextLabelPlacement', () => {
  it('keeps the primary text centered on the centroid when no symbol is rendered', () => {
    expect(
      resolveTextLabelPlacement({
        hasPointSymbol: false,
        pointRadius: 0,
        hasSecondaryLabel: false,
        primaryHeight: 24,
        secondaryHeight: 12
      })
    ).toEqual({
      primaryPixelOffset: [0, 0],
      secondaryPixelOffset: [0, 20]
    });
  });

  it('positions the text stack to the right of the symbol when a symbol is rendered', () => {
    expect(
      resolveTextLabelPlacement({
        hasPointSymbol: true,
        pointRadius: 10,
        hasSecondaryLabel: true,
        primaryHeight: 24,
        secondaryHeight: 12
      })
    ).toEqual({
      primaryPixelOffset: [14, -7],
      secondaryPixelOffset: [14, 13]
    });
  });

  it('keeps a single primary label centered to the right of the symbol when there is no secondary label', () => {
    expect(
      resolveTextLabelPlacement({
        hasPointSymbol: true,
        pointRadius: 10,
        hasSecondaryLabel: false,
        primaryHeight: 24,
        secondaryHeight: 12
      })
    ).toEqual({
      primaryPixelOffset: [14, 0],
      secondaryPixelOffset: [14, 13]
    });
  });

  it('should keep the gap between the two labels when the primary label wraps on two lines', () => {
    const gapBetweenLabels = (primaryHeight: number): number => {
      const { primaryPixelOffset, secondaryPixelOffset } =
        resolveTextLabelPlacement({
          hasPointSymbol: true,
          pointRadius: 10,
          hasSecondaryLabel: true,
          primaryHeight,
          secondaryHeight: 12
        });
      return (
        secondaryPixelOffset[1] -
        6 -
        (primaryPixelOffset[1] + primaryHeight / 2)
      );
    };

    expect(gapBetweenLabels(48)).toBe(gapBetweenLabels(24));
  });
});
