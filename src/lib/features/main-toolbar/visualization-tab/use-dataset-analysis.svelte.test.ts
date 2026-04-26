import { describe, it, expect, vi, beforeEach } from 'vitest';

const { datasetsStoreMock, duckDBOrchestratorMock, isLikelyYearColumnMock } =
  vi.hoisted(() => ({
    datasetsStoreMock: {
      datasets: [] as Array<Record<string, unknown>>,
      selectedDataset: null as Record<string, unknown> | null
    },
    duckDBOrchestratorMock: {
      getDatasetBySourceFile: vi.fn().mockReturnValue(null)
    },
    isLikelyYearColumnMock: vi.fn().mockReturnValue(false)
  }));

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  ALL_PRIMITIVE_FILTERS: ['point', 'polygon', 'line', 'text'],
  PrimitiveFilterType: {
    POINT: 'point',
    POLYGON: 'polygon',
    LINE: 'line',
    TEXT: 'text'
  },
  resolveAllowedPrimitiveFilters: vi.fn(() => ['point', 'polygon'])
}));

vi.mock('$lib/features/commons/constants/data.constants', () => ({
  COLUMN_TYPE_GEOMETRY: 'geometry',
  GEO_COLUMN_TYPE: { LATITUDE: 'lat', LONGITUDE: 'lng' }
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: datasetsStoreMock
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: duckDBOrchestratorMock
}));

vi.mock('./components/year-filter.utils', () => ({
  isLikelyYearColumn: isLikelyYearColumnMock
}));

import { useDatasetAnalysis } from './use-dataset-analysis.svelte';

describe('useDatasetAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    datasetsStoreMock.datasets = [];
    datasetsStoreMock.selectedDataset = null;
    duckDBOrchestratorMock.getDatasetBySourceFile.mockReturnValue(null);
    isLikelyYearColumnMock.mockReturnValue(false);
  });

  it('returns empty dataFieldItems when no dataset selected', () => {
    const analysis = useDatasetAnalysis({
      getSelectedVisualization: () => undefined
    });
    expect(analysis.dataFieldItems).toEqual([]);
  });

  it('filters out geometry columns from dataFieldItems', () => {
    const dataset = {
      id: 'ds-1',
      columns: [
        { name: 'pop', type: 'number' },
        { name: 'geom', type: 'geometry' },
        { name: 'name', type: 'string' }
      ]
    };
    datasetsStoreMock.datasets = [dataset];
    const analysis = useDatasetAnalysis({
      getSelectedVisualization: () => ({ datasetId: 'ds-1' }) as never
    });
    const items = analysis.dataFieldItems;
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.text)).toEqual(['pop', 'name']);
  });

  it('isNumericDataField returns true only for number columns', () => {
    const dataset = {
      id: 'ds-1',
      columns: [
        { name: 'pop', type: 'number' },
        { name: 'name', type: 'string' }
      ]
    };
    datasetsStoreMock.datasets = [dataset];
    const analysis = useDatasetAnalysis({
      getSelectedVisualization: () => ({ datasetId: 'ds-1' }) as never
    });
    expect(analysis.isNumericDataField('pop')).toBe(true);
    expect(analysis.isNumericDataField('name')).toBe(false);
    expect(analysis.isNumericDataField(undefined)).toBe(false);
  });

  it('hasGeometry true when dataset has joinedBasemap', () => {
    const dataset = {
      id: 'ds-1',
      joinedBasemap: 'fr-com',
      columns: []
    };
    datasetsStoreMock.datasets = [dataset];
    const analysis = useDatasetAnalysis({
      getSelectedVisualization: () => ({ datasetId: 'ds-1' }) as never
    });
    expect(analysis.hasGeometry).toBe(true);
  });

  it('hasGeometry true when both lat and lng columns detected', () => {
    const dataset = {
      id: 'ds-1',
      columns: [],
      geoDetection: {
        geoColumns: [
          { name: 'lat_col', type: 'lat' },
          { name: 'lng_col', type: 'lng' }
        ]
      }
    };
    datasetsStoreMock.datasets = [dataset];
    const analysis = useDatasetAnalysis({
      getSelectedVisualization: () => ({ datasetId: 'ds-1' }) as never
    });
    expect(analysis.hasGeometry).toBe(true);
  });

  it('hasGeometry false when only lat detected (no lng)', () => {
    const dataset = {
      id: 'ds-1',
      columns: [],
      geoDetection: {
        geoColumns: [{ name: 'lat_col', type: 'lat' }]
      }
    };
    datasetsStoreMock.datasets = [dataset];
    const analysis = useDatasetAnalysis({
      getSelectedVisualization: () => ({ datasetId: 'ds-1' }) as never
    });
    expect(analysis.hasGeometry).toBe(false);
  });

  it('hasYearDimension true when isLikelyYearColumn matches a column', () => {
    isLikelyYearColumnMock.mockReturnValue(true);
    const dataset = {
      id: 'ds-1',
      columns: [{ name: 'year', type: 'number' }],
      data: []
    };
    datasetsStoreMock.datasets = [dataset];
    const analysis = useDatasetAnalysis({
      getSelectedVisualization: () => ({ datasetId: 'ds-1' }) as never
    });
    expect(analysis.hasYearDimension).toBe(true);
  });

  it('falls back to selectedDataset when viz has no datasetId', () => {
    const dataset = {
      id: 'ds-1',
      columns: [{ name: 'pop', type: 'number' }]
    };
    datasetsStoreMock.selectedDataset = dataset;
    const analysis = useDatasetAnalysis({
      getSelectedVisualization: () => undefined
    });
    expect(analysis.dataFieldItems).toEqual([
      { id: 0, text: 'pop', type: 'number' }
    ]);
  });
});
