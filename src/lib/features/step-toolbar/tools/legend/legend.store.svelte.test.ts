// @vitest-environment jsdom

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

const { mockVisualizationStore, mockFacetsStore } = vi.hoisted(() => ({
  mockVisualizationStore: {
    version: 0,
    visualizations: [] as VisualizationConfig[]
  },
  mockFacetsStore: {
    enabled: false,
    baseVisualizationId: null as string | null,
    primarySlotPath: null as string | null,
    scaleMode: 'independent',
    variables: [] as string[]
  }
}));

vi.mock('../facets', () => ({
  facetsStore: mockFacetsStore,
  SCALE_MODE: { SHARED: 'shared', INDEPENDENT: 'independent' }
}));

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  visualizationStore: mockVisualizationStore
}));

import { getLegendState, legendActions } from './legend.store.svelte';
import { getVisualizationLegendSubtitle } from '$lib/features/commons/utils/legend-subtitle.utils';
import { LEGEND_DEFAULTS } from './legend.constants';
import { getFacetVisualizationId } from '$lib/features/commons/services/facet-generator.service';

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
    mockFacetsStore.baseVisualizationId = null;
    mockFacetsStore.variables = [];
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

  it('creates one legend item per enabled primitive', () => {
    mockVisualizationStore.visualizations = [
      createVisualization({
        id: 'viz-pop',
        name: 'Population',
        mapping: {
          categoryColumn: 'category'
        },
        polygon: {
          enabled: true
        } as never,
        modes: {}
      })
    ];

    legendActions.syncWithVisualizations();

    expect(getLegendState().items).toEqual([
      expect.objectContaining({
        id: 'legend-viz-viz-pop--area',
        primitive: 'area',
        title: 'category',
        titleMode: 'auto',
        subtitle: '',
        subtitleMode: 'auto',
        variableId: 'viz-pop',
        visible: true,
        dragPosition: null
      })
    ]);
  });

  it('truncates a long default title but keeps a custom one whole', () => {
    const longColumn =
      'population_rurale_en_pourcentage_de_la_population_totale';
    mockVisualizationStore.visualizations = [
      createVisualization({
        id: 'viz-long',
        name: 'Visualisation',
        mapping: { categoryColumn: longColumn },
        polygon: { enabled: true } as never,
        modes: {}
      })
    ];

    legendActions.syncWithVisualizations();
    const [item] = getLegendState().items;

    expect(Array.from(item.title)).toHaveLength(
      LEGEND_DEFAULTS.AUTO_TITLE_MAX_LENGTH
    );
    expect(item.title.endsWith('…')).toBe(true);

    legendActions.updateLegendItem(item.id, {
      title: longColumn,
      titleMode: 'custom'
    });
    legendActions.syncWithVisualizations();

    expect(getLegendState().items[0].title).toBe(longColumn);
  });

  it('falls back to the visualization name when no variable is mapped', () => {
    mockVisualizationStore.visualizations = [
      createVisualization({
        id: 'viz-unique',
        name: 'Fond',
        mapping: {},
        polygon: { enabled: true } as never,
        modes: {}
      })
    ];

    legendActions.syncWithVisualizations();

    expect(getLegendState().items[0].title).toBe('Fond');
  });

  it('joins multiple mapped columns in cartographic legend order', () => {
    // The merged subtitle is the fallback for legends saved before primitives
    // were split, so it keeps its own coverage.
    expect(
      getVisualizationLegendSubtitle(
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
      )
    ).toBe('area / population / status / palette');
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
        id: 'legend-viz-viz-poly-only--area',
        primitive: 'area',
        title: 'population',
        subtitle: ''
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
        id: 'legend-viz-viz-point-fill--point',
        primitive: 'point',
        title: 'capacity',
        subtitle: ''
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
        id: 'legend-viz-viz-line-only--line',
        primitive: 'line',
        title: 'line_type / traffic',
        subtitle: ''
      })
    ]);
  });

  it('keeps a collection map legend text while the map is regenerated', () => {
    const base = createVisualization({
      id: 'viz-base',
      polygon: { enabled: true } as never
    });
    const facetId = getFacetVisualizationId('viz-base', '1960');
    const facet = createVisualization({
      id: facetId,
      name: '1960',
      polygon: { enabled: true } as never,
      facet: { baseVisualizationId: 'viz-base' }
    });
    mockFacetsStore.baseVisualizationId = 'viz-base';
    mockFacetsStore.variables = ['1960', '2020'];
    mockVisualizationStore.visualizations = [base, facet];
    legendActions.syncWithVisualizations();
    legendActions.updateLegendItem(`legend-viz-${facetId}--area`, {
      title: 'Population rurale en 1960',
      titleMode: 'custom'
    });

    mockVisualizationStore.visualizations = [base];
    legendActions.syncWithVisualizations();
    mockVisualizationStore.visualizations = [base, facet];
    legendActions.syncWithVisualizations();

    expect(
      getLegendState().items.find((item) => item.variableId === facetId)
    ).toMatchObject({
      title: 'Population rurale en 1960',
      titleMode: 'custom'
    });
  });

  it('preserves custom legend text when linked visualizations change', () => {
    mockVisualizationStore.visualizations = [
      createVisualization({
        id: 'viz-pop',
        polygon: {
          enabled: true
        } as never,
        name: 'Population',
        mapping: {
          categoryColumn: 'category'
        }
      })
    ];

    legendActions.syncWithVisualizations();
    legendActions.updateLegendItem('legend-viz-viz-pop--area', {
      title: 'Titre custom',
      titleMode: 'custom',
      subtitle: 'Sous-titre custom',
      subtitleMode: 'custom'
    });

    mockVisualizationStore.visualizations = [
      createVisualization({
        id: 'viz-pop',
        polygon: {
          enabled: true
        } as never,
        name: 'Population renommée',
        mapping: {
          categoryColumn: 'segment'
        }
      })
    ];

    legendActions.syncWithVisualizations();

    expect(getLegendState().items).toEqual([
      expect.objectContaining({
        name: 'Population renommée — Polygones',
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
        polygon: {
          enabled: true
        } as never,
        name: 'Population'
      })
    ];

    legendActions.syncWithVisualizations();

    expect(getLegendState().items.map((item) => item.id)).toEqual([
      'legend-viz-viz-pop--area',
      customItem.id
    ]);
  });
});
