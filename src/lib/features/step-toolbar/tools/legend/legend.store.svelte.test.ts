import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FormatMode,
  PageModel
} from '$lib/features/commons/constants/ui.constants';
import {
  CategoryShapeMode,
  ColorMode,
  FillMode,
  ProportionalType,
  ShapeType,
  StrokeMode,
  SymbolMode,
  ThicknessMode
} from '$lib/features/commons/constants/visualization.constants';
import { formatActions } from '../format/format.store.svelte';
import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';

const { mockVisualizationStore } = vi.hoisted(() => ({
  mockVisualizationStore: {
    version: 0,
    visualizations: [] as VisualizationConfig[]
  }
}));

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  visualizationStore: mockVisualizationStore
}));

import { getLegendState, legendActions } from './legend.store.svelte';
import { LEGEND_DEFAULTS } from './legend.constants';

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

  it('keeps the default legend font size whatever the page profile', () => {
    formatActions.setModel(PageModel.A3_LANDSCAPE);

    legendActions.syncWithVisualizations();

    expect(getLegendState().style.fontSize).toBe(LEGEND_DEFAULTS.FONT_SIZE);

    formatActions.setMode(FormatMode.CUSTOM);
    formatActions.setSize(680, 680);

    legendActions.syncWithVisualizations();

    expect(getLegendState().style.fontSize).toBe(LEGEND_DEFAULTS.FONT_SIZE);
  });

  it('does not overwrite a customized legend font size', () => {
    formatActions.setModel(PageModel.SCREEN_LANDSCAPE);
    legendActions.updateStyle({ fontSize: 20 });

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

  it('joins multiple mapped columns in cartographic legend order', () => {
    mockVisualizationStore.visualizations = [
      createVisualization({
        id: 'viz-bi',
        modes: {},
        mapping: {
          sizeColumn: 'area',
          valueColumn: 'population',
          categoryColumn: 'status',
          colorColumn: 'palette'
        }
      })
    ];

    legendActions.syncWithVisualizations();

    expect(getLegendState().items).toEqual([
      expect.objectContaining({
        id: 'legend-viz-viz-bi',
        subtitle: 'area / population / status / palette',
        subtitleMode: 'auto'
      })
    ]);
  });

  it('ignores disabled symbol columns when only polygon fill remains active', () => {
    mockVisualizationStore.visualizations = [
      createVisualization({
        id: 'viz-poly-only',
        mapping: {
          sizeColumn: 'area',
          valueColumn: 'population',
          categoryColumn: 'status'
        },
        polygon: {
          enabled: true,
          fillMode: FillMode.CLASSES,
          fillColor: '#4585f5',
          fillOpacity: 100,
          strokeMode: StrokeMode.UNIQUE,
          strokeColor: '#ffffff',
          strokeWidth: 1,
          strokeOpacity: 100,
          strokeDashed: false,
          valueColumn: 'population'
        },
        modes: {}
      })
    ];

    legendActions.syncWithVisualizations();

    expect(getLegendState().items).toEqual([
      expect.objectContaining({
        id: 'legend-viz-viz-poly-only',
        subtitle: 'population',
        subtitleMode: 'auto'
      })
    ]);
  });

  it('uses active point fill value columns for point-only legends', () => {
    mockVisualizationStore.visualizations = [
      createVisualization({
        id: 'viz-point-fill',
        mapping: {
          categoryColumn: 'category'
        },
        symbol: {
          enabled: true,
          mode: SymbolMode.UNIQUE,
          shape: ShapeType.CIRCLE,
          size: 10,
          minSize: 6,
          maxSize: 14,
          sizeScale: 'linear' as never,
          opacity: 1,
          fillMode: FillMode.CLASSES,
          fillColor: '#4585f5',
          strokeMode: StrokeMode.UNIQUE,
          strokeColor: '#ffffff',
          strokeWidth: 1,
          strokeOpacity: 1,
          strokeDashed: false,
          proportionalType: ProportionalType.SINGLE,
          categoryShape: CategoryShapeMode.UNIQUE,
          fillValueColumn: 'capacity'
        },
        modes: {}
      })
    ];

    legendActions.syncWithVisualizations();

    expect(getLegendState().items).toEqual([
      expect.objectContaining({
        id: 'legend-viz-viz-point-fill',
        subtitle: 'capacity',
        subtitleMode: 'auto'
      })
    ]);
  });

  it('uses active line color and thickness columns for line-only legends', () => {
    mockVisualizationStore.visualizations = [
      createVisualization({
        id: 'viz-line-only',
        mapping: {
          categoryColumn: 'category',
          sizeColumn: 'unused-size'
        },
        line: {
          enabled: true,
          colorMode: ColorMode.CATEGORIES,
          thicknessMode: ThicknessMode.CLASSES,
          color: '#1e3a5f',
          width: 2,
          maxWidth: 10,
          opacity: 1,
          dashed: false,
          categoryColumn: 'line_type',
          sizeColumn: 'traffic'
        },
        modes: {}
      })
    ];

    legendActions.syncWithVisualizations();

    expect(getLegendState().items).toEqual([
      expect.objectContaining({
        id: 'legend-viz-viz-line-only',
        subtitle: 'line_type / traffic',
        subtitleMode: 'auto'
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
