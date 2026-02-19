import { describe, expect, it } from 'vitest';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';

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
    file: 'world-countries-10m',
    title: 'World > countries (high res)',
    description: 'Natural Earth 10m admin 0 countries - high resolution',
    level: 'Pays',
    source: 'Natural Earth',
    date: '2024',
    bbox: [-180, -90, 180, 90],
    projection: 'WGS84',
    layers: []
  },
  {
    file: 'france-region-2025',
    title: 'France > regions',
    description: 'Fond de carte des regions francaises',
    level: 'Regions',
    source: 'IGN',
    date: '2025',
    bbox: [-5.52, 40.98, 10.7, 50.85],
    projection: 'Lambert-93',
    layers: []
  },
  {
    file: 'france-departement-2024',
    title: 'France > departements',
    description: 'Fond de carte des departements francais',
    level: 'Departements',
    source: 'IGN',
    date: '2024',
    bbox: [-5.52, 40.98, 10.7, 50.85],
    projection: 'Lambert-93',
    layers: []
  },
  {
    file: 'europe-nuts2-2021',
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

function filterBasemaps(
  basemaps: BasemapMetadata[],
  searchQuery: string,
  selectedYear: string
): BasemapMetadata[] {
  let results = [...basemaps];

  const trimmedQuery = searchQuery.trim();
  if (trimmedQuery) {
    const query = trimmedQuery.toLowerCase();
    results = results.filter(
      (b) =>
        b.title.toLowerCase().includes(query) ||
        b.description.toLowerCase().includes(query) ||
        b.source.toLowerCase().includes(query)
    );
  }

  if (selectedYear !== 'all') {
    results = results.filter((b) => b.date === selectedYear);
  }

  return results;
}

function getAvailableYears(basemaps: BasemapMetadata[]): string[] {
  const years = new Set(basemaps.map((b) => b.date));
  return Array.from(years).sort((a, b) => b.localeCompare(a));
}

describe('basemap-catalog-tab filtering', () => {
  describe('filterBasemaps', () => {
    it('returns all basemaps when no filters applied', () => {
      const results = filterBasemaps(mockBasemaps, '', 'all');
      expect(results.length).toBe(5);
    });

    it('filters by search query in title', () => {
      const results = filterBasemaps(mockBasemaps, 'World', 'all');
      expect(results.length).toBe(2);
      expect(
        results.every((b) => b.title.toLowerCase().includes('world'))
      ).toBe(true);
    });

    it('filters by search query in description', () => {
      const results = filterBasemaps(mockBasemaps, 'Natural Earth', 'all');
      expect(results.length).toBe(2);
    });

    it('filters by search query in source', () => {
      const results = filterBasemaps(mockBasemaps, 'IGN', 'all');
      expect(results.length).toBe(2);
      expect(results.every((b) => b.source.toLowerCase().includes('ign'))).toBe(
        true
      );
    });

    it('is case-insensitive', () => {
      const results1 = filterBasemaps(mockBasemaps, 'WORLD', 'all');
      const results2 = filterBasemaps(mockBasemaps, 'world', 'all');
      const results3 = filterBasemaps(mockBasemaps, 'WoRlD', 'all');
      expect(results1.length).toBe(2);
      expect(results2.length).toBe(2);
      expect(results3.length).toBe(2);
    });

    it('filters by year', () => {
      const results = filterBasemaps(mockBasemaps, '', '2024');
      expect(results.length).toBe(3);
      expect(results.every((b) => b.date === '2024')).toBe(true);
    });

    it('combines search and year filters', () => {
      const results = filterBasemaps(mockBasemaps, 'France', '2024');
      expect(results.length).toBe(1);
      expect(results[0].file).toBe('france-departement-2024');
    });

    it('returns empty array when no matches', () => {
      const results = filterBasemaps(mockBasemaps, 'NonexistentPlace', 'all');
      expect(results).toEqual([]);
    });

    it('returns empty array when year filter has no matches', () => {
      const results = filterBasemaps(mockBasemaps, '', '1999');
      expect(results).toEqual([]);
    });

    it('trims whitespace from search query', () => {
      const results = filterBasemaps(mockBasemaps, '  World  ', 'all');
      expect(results.length).toBe(2);
    });

    it('can exclude suggested basemaps from filtered results', () => {
      const filteredResults = filterBasemaps(mockBasemaps, 'France', 'all');
      expect(filteredResults.length).toBe(2);

      const suggestedFile = 'france-region-2025';
      const suggestionIds = new Set([suggestedFile]);
      const displayResults = filteredResults.filter(
        (b) => !suggestionIds.has(b.file)
      );

      expect(displayResults.length).toBe(1);
      expect(displayResults[0].file).toBe('france-departement-2024');
    });
  });

  describe('getAvailableYears', () => {
    it('returns unique years sorted descending', () => {
      const years = getAvailableYears(mockBasemaps);
      expect(years).toEqual(['2025', '2024', '2021']);
    });

    it('returns empty array for empty basemaps', () => {
      const years = getAvailableYears([]);
      expect(years).toEqual([]);
    });
  });
});
