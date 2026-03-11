import { describe, expect, it } from 'vitest';

import { resolveTooltipViewportPosition } from '$lib/features/map/utils/tooltip-position';

describe('resolveTooltipViewportPosition', () => {
  it('adds the map viewport origin to deck-local coordinates', () => {
    expect(
      resolveTooltipViewportPosition({
        anchor: { x: 120, y: 180 },
        viewportOrigin: { left: 240, top: 100 },
        tooltipSize: { width: 180, height: 90 },
        viewportSize: { width: 1440, height: 900 },
        offsetX: 12,
        offsetY: 12,
        padding: 8
      })
    ).toEqual({ left: 372, top: 292 });
  });

  it('flips around the pointer when the tooltip would overflow the window', () => {
    expect(
      resolveTooltipViewportPosition({
        anchor: { x: 220, y: 180 },
        viewportOrigin: { left: 900, top: 620 },
        tooltipSize: { width: 280, height: 160 },
        viewportSize: { width: 1280, height: 900 },
        offsetX: 12,
        offsetY: 12,
        padding: 8
      })
    ).toEqual({ left: 828, top: 628 });
  });

  it('clamps to viewport padding when even the flipped position is outside', () => {
    expect(
      resolveTooltipViewportPosition({
        anchor: { x: 4, y: 6 },
        viewportOrigin: { left: 10, top: 12 },
        tooltipSize: { width: 120, height: 100 },
        viewportSize: { width: 100, height: 90 },
        offsetX: 12,
        offsetY: 12,
        padding: 8
      })
    ).toEqual({ left: 8, top: 8 });
  });
});
