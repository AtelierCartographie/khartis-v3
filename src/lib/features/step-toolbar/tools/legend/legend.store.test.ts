import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LegendPosition } from '$lib/features/commons/constants/ui.constants';

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  visualizationStore: {
    visualizations: []
  }
}));

const {
  DEFAULT_LEGEND_BACKGROUND_COLOR,
  DEFAULT_LEGEND_TEXT_COLOR,
  getLegendState,
  legendActions
} = await import('./legend.store.svelte');

describe('legend.store default style', () => {
  beforeEach(() => {
    legendActions.reset();
  });

  it('uses white background and dark text by default', () => {
    const state = getLegendState();

    expect(state.style.background.color).toEqual(
      DEFAULT_LEGEND_BACKGROUND_COLOR
    );
    expect(state.style.textColor).toEqual(DEFAULT_LEGEND_TEXT_COLOR);
    expect(state.style.background.opacity).toBe(100);
    expect(state.style.background.enabled).toBe(true);
  });

  it('supports bottom-center placement for automatic styling layout', () => {
    legendActions.setPosition(LegendPosition.BOTTOM_CENTER);

    expect(getLegendState().position).toBe(LegendPosition.BOTTOM_CENTER);
  });

  it('updates global legend visibility explicitly', () => {
    legendActions.setVisibility(false);
    expect(getLegendState().visible).toBe(false);

    legendActions.setVisibility(true);
    expect(getLegendState().visible).toBe(true);
  });

  it('normalizes background opacity between 0 and 100', () => {
    legendActions.updateBackground({ opacity: 180 });
    expect(getLegendState().style.background.opacity).toBe(100);

    legendActions.updateBackground({ opacity: -25 });
    expect(getLegendState().style.background.opacity).toBe(0);
  });

  it('ignores invalid opacity values', () => {
    legendActions.updateBackground({ opacity: 42 });
    legendActions.updateBackground({ opacity: Number.NaN });

    expect(getLegendState().style.background.opacity).toBe(42);
  });
});
