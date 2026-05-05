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

  it('positions the text stack above the symbol when a symbol is rendered', () => {
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
      primaryAlignmentBaseline: 'bottom',
      secondaryAlignmentBaseline: 'bottom',
      primaryPixelOffset: [0, -32],
      secondaryPixelOffset: [0, -14]
    });
  });

  it('keeps a single primary label just above the symbol when there is no secondary label', () => {
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
      primaryAlignmentBaseline: 'bottom',
      secondaryAlignmentBaseline: 'bottom',
      primaryPixelOffset: [0, -14],
      secondaryPixelOffset: [0, -14]
    });
  });
});
