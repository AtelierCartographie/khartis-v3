import { describe, expect, it } from 'vitest';
import { resolveTextLabelPlacement } from '$lib/features/map/utils/text-label-placement.utils';

describe('resolveTextLabelPlacement', () => {
  it('keeps the primary text centered on the centroid when no symbol is rendered', () => {
    expect(
      resolveTextLabelPlacement({
        hasPointSymbol: false,
        pointRadius: 0,
        hasSecondaryLabel: false,
        primarySize: 24,
        secondarySize: 12,
        paddingY: 2
      })
    ).toEqual({
      primaryAlignmentBaseline: 'center',
      secondaryAlignmentBaseline: 'center',
      primaryPixelOffset: [0, 0],
      secondaryPixelOffset: [0, 22]
    });
  });

  it('positions the text stack to the right of the symbol when a symbol is rendered', () => {
    expect(
      resolveTextLabelPlacement({
        hasPointSymbol: true,
        pointRadius: 10,
        hasSecondaryLabel: true,
        primarySize: 24,
        secondarySize: 12,
        paddingY: 2
      })
    ).toEqual({
      primaryAlignmentBaseline: 'center',
      secondaryAlignmentBaseline: 'center',
      primaryPixelOffset: [14, -9],
      secondaryPixelOffset: [14, 15]
    });
  });

  it('keeps a single primary label centered to the right of the symbol when there is no secondary label', () => {
    expect(
      resolveTextLabelPlacement({
        hasPointSymbol: true,
        pointRadius: 10,
        hasSecondaryLabel: false,
        primarySize: 24,
        secondarySize: 12,
        paddingY: 2
      })
    ).toEqual({
      primaryAlignmentBaseline: 'center',
      secondaryAlignmentBaseline: 'center',
      primaryPixelOffset: [14, 0],
      secondaryPixelOffset: [14, 15]
    });
  });
});
