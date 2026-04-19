import { describe, expect, it, vi } from 'vitest';
import { GEO_COLUMN_TYPE } from '$lib/features/commons/constants/data.constants';
import type { DatasetResult } from '$lib/features/data-pipeline/types';

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: { computeJoinSynthesis: vi.fn() }
}));
vi.mock('$lib/features/map/services/basemap-catalog.service.svelte', () => ({
  basemapCatalogService: {
    isLoaded: false,
    basemaps: [],
    catalogBasemaps: [],
    loadCatalog: vi.fn(),
    getBasemapById: vi.fn(),
    getSuggestions: vi.fn(() => []),
    getSuggestionsByGPSBbox: vi.fn(() => [])
  },
  rankBasemapsByJoinSynthesis: vi.fn(() => [])
}));
vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: { ensureCurrentLayersLoaded: vi.fn() }
}));
vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    get selectedDataset() {
      return null;
    },
    datasets: []
  }
}));
vi.mock('$lib/features/commons/store/data-tab.store.svelte', () => ({
  dataTabActions: {
    setGeolocationState: vi.fn(),
    setBasemapJoinState: vi.fn()
  },
  dataTabState: {
    geolocation: { linkedVariableName: '' },
    basemapJoin: {},
    enrichData: {}
  }
}));
vi.mock('$lib/features/commons/store/basemap-style.store.svelte', () => ({
  basemapStyleStore: { referenceBasemapId: null, setReferenceBasemap: vi.fn() }
}));
vi.mock('$lib/features/commons/store/project.store.svelte', () => ({
  projectStore: { currentProject: null, updateProjectData: vi.fn() }
}));
vi.mock('$lib/features/map/stores/osm-basemap.store.svelte', () => ({
  osmBasemapStore: { isActive: false, activeOSMBasemap: null, clear: vi.fn() }
}));

import { pickAutoLinkedGeoColumn } from '$lib/features/main-toolbar/data-tab/enrich-data/hooks/use-enrichment-basemap.svelte';

function makeDataset(overrides: Partial<DatasetResult> = {}): DatasetResult {
  return {
    id: 'd1',
    name: 'test',
    sourceFileId: 'd1',
    tableName: 't1',
    columns: [
      { name: 'OGC_FID', type: 'number' as const, stats: {} as never },
      { name: 'NUTS_ID', type: 'text' as const, stats: {} as never },
      { name: 'NAME_LATN', type: 'text' as const, stats: {} as never },
      { name: 'geom', type: 'text' as const, stats: {} as never }
    ],
    rowCount: 332,
    metadata: {
      processedAt: new Date(),
      fileType: 'GEOJSON',
      parserUsed: 'DuckDB',
      transformations: []
    },
    format: 'GEOJSON',
    fileSize: 0,
    createdAt: new Date(),
    ...overrides
  } as DatasetResult;
}

describe('pickAutoLinkedGeoColumn', () => {
  it('picks the suggestedPrimaryGeoColumn when present and not a coordinate', () => {
    const dataset = makeDataset({
      geoDetection: {
        hasGeoColumns: true,
        warnings: [],
        geoColumns: [
          {
            columnName: 'NUTS_ID',
            type: GEO_COLUMN_TYPE.NUTS,
            confidence: 1,
            index: 1
          }
        ],
        suggestedPrimaryGeoColumn: {
          columnName: 'NUTS_ID',
          type: GEO_COLUMN_TYPE.NUTS,
          confidence: 1,
          index: 1
        }
      }
    });
    const picked = pickAutoLinkedGeoColumn(dataset);
    expect(picked).toEqual({ columnName: 'NUTS_ID', index: 1 });
  });

  it('returns null when only coordinate columns are detected (lat/lon — not for textual join)', () => {
    const dataset = makeDataset({
      geoDetection: {
        hasGeoColumns: true,
        warnings: [],
        geoColumns: [
          {
            columnName: 'lat',
            type: GEO_COLUMN_TYPE.LATITUDE,
            confidence: 1,
            index: 0
          },
          {
            columnName: 'lon',
            type: GEO_COLUMN_TYPE.LONGITUDE,
            confidence: 1,
            index: 1
          }
        ]
      }
    });
    expect(pickAutoLinkedGeoColumn(dataset)).toBeNull();
  });

  it('falls back to the highest-confidence non-coordinate column when no suggested column is provided', () => {
    const dataset = makeDataset({
      geoDetection: {
        hasGeoColumns: true,
        warnings: [],
        geoColumns: [
          {
            columnName: 'NAME_LATN',
            type: GEO_COLUMN_TYPE.REGION,
            confidence: 0.6,
            index: 2
          },
          {
            columnName: 'NUTS_ID',
            type: GEO_COLUMN_TYPE.NUTS,
            confidence: 0.9,
            index: 1
          }
        ]
      }
    });
    const picked = pickAutoLinkedGeoColumn(dataset);
    expect(picked).toEqual({ columnName: 'NUTS_ID', index: 1 });
  });

  it('returns null when geoDetection is absent', () => {
    expect(pickAutoLinkedGeoColumn(makeDataset())).toBeNull();
  });

  it('skips a coordinate-typed suggestion and falls back to a textual candidate', () => {
    const dataset = makeDataset({
      geoDetection: {
        hasGeoColumns: true,
        warnings: [],
        geoColumns: [
          {
            columnName: 'lat',
            type: GEO_COLUMN_TYPE.LATITUDE,
            confidence: 1,
            index: 0
          },
          {
            columnName: 'NUTS_ID',
            type: GEO_COLUMN_TYPE.NUTS,
            confidence: 0.9,
            index: 1
          }
        ],
        suggestedPrimaryGeoColumn: {
          columnName: 'lat',
          type: GEO_COLUMN_TYPE.LATITUDE,
          confidence: 1,
          index: 0
        }
      }
    });
    const picked = pickAutoLinkedGeoColumn(dataset);
    expect(picked).toEqual({ columnName: 'NUTS_ID', index: 1 });
  });
});
