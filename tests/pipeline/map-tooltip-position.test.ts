import { describe, expect, it } from 'vitest';

import { resolveTooltipViewportPosition } from '$lib/features/map/utils/tooltip-position';

describe('resolveTooltipViewportPosition', () => {
  it('positions the tooltip above the viewer when there is enough room', () => {
    expect(
      resolveTooltipViewportPosition({
        viewerRect: { left: 240, top: 260, width: 800, height: 500 },
        tooltipSize: { width: 180, height: 90 },
        viewportSize: { width: 1440, height: 900 },
        padding: 8,
        gap: 12
      })
    ).toEqual({ left: 248, top: 158 });
  });

  it('falls back inside the viewer when there is not enough room above it', () => {
    expect(
      resolveTooltipViewportPosition({
        viewerRect: { left: 240, top: 72, width: 800, height: 500 },
        tooltipSize: { width: 180, height: 90 },
        viewportSize: { width: 1440, height: 900 },
        padding: 8,
        gap: 12
      })
    ).toEqual({ left: 248, top: 80 });
  });

  it('clamps the tooltip horizontally when the viewer starts too far right', () => {
    expect(
      resolveTooltipViewportPosition({
        viewerRect: { left: 1130, top: 260, width: 320, height: 500 },
        tooltipSize: { width: 220, height: 90 },
        viewportSize: { width: 1280, height: 900 },
        padding: 8,
        gap: 12
      })
    ).toEqual({ left: 1052, top: 158 });
  });

  it('keeps the tooltip inside viewport padding even without a viewer rect', () => {
    expect(
      resolveTooltipViewportPosition({
        viewerRect: null,
        tooltipSize: { width: 120, height: 100 },
        viewportSize: { width: 100, height: 90 },
        padding: 8,
        gap: 12
      })
    ).toEqual({ left: 8, top: 8 });
  });
});
