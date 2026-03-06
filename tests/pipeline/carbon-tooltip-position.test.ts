import { describe, expect, it } from 'vitest';

import { resolveCarbonTooltipPosition } from '$lib/features/commons/utils/carbon-tooltip-position';

describe('resolveCarbonTooltipPosition', () => {
  it('positions a right-aligned tooltip next to the trigger', () => {
    expect(
      resolveCarbonTooltipPosition({
        triggerRect: {
          top: 120,
          left: 24,
          right: 56,
          bottom: 152,
          width: 32,
          height: 32
        },
        tooltipSize: {
          width: 112,
          height: 28
        },
        direction: 'right',
        align: 'center',
        viewport: {
          width: 1440,
          height: 900
        }
      })
    ).toEqual({
      top: 122,
      left: 64,
      caretTop: 14
    });
  });

  it('clamps horizontal position and keeps the caret pointing at the trigger', () => {
    expect(
      resolveCarbonTooltipPosition({
        triggerRect: {
          top: 48,
          left: 8,
          right: 40,
          bottom: 80,
          width: 32,
          height: 32
        },
        tooltipSize: {
          width: 180,
          height: 40
        },
        direction: 'top',
        align: 'center',
        viewport: {
          width: 160,
          height: 120
        }
      })
    ).toEqual({
      top: 8,
      left: 8,
      caretLeft: 16
    });
  });

  it('supports end alignment on vertical tooltips', () => {
    expect(
      resolveCarbonTooltipPosition({
        triggerRect: {
          top: 300,
          left: 400,
          right: 432,
          bottom: 332,
          width: 32,
          height: 32
        },
        tooltipSize: {
          width: 96,
          height: 30
        },
        direction: 'bottom',
        align: 'end',
        viewport: {
          width: 1200,
          height: 900
        }
      })
    ).toEqual({
      top: 340,
      left: 368,
      caretLeft: 48
    });
  });
});
