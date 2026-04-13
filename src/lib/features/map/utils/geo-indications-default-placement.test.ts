import { describe, expect, it } from 'vitest';
import { LegendPosition } from '$lib/features/commons/constants/ui.constants';
import {
  getDefaultInsetStyle,
  getDefaultOrientationStyle,
  getDefaultScaleStyle,
  type GeoIndicationsPlacementContext
} from './geo-indications-default-placement';

function createContext(
  overrides: Partial<GeoIndicationsPlacementContext> = {}
): GeoIndicationsPlacementContext {
  return {
    legendVisible: true,
    legendPosition: LegendPosition.TOP_RIGHT,
    legendDragged: false,
    scaleEnabled: true,
    scaleDragged: false,
    ...overrides
  };
}

describe('geo indications default placement', () => {
  it('moves orientation and inset away from a default top-right legend', () => {
    const context = createContext();

    expect(getDefaultScaleStyle(context)).toContain('left: 16px;');
    expect(getDefaultOrientationStyle(context)).toContain('left: 16px;');
    expect(getDefaultOrientationStyle(context)).toContain('top: 16px;');
    expect(getDefaultInsetStyle(context)).toContain('left: 16px;');
    expect(getDefaultInsetStyle(context)).toContain('bottom: 82px;');
  });

  it('mirrors defaults when the legend sits on the left side', () => {
    const context = createContext({
      legendPosition: LegendPosition.BOTTOM_LEFT
    });

    expect(getDefaultScaleStyle(context)).toContain('right: 16px;');
    expect(getDefaultOrientationStyle(context)).toContain('right: 16px;');
    expect(getDefaultInsetStyle(context)).toContain('right: 16px;');
    expect(getDefaultInsetStyle(context)).toContain('bottom: 82px;');
  });

  it('keeps legacy defaults when the legend is hidden or already dragged', () => {
    const hiddenLegend = createContext({ legendVisible: false });
    const draggedLegend = createContext({ legendDragged: true });

    expect(getDefaultOrientationStyle(hiddenLegend)).toContain('right: 16px;');
    expect(getDefaultInsetStyle(hiddenLegend)).toContain('right: 16px;');
    expect(getDefaultOrientationStyle(draggedLegend)).toContain('right: 16px;');
    expect(getDefaultInsetStyle(draggedLegend)).toContain('right: 16px;');
  });

  it('does not add an inset stack offset once the scale was manually dragged away', () => {
    const context = createContext({ scaleDragged: true });

    expect(getDefaultInsetStyle(context)).toContain('bottom: 16px;');
  });
});
