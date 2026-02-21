import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LegendPosition,
  LegendTab
} from '$lib/features/commons/constants/ui.constants';

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

describe('legend.store item management', () => {
  beforeEach(() => {
    legendActions.reset();
  });

  it('adds a new item and returns it with a generated id', () => {
    const added = legendActions.addLegendItem({
      name: 'Population',
      visible: true,
      title: 'Population',
      subtitle: 'pop_total',
      note: ''
    });

    expect(getLegendState().items).toHaveLength(1);
    expect(added.id).toBeDefined();
    expect(added.name).toBe('Population');
  });

  it('removes a legend item by id', () => {
    const item = legendActions.addLegendItem({
      name: 'Remove me',
      visible: true,
      title: '',
      subtitle: '',
      note: ''
    });

    legendActions.removeLegendItem(item.id);

    expect(getLegendState().items).toHaveLength(0);
  });

  it('leaves other items intact when removing one', () => {
    // Use controlled timestamps so items get unique ids even within one ms
    vi.useFakeTimers();
    const a = legendActions.addLegendItem({
      name: 'A',
      visible: true,
      title: '',
      subtitle: '',
      note: ''
    });
    vi.advanceTimersByTime(1);
    legendActions.addLegendItem({
      name: 'B',
      visible: true,
      title: '',
      subtitle: '',
      note: ''
    });
    vi.useRealTimers();

    legendActions.removeLegendItem(a.id);

    expect(getLegendState().items).toHaveLength(1);
    expect(getLegendState().items[0].name).toBe('B');
  });

  it('updates only the specified fields of a legend item', () => {
    const item = legendActions.addLegendItem({
      name: 'Original',
      visible: true,
      title: 'Original title',
      subtitle: '',
      note: ''
    });

    legendActions.updateLegendItem(item.id, { title: 'Custom title' });

    const updated = getLegendState().items.find((i) => i.id === item.id);
    expect(updated?.title).toBe('Custom title');
    expect(updated?.name).toBe('Original');
  });

  it('toggles item visibility via updateLegendItem', () => {
    const item = legendActions.addLegendItem({
      name: 'Layer',
      visible: true,
      title: '',
      subtitle: '',
      note: ''
    });

    legendActions.updateLegendItem(item.id, { visible: false });

    expect(getLegendState().items[0].visible).toBe(false);
  });

  it('clears all items on reset', () => {
    legendActions.addLegendItem({
      name: 'X',
      visible: true,
      title: '',
      subtitle: '',
      note: ''
    });

    legendActions.reset();

    expect(getLegendState().items).toHaveLength(0);
  });
});

describe('legend.store visibility and style', () => {
  beforeEach(() => {
    legendActions.reset();
  });

  it('toggles visibility off and back on', () => {
    expect(getLegendState().visible).toBe(true);
    legendActions.toggleLegendVisibility();
    expect(getLegendState().visible).toBe(false);
    legendActions.toggleLegendVisibility();
    expect(getLegendState().visible).toBe(true);
  });

  it('switches the active tab to STYLE', () => {
    legendActions.setActiveTab(LegendTab.STYLE);

    expect(getLegendState().activeTab).toBe(LegendTab.STYLE);
  });

  it('switches the active tab back to CONTENT', () => {
    legendActions.setActiveTab(LegendTab.STYLE);
    legendActions.setActiveTab(LegendTab.CONTENT);

    expect(getLegendState().activeTab).toBe(LegendTab.CONTENT);
  });

  it('updates font size via updateStyle', () => {
    legendActions.updateStyle({ fontSize: 18 });

    expect(getLegendState().style.fontSize).toBe(18);
  });

  it('updates font family via updateStyle', () => {
    legendActions.updateStyle({ fontFamily: 'Georgia' });

    expect(getLegendState().style.fontFamily).toBe('Georgia');
  });

  it('enables background transparency via updateBackground', () => {
    legendActions.updateBackground({ enabled: false });

    expect(getLegendState().style.background.enabled).toBe(false);
  });
});

describe('legend.store syncWithVisualizations', () => {
  beforeEach(() => {
    legendActions.reset();
  });

  it('creates legend items from visualizations when items list is empty', async () => {
    const { visualizationStore } =
      await import('$lib/features/commons/store/visualization.store.svelte');

    (
      visualizationStore as {
        visualizations: {
          id: string;
          name: string;
          mapping: Record<string, string | undefined>;
        }[];
      }
    ).visualizations = [
      { id: 'v1', name: 'Population', mapping: { valueColumn: 'pop_total' } }
    ];

    legendActions.syncWithVisualizations();

    const items = getLegendState().items;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Population');
    expect(items[0].subtitle).toBe('pop_total');
    expect(items[0].variableId).toBe('v1');
  });

  it('preserves custom subtitle when item already exists', async () => {
    const { visualizationStore } =
      await import('$lib/features/commons/store/visualization.store.svelte');

    (
      visualizationStore as {
        visualizations: {
          id: string;
          name: string;
          mapping: Record<string, string | undefined>;
        }[];
      }
    ).visualizations = [
      { id: 'v2', name: 'GDP', mapping: { valueColumn: 'gdp' } }
    ];

    legendActions.syncWithVisualizations();

    legendActions.updateLegendItem(getLegendState().items[0].id, {
      subtitle: 'Custom subtitle'
    });

    legendActions.syncWithVisualizations();

    expect(getLegendState().items[0].subtitle).toBe('Custom subtitle');
  });

  it('removes items for visualizations that no longer exist', async () => {
    const { visualizationStore } =
      await import('$lib/features/commons/store/visualization.store.svelte');

    const store = visualizationStore as {
      visualizations: {
        id: string;
        name: string;
        mapping: Record<string, string | undefined>;
      }[];
    };

    store.visualizations = [
      { id: 'v3', name: 'Area', mapping: { valueColumn: 'area' } }
    ];
    legendActions.syncWithVisualizations();
    expect(getLegendState().items).toHaveLength(1);

    store.visualizations = [];
    legendActions.syncWithVisualizations();
    expect(getLegendState().items).toHaveLength(0);
  });
});
