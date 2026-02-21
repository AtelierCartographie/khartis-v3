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

describe('legend.store hasBeenOpened', () => {
  beforeEach(() => {
    legendActions.reset();
  });

  it('is false by default', () => {
    expect(getLegendState().hasBeenOpened).toBe(false);
  });

  it('becomes true after markAsOpened is called', () => {
    legendActions.markAsOpened();

    expect(getLegendState().hasBeenOpened).toBe(true);
  });

  it('stays true after multiple markAsOpened calls', () => {
    legendActions.markAsOpened();
    legendActions.markAsOpened();

    expect(getLegendState().hasBeenOpened).toBe(true);
  });

  it('resets to false after reset', () => {
    legendActions.markAsOpened();
    legendActions.reset();

    expect(getLegendState().hasBeenOpened).toBe(false);
  });
});

describe('legend.store drag position', () => {
  beforeEach(() => {
    legendActions.reset();
  });

  it('has no drag position by default', () => {
    expect(getLegendState().dragPosition).toBeNull();
  });

  it('stores a drag position when set', () => {
    legendActions.setDragPosition({ x: 100, y: 200 });

    expect(getLegendState().dragPosition).toEqual({ x: 100, y: 200 });
  });

  it('clears drag position when set to null', () => {
    legendActions.setDragPosition({ x: 50, y: 75 });
    legendActions.setDragPosition(null);

    expect(getLegendState().dragPosition).toBeNull();
  });

  it('clears drag position when preset position is changed', () => {
    legendActions.setDragPosition({ x: 100, y: 200 });
    legendActions.setPosition(LegendPosition.TOP_LEFT);

    expect(getLegendState().dragPosition).toBeNull();
    expect(getLegendState().position).toBe(LegendPosition.TOP_LEFT);
  });

  it('updates drag position with new coordinates', () => {
    legendActions.setDragPosition({ x: 10, y: 20 });
    legendActions.setDragPosition({ x: 300, y: 400 });

    expect(getLegendState().dragPosition).toEqual({ x: 300, y: 400 });
  });
});
