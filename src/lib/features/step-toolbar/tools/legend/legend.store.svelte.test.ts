import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FormatMode,
  PageModel
} from '$lib/features/commons/constants/ui.constants';
import { FillMode } from '$lib/features/main-toolbar/constants';
import { formatActions } from '../format/format.store.svelte';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';

const { mockVisualizationStore } = vi.hoisted(() => ({
  mockVisualizationStore: {
    version: 0,
    visualizations: [] as VisualizationConfig[]
  }
}));

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  visualizationStore: mockVisualizationStore
}));

import { getLegendState, legendActions } from './legend.store.svelte';

function createVisualization(
  overrides: Partial<VisualizationConfig> = {}
): VisualizationConfig {
  return {
    id: 'viz-1',
    name: 'Population',
    type: 'categorical',
    datasetId: 'dataset-1',
    enabled: true,
    style: {},
    mapping: {
      categoryColumn: 'category'
    },
    modes: {
      fill: FillMode.CATEGORIES
    },
    ...overrides
  } as VisualizationConfig;
}

describe('legend store responsive defaults', () => {
  beforeEach(() => {
    formatActions.reset();
    legendActions.reset();
    mockVisualizationStore.visualizations = [];
  });

  it('adapts pristine legend font size to the current page profile', () => {
    formatActions.setModel(PageModel.A3_LANDSCAPE);

    legendActions.syncWithVisualizations();

    expect(getLegendState().style.fontSize).toBe(11);
  });

  it('uses the actual custom page size instead of the previous preset profile', () => {
    formatActions.setModel(PageModel.SCREEN_LANDSCAPE);
    formatActions.setMode(FormatMode.CUSTOM);
    formatActions.setSize(680, 680);

    legendActions.syncWithVisualizations();

    expect(getLegendState().style.fontSize).toBe(10);
  });

  it('does not overwrite a customized legend font size after the tool was opened', () => {
    formatActions.setModel(PageModel.SCREEN_LANDSCAPE);
    legendActions.updateStyle({ fontSize: 20 });
    legendActions.markAsOpened();

    legendActions.syncWithVisualizations();

    expect(getLegendState().style.fontSize).toBe(20);
  });

  it('creates and updates linked legend items from visualizations', () => {
    mockVisualizationStore.visualizations = [
      createVisualization({
        id: 'viz-pop',
        name: 'Population',
        mapping: {
          categoryColumn: 'category'
        }
      })
    ];

    legendActions.syncWithVisualizations();

    expect(getLegendState().items).toEqual([
      expect.objectContaining({
        id: 'legend-viz-viz-pop',
        name: 'Population',
        title: 'Population',
        titleMode: 'auto',
        subtitle: 'category',
        subtitleMode: 'auto',
        variableId: 'viz-pop',
        visible: true
      })
    ]);
  });

  it('preserves custom legend text when linked visualizations change', () => {
    mockVisualizationStore.visualizations = [
      createVisualization({
        id: 'viz-pop',
        name: 'Population',
        mapping: {
          categoryColumn: 'category'
        }
      })
    ];

    legendActions.syncWithVisualizations();
    legendActions.updateLegendItem('legend-viz-viz-pop', {
      title: 'Titre custom',
      titleMode: 'custom',
      subtitle: 'Sous-titre custom',
      subtitleMode: 'custom'
    });

    mockVisualizationStore.visualizations = [
      createVisualization({
        id: 'viz-pop',
        name: 'Population renommée',
        mapping: {
          categoryColumn: 'segment'
        }
      })
    ];

    legendActions.syncWithVisualizations();

    expect(getLegendState().items).toEqual([
      expect.objectContaining({
        name: 'Population renommée',
        title: 'Titre custom',
        titleMode: 'custom',
        subtitle: 'Sous-titre custom',
        subtitleMode: 'custom'
      })
    ]);
  });

  it('keeps custom standalone legend items when visualizations are synchronized', () => {
    const customItem = legendActions.addLegendItem({
      name: 'Note méthodologique',
      visible: true,
      title: 'Note méthodologique',
      titleMode: 'custom',
      subtitle: '',
      subtitleMode: 'custom',
      note: 'Texte libre',
      variableId: undefined
    });

    mockVisualizationStore.visualizations = [
      createVisualization({
        id: 'viz-pop',
        name: 'Population'
      })
    ];

    legendActions.syncWithVisualizations();

    expect(getLegendState().items.map((item) => item.id)).toEqual([
      'legend-viz-viz-pop',
      customItem.id
    ]);
  });
});
