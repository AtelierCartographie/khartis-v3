import { describe, expect, it } from 'vitest';
import { LegendPosition } from '$lib/features/commons/constants/ui.constants';
import {
  getDefaultInsetStyle,
  getDefaultOrientationStyle,
  getDefaultScaleStyle,
  type GeoIndicationsPlacementContext
} from './geo-indications-default-placement.utils';

function createContext(
  overrides: Partial<GeoIndicationsPlacementContext> = {}
): GeoIndicationsPlacementContext {
  return {
    legendVisible: true,
    legendPosition: LegendPosition.TOP_RIGHT,
    legendDragged: false,
    scaleEnabled: true,
    scaleDragged: false,
    orientationEnabled: true,
    orientationDragged: false,
    pageScale: 1,
    ...overrides
  };
}

describe('geo indications default placement', () => {
  it('scales the default stack homothetically with the page zoom', () => {
    const context = createContext({ pageScale: 2 });

    expect(getDefaultScaleStyle(context)).toContain('left: 48px;');
    expect(getDefaultScaleStyle(context)).toContain('bottom: 48px;');
    expect(getDefaultOrientationStyle(context)).toContain('bottom: 152px;');
    expect(getDefaultInsetStyle(context)).toContain('bottom: 256px;');
  });

  it('stacks scale, orientation and inset in the lower-left area away from the title and legend', () => {
    const context = createContext();

    expect(getDefaultScaleStyle(context)).toContain('left: 24px;');
    expect(getDefaultScaleStyle(context)).toContain('bottom: 24px;');
    expect(getDefaultOrientationStyle(context)).toContain('left: 24px;');
    expect(getDefaultOrientationStyle(context)).toContain('bottom: 76px;');
    expect(getDefaultInsetStyle(context)).toContain('left: 24px;');
    expect(getDefaultInsetStyle(context)).toContain('bottom: 128px;');
  });

  it('mirrors defaults when the legend sits on the left side', () => {
    const context = createContext({
      legendPosition: LegendPosition.BOTTOM_LEFT
    });

    expect(getDefaultScaleStyle(context)).toContain('right: 24px;');
    expect(getDefaultOrientationStyle(context)).toContain('right: 24px;');
    expect(getDefaultOrientationStyle(context)).toContain('bottom: 76px;');
    expect(getDefaultInsetStyle(context)).toContain('right: 24px;');
    expect(getDefaultInsetStyle(context)).toContain('bottom: 128px;');
  });

  it('keeps the lower-left stack when the legend is hidden or already dragged', () => {
    const hiddenLegend = createContext({ legendVisible: false });
    const draggedLegend = createContext({ legendDragged: true });

    expect(getDefaultOrientationStyle(hiddenLegend)).toContain('left: 24px;');
    expect(getDefaultInsetStyle(hiddenLegend)).toContain('left: 24px;');
    expect(getDefaultOrientationStyle(draggedLegend)).toContain('left: 24px;');
    expect(getDefaultInsetStyle(draggedLegend)).toContain('left: 24px;');
  });

  it('only reserves the remaining stack slots once the scale was manually dragged away', () => {
    const context = createContext({ scaleDragged: true });

    expect(getDefaultOrientationStyle(context)).toContain('bottom: 24px;');
    expect(getDefaultInsetStyle(context)).toContain('bottom: 76px;');
  });

  it('does not reserve the orientation slot once the north arrow was manually dragged away', () => {
    const context = createContext({ orientationDragged: true });

    expect(getDefaultInsetStyle(context)).toContain('bottom: 76px;');
  });
});
