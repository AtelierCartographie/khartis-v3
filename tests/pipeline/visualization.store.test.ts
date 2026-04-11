import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  datasets: [] as Array<Record<string, unknown>>,
  legendItems: [] as Array<{
    id: string;
    subtitle?: string;
    variableId?: string;
  }>,
  notifyChangeMock: vi.fn(),
  randomUUIDMock: vi.fn(),
  updateLegendItemMock: vi.fn()
}));

vi.mock('$lib/features/project-management/core/persistence-registry', () => ({
  persistenceRegistry: {
    register: vi.fn(),
    notifyChange: mocks.notifyChangeMock
  }
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    get datasets() {
      return mocks.datasets;
    }
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    getDatasetBySourceFile: vi.fn()
  }
}));

vi.mock('$lib/features/commons/store/project.store.svelte', () => ({
  projectStore: {
    currentProject: null
  }
}));

vi.mock('$lib/features/step-toolbar/tools/legend/legend.store.svelte', () => ({
  getLegendState: () => ({
    items: mocks.legendItems
  }),
  legendActions: {
    updateLegendItem: mocks.updateLegendItemMock
  }
}));

import {
  ClassificationMethod,
  PrimitiveFilterType,
  VisualizationType,
  visualizationStore
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  ColorMode,
  DEFAULT_COLORS,
  FillMode,
  ProportionalType,
  SizeMode,
  StrokeMode,
  SymbolMode
} from '$lib/features/main-toolbar/constants';
import {
  applySuggestionToVisualization,
  isVisualizationMatchingSuggestion,
  isVisualizationBlank,
  resolveNextSuggestionSelection,
  resolveBlankVisualizationType
} from '$lib/features/main-toolbar/visualization-tab/suggestion.utils';

function asBlankTypeDataset(
  value: unknown
): Parameters<typeof resolveBlankVisualizationType>[0] {
  return value as Parameters<typeof resolveBlankVisualizationType>[0];
}

function asBlankDataset(
  value: unknown
): Parameters<typeof isVisualizationBlank>[1] {
  return value as Parameters<typeof isVisualizationBlank>[1];
}

function asSuggestionDataset(
  value: unknown
): Parameters<typeof isVisualizationMatchingSuggestion>[1] {
  return value as Parameters<typeof isVisualizationMatchingSuggestion>[1];
}

describe('visualizationStore suggestion presets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    visualizationStore.clear();
    mocks.legendItems = [];
    mocks.updateLegendItemMock.mockImplementation((id, updates) => {
      const item = mocks.legendItems.find((entry) => entry.id === id);
      if (item) {
        Object.assign(item, updates);
      }
    });
    vi.stubGlobal('crypto', {
      randomUUID: mocks.randomUUIDMock
    });
    mocks.randomUUIDMock.mockReturnValue('viz-id');
    mocks.datasets = [
      {
        id: 'dataset-id',
        name: 'nuts2_data.geojson',
        sourceFileId: 'source-file-id',
        tableName: 'nuts2_table',
        rowCount: 2,
        geometry: { type: 'MultiPolygon' },
        columns: [
          { name: 'AREA_TOT_2024', type: 'number' },
          { name: 'POP_TOT_2023', type: 'number' },
          { name: 'NAME_LATN', type: 'string' },
          { name: 'REGION_TYPE', type: 'string' },
          { name: 'geometry', type: 'geometry' }
        ],
        metadata: {
          processedAt: new Date('2026-04-04T00:00:00.000Z'),
          transformations: []
        }
      }
    ];
  });

  it('keeps polygon symbol suggestions focused on centroids and outlines by default', () => {
    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      'dataset-id'
    );

    expect(visualization.primitiveFilters).toEqual([
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.POLYGON
    ]);
    expect(visualization.primitiveOrder).toEqual([
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.POLYGON
    ]);
  });

  it('sanitizes legacy polygon visualizations that still carry line primitives', () => {
    visualizationStore.restoreFromSerialized({
      visualizations: [
        {
          id: 'legacy-polygon',
          name: 'Legacy polygon',
          type: VisualizationType.CHOROPLETH,
          datasetId: 'dataset-id',
          enabled: true,
          primitiveFilters: [
            PrimitiveFilterType.POLYGON,
            PrimitiveFilterType.LINE
          ],
          primitiveOrder: [
            PrimitiveFilterType.POINT,
            PrimitiveFilterType.LINE,
            PrimitiveFilterType.POLYGON
          ],
          style: {
            fillOpacity: 1,
            strokeOpacity: 1
          },
          mapping: {
            geometryColumn: 'geometry',
            valueColumn: 'AREA_TOT_2024'
          }
        }
      ],
      selectedVisualizationId: 'legacy-polygon',
      activeVisualizationIds: ['legacy-polygon']
    });

    expect(visualizationStore.selectedVisualization?.primitiveFilters).toEqual([
      PrimitiveFilterType.POLYGON
    ]);
    expect(visualizationStore.selectedVisualization?.primitiveOrder).toEqual([
      PrimitiveFilterType.POLYGON
    ]);
  });

  it('removes disallowed primitive-specific filters when a polygon viz is updated', () => {
    const visualization = visualizationStore.createVisualization(
      VisualizationType.CHOROPLETH,
      'dataset-id'
    );

    visualizationStore.updateVisualization(visualization.id, {
      primitiveFilters: [PrimitiveFilterType.POLYGON, PrimitiveFilterType.LINE],
      primitiveOrder: [PrimitiveFilterType.LINE, PrimitiveFilterType.POLYGON],
      dataFilters: [
        {
          id: 'keep',
          column: 'AREA_TOT_2024',
          operator: 'gte',
          value: '10',
          primitiveType: PrimitiveFilterType.POLYGON
        },
        {
          id: 'drop',
          column: 'AREA_TOT_2024',
          operator: 'gte',
          value: '10',
          primitiveType: PrimitiveFilterType.LINE
        }
      ]
    });

    expect(visualizationStore.selectedVisualization?.primitiveFilters).toEqual([
      PrimitiveFilterType.POLYGON
    ]);
    expect(visualizationStore.selectedVisualization?.primitiveOrder).toEqual([
      PrimitiveFilterType.POLYGON
    ]);
    expect(visualizationStore.selectedVisualization?.dataFilters).toEqual([
      expect.objectContaining({ id: 'keep' })
    ]);
  });

  it('creates ex nihilo polygon visualizations from a blank choropleth preset', () => {
    expect(
      resolveBlankVisualizationType(asBlankTypeDataset(mocks.datasets[0]))
    ).toBe(VisualizationType.CHOROPLETH);
  });

  it('detects a blank visualization before any suggestion is applied', () => {
    const visualization = visualizationStore.createVisualization(
      VisualizationType.CHOROPLETH,
      'dataset-id'
    );

    expect(
      isVisualizationBlank(visualization, asBlankDataset(mocks.datasets[0]))
    ).toBe(true);
  });

  it('treats a default point visualization as matching the top proportional suggestion', () => {
    const pointDataset = {
      id: 'dataset-point',
      name: 'multipoint-representative-points.geojson',
      sourceFileId: 'source-point-id',
      tableName: 'point_table',
      rowCount: 2,
      geometry: { type: 'MultiPoint' },
      columns: [
        { name: 'name', type: 'string' },
        { name: 'value', type: 'number' },
        { name: 'geometry', type: 'geometry' }
      ],
      metadata: {
        processedAt: new Date('2026-04-10T00:00:00.000Z'),
        transformations: []
      }
    };
    mocks.datasets = [pointDataset];

    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      'dataset-point'
    );

    expect(
      isVisualizationBlank(visualization, asBlankDataset(pointDataset))
    ).toBe(true);
    expect(
      isVisualizationMatchingSuggestion(
        visualization,
        asSuggestionDataset(pointDataset),
        {
          id: 'symbols_proportional',
          label: 'Symboles proportionnels',
          nbColumns: 1,
          semioTypes: ['QTA'],
          geometries: ['point', 'polygon'],
          columns: ['value']
        }
      )
    ).toBe(true);
  });

  it('treats an applied line suggestion as matching the active visualization', () => {
    const lineDataset = {
      id: 'dataset-line',
      name: 'lignes-du-reseau-star-de-rennes-metropole.geojson',
      sourceFileId: 'source-line-id',
      tableName: 'line_table',
      rowCount: 321,
      geometry: { type: 'MultiLineString' },
      columns: [
        { name: 'li_type', type: 'string' },
        { name: 'id', type: 'number' },
        { name: 'geometry', type: 'geometry' }
      ],
      metadata: {
        processedAt: new Date('2026-04-10T00:00:00.000Z'),
        transformations: []
      }
    };
    mocks.datasets = [lineDataset];

    const visualization = visualizationStore.createVisualization(
      resolveBlankVisualizationType(asBlankTypeDataset(lineDataset)),
      'dataset-line'
    );
    const suggestion: Parameters<typeof applySuggestionToVisualization>[1] = {
      id: 'lines_colorful_QL',
      label: 'Lignes colorées (qualitatif)',
      nbColumns: 1,
      semioTypes: ['QL'],
      geometries: ['line'],
      columns: ['li_type']
    };

    applySuggestionToVisualization(visualization.id, suggestion);

    const updated = visualizationStore.selectedVisualization;
    expect(updated).toBeDefined();

    if (!updated) {
      return;
    }

    expect(
      isVisualizationMatchingSuggestion(
        updated,
        asSuggestionDataset(lineDataset),
        suggestion
      )
    ).toBe(true);
  });

  it('treats an applied proportional text suggestion as matching the active polygon visualization', () => {
    const visualization = visualizationStore.createVisualization(
      VisualizationType.CHOROPLETH,
      'dataset-id'
    );
    const suggestion: Parameters<typeof applySuggestionToVisualization>[1] = {
      id: 'texts_proportional',
      label: 'Textes proportionnels',
      nbColumns: 2,
      semioTypes: ['QL', 'QTA'],
      geometries: ['polygon'],
      columns: ['NAME_LATN', 'POP_TOT_2023']
    };

    applySuggestionToVisualization(visualization.id, suggestion);

    const updated = visualizationStore.selectedVisualization;
    expect(updated).toBeDefined();

    if (!updated) {
      return;
    }

    expect(
      isVisualizationMatchingSuggestion(
        updated,
        asSuggestionDataset(mocks.datasets[0]),
        suggestion
      )
    ).toBe(true);
  });

  it('toggles the active suggestion selection off on a second click', () => {
    expect(
      resolveNextSuggestionSelection(undefined, 'texts_proportional')
    ).toBe('texts_proportional');
    expect(
      resolveNextSuggestionSelection('texts_proportional', 'texts_proportional')
    ).toBeUndefined();
  });

  it('initializes visualization text and label colors with black defaults', () => {
    const visualization = visualizationStore.createVisualization(
      VisualizationType.CHOROPLETH,
      'dataset-id'
    );

    expect(visualization.style.textColor).toBe(DEFAULT_COLORS.text);
    expect(visualization.style.labelColor).toBe(DEFAULT_COLORS.label);
    expect(visualization.style.textCollisionDetection).toBe(true);
    expect(visualization.style.labelCollisionDetection).toBe(true);
  });

  it('replaces the current visualization with the full preset when switching type', () => {
    const visualization = visualizationStore.createVisualization(
      VisualizationType.CHOROPLETH,
      'dataset-id'
    );

    visualizationStore.updateVisualization(visualization.id, {
      primitiveOrder: [PrimitiveFilterType.POLYGON, PrimitiveFilterType.LINE],
      dataFilters: [
        {
          id: 'filter-id',
          column: 'AREA_TOT_2024',
          operator: 'gte',
          value: '1000'
        }
      ],
      style: {
        ...visualization.style,
        fillOpacity: 0.15
      }
    });

    visualizationStore.applyVisualizationPreset(
      visualization.id,
      VisualizationType.BIVARIATE
    );

    const updated = visualizationStore.selectedVisualization;

    expect(updated?.type).toBe(VisualizationType.BIVARIATE);
    expect(updated?.modes).toEqual({
      symbol: SymbolMode.PROPORTIONAL,
      fill: FillMode.CLASSES,
      stroke: StrokeMode.NONE
    });
    expect(updated?.primitiveFilters).toEqual([
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.POLYGON
    ]);
    expect(updated?.mapping).toEqual({
      geometryColumn: 'geometry',
      sizeColumn: 'AREA_TOT_2024',
      valueColumn: 'POP_TOT_2023'
    });
    expect(updated?.classification?.method).toBe(
      ClassificationMethod.QUANTILES
    );
    expect(updated?.dataFilters).toBeUndefined();
    expect(updated?.primitiveOrder).toEqual([
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.POLYGON
    ]);
    expect(updated?.style.fillOpacity).not.toBe(0.15);
  });

  it('maps double proportional suggestions to the dedicated double-symbol preset', () => {
    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      'dataset-id'
    );

    applySuggestionToVisualization(visualization.id, {
      id: 'symbols_proportional_double',
      label: 'Double symboles proportionnels',
      nbColumns: 2,
      semioTypes: ['QTA', 'QTA'],
      geometries: ['polygon'],
      columns: ['AREA_TOT_2024', 'POP_TOT_2023']
    });

    const updated = visualizationStore.selectedVisualization;

    expect(updated?.type).toBe(VisualizationType.BIVARIATE);
    expect(updated?.modes).toEqual({
      symbol: SymbolMode.PROPORTIONAL,
      fill: FillMode.UNIQUE,
      stroke: StrokeMode.UNIQUE,
      proportionalType: ProportionalType.DOUBLE
    });
    expect(updated?.mapping).toEqual({
      geometryColumn: 'geometry',
      sizeColumn: 'AREA_TOT_2024',
      valueColumn: 'POP_TOT_2023'
    });
    expect(updated?.style.fillColorB).toBe('#ff832b');
  });

  it('no longer considers the visualization blank after applying a suggestion', () => {
    const visualization = visualizationStore.createVisualization(
      VisualizationType.CHOROPLETH,
      'dataset-id'
    );

    applySuggestionToVisualization(visualization.id, {
      id: 'texts_colorful_QTR',
      label: 'Textes colorés (quantitatif)',
      nbColumns: 1,
      semioTypes: ['QTR'],
      geometries: ['polygon'],
      columns: ['POP_TOT_2023']
    });

    const updated = visualizationStore.selectedVisualization;
    expect(updated).toBeDefined();

    if (!updated) {
      return;
    }

    expect(
      isVisualizationBlank(updated, asBlankDataset(mocks.datasets[0]))
    ).toBe(false);
  });

  it('maps quantitative plus qualitative symbol suggestions to categorical color', () => {
    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      'dataset-id'
    );

    applySuggestionToVisualization(visualization.id, {
      id: 'symbols_proportional_colorful_QL',
      label: 'Symboles proportionnels colorés',
      nbColumns: 2,
      semioTypes: ['QTA', 'QL'],
      geometries: ['polygon'],
      columns: ['POP_TOT_2023', 'NAME_LATN']
    });

    const updated = visualizationStore.selectedVisualization;

    expect(updated?.type).toBe(VisualizationType.BIVARIATE);
    expect(updated?.modes).toEqual({
      symbol: SymbolMode.PROPORTIONAL,
      fill: FillMode.CATEGORIES,
      stroke: StrokeMode.NONE,
      proportionalType: ProportionalType.SINGLE
    });
    expect(updated?.mapping).toEqual({
      geometryColumn: 'geometry',
      sizeColumn: 'POP_TOT_2023',
      categoryColumn: 'NAME_LATN'
    });
  });

  it('maps qualitative text suggestions to a text-only categorical preset', () => {
    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      'dataset-id'
    );

    applySuggestionToVisualization(visualization.id, {
      id: 'texts_colorful_QL',
      label: 'Textes colorés (qualitatif)',
      nbColumns: 2,
      semioTypes: ['QL', 'QL'],
      geometries: ['polygon'],
      columns: ['NAME_LATN', 'REGION_TYPE']
    });

    const updated = visualizationStore.selectedVisualization;

    expect(updated?.type).toBe(VisualizationType.BIVARIATE);
    expect(updated?.modes?.fill).toBe(FillMode.CATEGORIES);
    expect(updated?.modes?.color).toBe(ColorMode.CATEGORIES);
    expect(updated?.modes?.size).toBe(SizeMode.FIXED);
    expect(updated?.mapping).toEqual({
      geometryColumn: 'geometry',
      labelColumn: 'NAME_LATN',
      categoryColumn: 'REGION_TYPE'
    });
    expect(updated?.style.textOpacity).toBe(1);
    expect(updated?.style.labelOpacity).toBe(0);
    expect(updated?.style.fillOpacity).toBe(0);
    expect(updated?.style.strokeOpacity).toBe(0);
  });

  it('maps proportional text suggestions to variable text sizing', () => {
    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      'dataset-id'
    );

    applySuggestionToVisualization(visualization.id, {
      id: 'texts_proportional',
      label: 'Textes proportionnels',
      nbColumns: 2,
      semioTypes: ['QL', 'QTA'],
      geometries: ['polygon'],
      columns: ['NAME_LATN', 'POP_TOT_2023']
    });

    const updated = visualizationStore.selectedVisualization;

    expect(updated?.type).toBe(VisualizationType.BIVARIATE);
    expect(updated?.modes?.fill).toBe(FillMode.UNIQUE);
    expect(updated?.modes?.color).toBe(ColorMode.UNIQUE);
    expect(updated?.modes?.size).toBe(SizeMode.PROPORTIONAL);
    expect(updated?.mapping).toEqual({
      geometryColumn: 'geometry',
      labelColumn: 'NAME_LATN',
      sizeColumn: 'POP_TOT_2023'
    });
    expect(updated?.style.textOpacity).toBe(1);
    expect(updated?.style.labelOpacity).toBe(0);
    expect(updated?.style.fillOpacity).toBe(0);
    expect(updated?.style.strokeOpacity).toBe(0);
  });

  it('keeps automatic legend subtitles aligned when a suggestion changes the mapped column', () => {
    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      'dataset-id'
    );

    mocks.legendItems = [
      {
        id: 'legend-viz-id',
        variableId: visualization.id,
        subtitle: 'AREA_TOT_2024'
      }
    ];

    applySuggestionToVisualization(visualization.id, {
      id: 'symbols_differents',
      label: 'Symboles differents',
      nbColumns: 1,
      semioTypes: ['QL'],
      geometries: ['polygon'],
      columns: ['NAME_LATN']
    });

    expect(mocks.updateLegendItemMock).toHaveBeenCalledWith(
      'legend-viz-id',
      expect.objectContaining({
        subtitle: 'NAME_LATN'
      })
    );
    expect(mocks.legendItems[0]?.subtitle).toBe('NAME_LATN');
  });
});
