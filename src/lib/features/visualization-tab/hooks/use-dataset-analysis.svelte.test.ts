import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  datasetsStoreMock,
  duckDBOrchestratorMock,
  resolveAllowedPrimitiveFiltersMock
} = vi.hoisted(() => ({
  datasetsStoreMock: {
    datasets: [] as Array<Record<string, unknown>>,
    selectedDataset: null as Record<string, unknown> | null
  },
  duckDBOrchestratorMock: {
    getDatasetBySourceFile: vi.fn().mockReturnValue(null)
  },
  resolveAllowedPrimitiveFiltersMock: vi.fn(() => ['point', 'polygon'])
}));

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  ALL_PRIMITIVE_FILTERS: ['point', 'line', 'polygon'],
  PrimitiveFilterType: {
    POINT: 'point',
    POLYGON: 'polygon',
    LINE: 'line',
    TEXT: 'text'
  },
  resolveAllowedPrimitiveFilters: resolveAllowedPrimitiveFiltersMock
}));

vi.mock('$lib/features/commons/constants/data.constants', () => ({
  INTERNAL_COLUMN: {
    ID: '__id',
    FEATURE_ID: '__feature_id__',
    GEOM: 'geom',
    GEOMETRY: 'geometry',
    WKB_GEOMETRY: 'wkb_geometry',
    THE_GEOM: 'the_geom'
  },
  EXCLUDED_COLUMNS: ['geom', 'geometry', '__id', '__feature_id__'],
  COLUMN_TYPE_GEOMETRY: 'geometry',
  GEO_COLUMN_TYPE: { LATITUDE: 'lat', LONGITUDE: 'lng' }
}));

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: datasetsStoreMock
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: duckDBOrchestratorMock
}));

import { useDatasetAnalysis } from './use-dataset-analysis.svelte';

describe('useDatasetAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    datasetsStoreMock.datasets = [];
    datasetsStoreMock.selectedDataset = null;
    duckDBOrchestratorMock.getDatasetBySourceFile.mockReturnValue(null);
    resolveAllowedPrimitiveFiltersMock.mockReturnValue(['point', 'polygon']);
  });

  it('returns empty dataFieldItems when no dataset selected', () => {
    const analysis = useDatasetAnalysis({
      getSelectedVisualization: () => undefined
    });
    expect(analysis.dataFieldItems).toEqual([]);
  });

  it('filters out geometry and internal columns from dataFieldItems', () => {
    const dataset = {
      id: 'ds-1',
      columns: [
        { name: 'pop', type: 'number' },
        { name: 'geom', type: 'geometry' },
        { name: 'wkb_geometry', type: 'string' },
        { name: 'the_geom', type: 'string' },
        { name: '__id', type: 'number' },
        { name: '__feature_id__', type: 'string' },
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

  it('isNumericDataField returns true for number and numeric columns', () => {
    const dataset = {
      id: 'ds-1',
      columns: [
        { name: 'pop', type: 'number' },
        { name: 'ratio', type: 'numeric' },
        { name: 'name', type: 'string' }
      ]
    };
    datasetsStoreMock.datasets = [dataset];
    const analysis = useDatasetAnalysis({
      getSelectedVisualization: () => ({ datasetId: 'ds-1' }) as never
    });
    expect(analysis.isNumericDataField('pop')).toBe(true);
    expect(analysis.isNumericDataField('ratio')).toBe(true);
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

  it('exposes symbols and lines, but not polygons, for line-compatible datasets', () => {
    resolveAllowedPrimitiveFiltersMock.mockReturnValue(['point', 'line']);
    const dataset = {
      id: 'ds-1',
      geometry: { type: 'LineString' },
      columns: []
    };
    datasetsStoreMock.datasets = [dataset];
    const analysis = useDatasetAnalysis({
      getSelectedVisualization: () => ({ datasetId: 'ds-1' }) as never
    });

    expect(analysis.showsSymbolsConfig).toBe(true);
    expect(analysis.showsLinesConfig).toBe(true);
    expect(analysis.showsPolygonsConfig).toBe(false);
  });

  it('disables primitive sections when no geometry capability is available', () => {
    resolveAllowedPrimitiveFiltersMock.mockReturnValue([]);
    const dataset = {
      id: 'ds-1',
      columns: [{ name: 'name', type: 'string' }]
    };
    datasetsStoreMock.datasets = [dataset];
    const analysis = useDatasetAnalysis({
      getSelectedVisualization: () => ({ datasetId: 'ds-1' }) as never
    });

    expect(analysis.hasGeometry).toBe(false);
    expect(analysis.showsSymbolsConfig).toBe(false);
    expect(analysis.showsLinesConfig).toBe(false);
    expect(analysis.showsPolygonsConfig).toBe(false);
  });

  it('keeps primitive sections disabled while no visualization is selected', () => {
    const dataset = {
      id: 'ds-1',
      geometry: { type: 'Point' },
      columns: [{ name: 'name', type: 'string' }]
    };
    datasetsStoreMock.selectedDataset = dataset;
    const analysis = useDatasetAnalysis({
      getSelectedVisualization: () => undefined
    });

    expect(analysis.availablePrimitiveFilters).toEqual([]);
    expect(analysis.showsSymbolsConfig).toBe(false);
    expect(analysis.showsLinesConfig).toBe(false);
    expect(analysis.showsPolygonsConfig).toBe(false);
    expect(resolveAllowedPrimitiveFiltersMock).not.toHaveBeenCalled();
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
