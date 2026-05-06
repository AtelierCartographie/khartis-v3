import { describe, expect, it } from 'vitest';
import { resolveTooltipViewportPosition } from './tooltip-position.utils';

describe('resolveTooltipViewportPosition', () => {
  it('anchors the tooltip to the viewer right edge above the viewer when enough space is available', () => {
    const position = resolveTooltipViewportPosition({
      viewerRect: {
        left: 120,
        top: 220,
        width: 600,
        height: 400
      },
      tooltipSize: {
        width: 240,
        height: 120
      },
      viewportSize: {
        width: 1440,
        height: 900
      },
      padding: 8,
      gap: 12
    });

    expect(position).toEqual({
      left: 472,
      top: 88
    });
  });

  it('keeps the tooltip aligned to the viewer right edge and clamps it to the viewport top when needed', () => {
    const position = resolveTooltipViewportPosition({
      viewerRect: {
        left: 120,
        top: 64,
        width: 600,
        height: 400
      },
      tooltipSize: {
        width: 240,
        height: 120
      },
      viewportSize: {
        width: 1440,
        height: 900
      },
      padding: 8,
      gap: 12
    });

    expect(position).toEqual({
      left: 472,
      top: 8
    });
  });

  it('anchors the interactive inspector inside the viewer top edge to stay below the navbar', () => {
    const position = resolveTooltipViewportPosition({
      viewerRect: {
        left: 120,
        top: 64,
        width: 600,
        height: 400
      },
      tooltipSize: {
        width: 240,
        height: 272
      },
      viewportSize: {
        width: 1440,
        height: 900
      },
      padding: 8,
      gap: 12,
      placement: 'inside-viewer-top'
    });

    expect(position).toEqual({
      left: 472,
      top: 72
    });
  });

  it('clamps the tooltip horizontally to the viewport padding', () => {
    const position = resolveTooltipViewportPosition({
      viewerRect: {
        left: 20,
        top: 180,
        width: 600,
        height: 400
      },
      tooltipSize: {
        width: 360,
        height: 100
      },
      viewportSize: {
        width: 320,
        height: 640
      },
      padding: 8,
      gap: 12
    });

    expect(position).toEqual({
      left: 8,
      top: 68
    });
  });
});
