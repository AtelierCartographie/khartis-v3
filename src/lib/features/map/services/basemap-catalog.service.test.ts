import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessedDataset, ColumnInfo } from '$lib/features/data-pipeline';
import type { GeoColumnResult } from '$lib/features/commons/utils/geo-detector.utils';
import type {
  BasemapMetadata,
  BasemapSuggestion
} from '../types/basemap.types';

const mockBasemaps: BasemapMetadata[] = [
  {
    file: 'world-countries-50m',
    title: 'World > countries',
    description: 'Natural Earth 50m admin 0 countries',
    level: 'Pays',
    source: 'Natural Earth',
    date: '2024',
    bbox: [-180, -90, 180, 90],
    projection: 'WGS84',
    layers: []
  },
  {
    file: 'france-region-2025',
    title: 'France > régions',
    description: 'Fond de carte des régions françaises',
    level: 'Régions',
    source: 'IGN',
    date: '2025',
    bbox: [-5.52, 40.98, 10.7, 50.85],
    projection: 'Lambert-93',
    layers: []
  },
  {
    file: 'france-departement-2025',
    title: 'France > départements',
    description: 'Fond de carte des départements français',
    level: 'Départements',
    source: 'IGN',
    date: '2025',
    bbox: [-5.52, 40.98, 10.7, 50.85],
    projection: 'Lambert-93',
    layers: []
  },
  {
    file: 'nuts2-europe-2021',
    title: 'Europe > NUTS 2 regions',
    description: 'NUTS level 2 regions - 2021 classification',
    level: 'NUTS 2',
    source: 'Eurostat GISCO',
    date: '2021',
    bbox: [-31.27, 27.64, 44.82, 71.19],
    projection: 'WGS84',
    layers: []
  }
];

function createMockColumn(
  name: string,
  type: string,
  subtype?: string
): ColumnInfo & { subtype?: string } {
  return {
    name,
    type: type as 'string' | 'number' | 'boolean' | 'date',
    nullable: false,
    unique: false,
    sampleValues: [],
    subtype
  } as ColumnInfo & { subtype?: string };
}

function createMockDataset(
  columns: (ColumnInfo & { subtype?: string })[],
  geoColumns?: GeoColumnResult[]
): ProcessedDataset {
  return {
    id: 'test-dataset',
    name: 'Test Dataset',
    sourceFileId: 'test-file-id',
    format: 'csv',
    data: [],
    rowCount: 100,
    columns: columns as ColumnInfo[],
    analysis: {
      hasGeoData: false,
      suggestedGeoColumn: undefined,
      rowCount: 100,
      warnings: [],
      columns: [],
      geoColumns: []
    },
    createdAt: new Date(),
    fileSize: 1024,
    metadata: {
      processedAt: new Date(),
      transformations: []
    },
    geoDetection: geoColumns
      ? {
          hasGeoColumns: true,
          geoColumns: geoColumns,
          warnings: []
        }
      : undefined
  };
}

describe('basemap-catalog.service', () => {
  let service: typeof import('./basemap-catalog.service.svelte').basemapCatalogService;

  beforeEach(async () => {
    vi.resetModules();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBasemaps)
    });
    service = (await import('./basemap-catalog.service.svelte'))
      .basemapCatalogService;
  });

  describe('loadCatalog', () => {
    it('loads catalog from fetch', async () => {
      await service.loadCatalog();
      expect(service.isLoaded).toBe(true);
      expect(service.basemaps.length).toBe(4);
    });

    it('returns early if already loaded', async () => {
      await service.loadCatalog();
      const firstLoad = service.basemaps.length;
      await service.loadCatalog();
      expect(service.basemaps.length).toBe(firstLoad);
    });
  });

  describe('getSuggestions', () => {
    beforeEach(async () => {
      await service.loadCatalog();
    });

    it('returns empty array when no catalog loaded', async () => {
      vi.resetModules();
      const freshService = (await import('./basemap-catalog.service.svelte'))
        .basemapCatalogService;
      const dataset = createMockDataset([
        createMockColumn('Nom région', 'string', 'geographic')
      ]);
      const suggestions = freshService.getSuggestions(dataset, 3);
      expect(suggestions).toEqual([]);
    });

    it('returns empty array when no geographic column found', async () => {
      const dataset = createMockDataset([createMockColumn('Value', 'number')]);
      const suggestions = service.getSuggestions(dataset, 3);
      expect(suggestions).toEqual([]);
    });

    it('returns suggestions for region column', async () => {
      const dataset = createMockDataset([
        createMockColumn('Nom région', 'string', 'geographic')
      ]);
      const suggestions = service.getSuggestions(dataset, 3);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]).toHaveProperty('matchScore');
      expect(suggestions[0]).toHaveProperty('matchReason');
    });

    it('returns suggestions for department column', async () => {
      const dataset = createMockDataset([
        createMockColumn('Nom département', 'string', 'geographic')
      ]);
      const suggestions = service.getSuggestions(dataset, 3);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.file.includes('departement'))).toBe(
        true
      );
    });

    it('limits suggestions to specified limit', async () => {
      const dataset = createMockDataset([
        createMockColumn('country', 'string', 'geographic')
      ]);
      const suggestions = service.getSuggestions(dataset, 2);
      expect(suggestions.length).toBeLessThanOrEqual(2);
    });

    it('sorts suggestions by match score descending', async () => {
      const dataset = createMockDataset([
        createMockColumn('region', 'string', 'geographic')
      ]);
      const suggestions = service.getSuggestions(dataset, 10);
      for (let i = 1; i < suggestions.length; i++) {
        expect(suggestions[i - 1].matchScore).toBeGreaterThanOrEqual(
          suggestions[i].matchScore
        );
      }
    });

    it('uses explicit geoColumnName when provided', async () => {
      const dataset = createMockDataset([
        createMockColumn('region', 'string', 'geographic'),
        createMockColumn('country', 'string')
      ]);
      const suggestions = service.getSuggestions(dataset, 3, 'country');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('prioritizes world basemap for country_name geo type', async () => {
      const dataset = createMockDataset(
        [createMockColumn('Name', 'string', 'geographic')],
        [
          {
            index: 0,
            columnName: 'Name',
            type: 'country_name',
            confidence: 0.95
          }
        ]
      );
      const suggestions = service.getSuggestions(dataset, 3);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].file).toBe('world-countries-50m');
      expect(suggestions[0].matchScore).toBeGreaterThanOrEqual(60);
    });

    it('prioritizes world basemap for iso2 geo type', async () => {
      const dataset = createMockDataset(
        [createMockColumn('Code', 'string', 'geographic')],
        [
          {
            index: 0,
            columnName: 'Code',
            type: 'iso2',
            confidence: 0.95
          }
        ]
      );
      const suggestions = service.getSuggestions(dataset, 3);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].file).toBe('world-countries-50m');
      expect(suggestions[0].matchScore).toBeGreaterThanOrEqual(60);
    });

    it('prioritizes world basemap for iso3 geo type', async () => {
      const dataset = createMockDataset(
        [createMockColumn('ISO3', 'string', 'geographic')],
        [
          {
            index: 0,
            columnName: 'ISO3',
            type: 'iso3',
            confidence: 0.95
          }
        ]
      );
      const suggestions = service.getSuggestions(dataset, 3);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].file).toBe('world-countries-50m');
      expect(suggestions[0].matchScore).toBeGreaterThanOrEqual(60);
    });

    it('prioritizes NUTS basemap for nuts geo type', async () => {
      const dataset = createMockDataset(
        [createMockColumn('NUTSCode', 'string', 'geographic')],
        [
          {
            index: 0,
            columnName: 'NUTSCode',
            type: 'nuts',
            confidence: 0.95
          }
        ]
      );
      const suggestions = service.getSuggestions(dataset, 3);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].file).toBe('nuts2-europe-2021');
      expect(suggestions[0].matchScore).toBeGreaterThanOrEqual(60);
    });
  });

  describe('getBasemapById', () => {
    beforeEach(async () => {
      await service.loadCatalog();
    });

    it('returns basemap when found', () => {
      const basemap = service.getBasemapById('world-countries-50m');
      expect(basemap).not.toBeNull();
      expect(basemap?.title).toBe('World > countries');
    });

    it('returns null when not found', () => {
      const basemap = service.getBasemapById('nonexistent');
      expect(basemap).toBeNull();
    });
  });

  describe('addCustomBasemap', () => {
    beforeEach(async () => {
      await service.loadCatalog();
    });

    it('adds new basemap to catalog', () => {
      const customBasemap: BasemapMetadata = {
        file: 'custom-basemap',
        title: 'Custom Basemap',
        description: 'A custom basemap',
        source: 'Custom',
        date: '2025',
        bbox: [0, 0, 10, 10],
        projection: 'WGS84',
        layers: []
      };
      service.addCustomBasemap(customBasemap);
      expect(service.basemaps.some((b) => b.file === 'custom-basemap')).toBe(
        true
      );
    });

    it('updates existing basemap with same file', () => {
      const customBasemap: BasemapMetadata = {
        file: 'world-countries-50m',
        title: 'Updated World Countries',
        description: 'Updated description',
        source: 'Custom',
        date: '2025',
        bbox: [0, 0, 10, 10],
        projection: 'WGS84',
        layers: []
      };
      service.addCustomBasemap(customBasemap);
      const basemap = service.getBasemapById('world-countries-50m');
      expect(basemap?.title).toBe('Updated World Countries');
    });
  });

  describe('searchBasemaps', () => {
    beforeEach(async () => {
      await service.loadCatalog();
    });

    it('returns matching basemaps', () => {
      const results = service.searchBasemaps('France');
      expect(results.length).toBeGreaterThan(0);
      expect(
        results.every(
          (b) =>
            b.title.toLowerCase().includes('france') ||
            b.description.toLowerCase().includes('france')
        )
      ).toBe(true);
    });

    it('returns empty array when no matches', () => {
      const results = service.searchBasemaps('NonexistentPlace');
      expect(results).toEqual([]);
    });
  });

  describe('filterByYear', () => {
    beforeEach(async () => {
      await service.loadCatalog();
    });

    it('filters basemaps by minimum year', () => {
      const results = service.filterByYear(2024);
      expect(results.every((b) => parseInt(b.date) >= 2024)).toBe(true);
    });

    it('filters basemaps by year range', () => {
      const results = service.filterByYear(2020, 2024);
      expect(
        results.every((b) => {
          const year = parseInt(b.date);
          return year >= 2020 && year <= 2024;
        })
      ).toBe(true);
    });
  });
});

describe('BasemapSuggestion type', () => {
  it('extends BasemapMetadata with matchScore and matchReason', () => {
    const suggestion: BasemapSuggestion = {
      file: 'test',
      title: 'Test',
      description: 'Test description',
      source: 'Test',
      date: '2024',
      bbox: [0, 0, 1, 1],
      projection: 'WGS84',
      layers: [],
      matchScore: 85,
      matchReason: 'Region match'
    };
    expect(suggestion.matchScore).toBe(85);
    expect(suggestion.matchReason).toBe('Region match');
  });
});
