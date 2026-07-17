import { describe, expect, it } from 'vitest';
import type { GPSBounds } from '$lib/features/duckdb';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import type { ProcessedDataset } from '$lib/features/data-pipeline';
import {
  rankBasemapsByGPSBbox,
  rankBasemapsByJoinSynthesis,
  calculateGeoColumnBasemapMatchScore,
  rankBasemapsByGeoColumn
} from '$lib/features/map/services/basemap-catalog.service.svelte';
import { GEO_COLUMN_TYPE } from '$lib/features/commons/constants/data.constants';

function basemap(
  partial: Pick<
    BasemapMetadata,
    'file' | 'title_fr' | 'title_en' | 'date' | 'bbox'
  > &
    Partial<BasemapMetadata>
): BasemapMetadata {
  return {
    file: partial.file,
    title_fr: partial.title_fr,
    title_en: partial.title_en,
    date: partial.date,
    bbox: partial.bbox,
    source: partial.source ?? 'test',
    proj_source: partial.proj_source ?? 'EPSG:4326',
    proj_to: partial.proj_to ?? { type: 'simple' },
    layers: partial.layers ?? [],
    simplification_level: partial.simplification_level,
    isCustom: partial.isCustom
  };
}

const WORLD_BASEMAP = basemap({
  file: 'monde-countries-2024-medium',
  title_fr: 'Monde · par pays',
  title_en: 'World by country',
  date: '2024',
  bbox: [-180, -90, 180, 90],
  simplification_level: 'medium'
});

const FRANCE_REGIONS = basemap({
  file: 'france-region-2025-high',
  title_fr: 'France · par régions',
  title_en: 'France by regions',
  date: '2025',
  bbox: [-61.81, -21.39, 55.83, 51.09],
  simplification_level: 'high'
});

const FRANCE_DEPARTMENTS = basemap({
  file: 'france-departement-2025-high',
  title_fr: 'France · par départements',
  title_en: 'France by departments',
  date: '2025',
  bbox: [-61.81, -21.39, 55.83, 51.09],
  simplification_level: 'high'
});

const EUROPE_NUTS2 = basemap({
  file: 'europe-nuts2-2024-medium',
  title_fr: 'Europe · par NUTS 2',
  title_en: 'Europe by NUTS 2',
  date: '2024',
  bbox: [-63.13, -21.4, 55.86, 80.4],
  simplification_level: 'medium'
});

describe('[S02] rankBasemapsByJoinSynthesis — CSV-01 World ISO', () => {
  it('ranks World basemap top when every ISO Alpha-3 code matches a world candidate', () => {
    const synthesis = [
      {
        basemap: 'monde-countries-2024-medium',
        shareCandidate: 0.988, // 80/81 matched in live run
        shareBasemap: 0.3
      }
    ];
    const suggestions = rankBasemapsByJoinSynthesis(
      [WORLD_BASEMAP, FRANCE_REGIONS, EUROPE_NUTS2],
      synthesis,
      3
    );
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].file).toBe('monde-countries-2024-medium');
    expect(suggestions[0].matchScore).toBeGreaterThanOrEqual(0.9);
  });
});

describe('[S02] rankBasemapsByJoinSynthesis — CSV-08 France régions', () => {
  it('ranks France regions top when region codes match perfectly (18/18)', () => {
    const synthesis = [
      {
        basemap: 'france-region-2025-high',
        shareCandidate: 1.0,
        shareBasemap: 1.0
      }
    ];
    const suggestions = rankBasemapsByJoinSynthesis(
      [FRANCE_REGIONS, FRANCE_DEPARTMENTS, WORLD_BASEMAP],
      synthesis,
      3
    );
    expect(suggestions[0].file).toBe('france-region-2025-high');
    expect(suggestions[0].matchScore).toBe(1.0);
  });
});

describe('[S02] rankBasemapsByJoinSynthesis — GEO-NUTS2 granularity disambiguation', () => {
  const EUROPE_NUTS1 = basemap({
    file: 'europe-nuts1-2024-medium',
    title_fr: 'Europe · par NUTS 1',
    title_en: 'Europe by NUTS 1',
    date: '2024',
    bbox: [-63.13, -21.4, 55.86, 80.4],
    simplification_level: 'medium'
  });
  const EUROPE_NUTS3 = basemap({
    file: 'europe-nuts3-2024-medium',
    title_fr: 'Europe · par NUTS 3',
    title_en: 'Europe by NUTS 3',
    date: '2024',
    bbox: [-63.13, -21.4, 55.86, 80.4],
    simplification_level: 'medium'
  });

  it('prefers the NUTS level whose granularity matches the dataset (shareBasemap closest to 1)', () => {
    // Live shape for a NUTS 2 dataset (332 features) joined against the 3 NUTS levels.
    // Every level matches every candidate textually, so shareCandidate is 100 % for all.
    // The discriminator is shareBasemap: NUTS 1 over-matches (332/92 = 3.6),
    // NUTS 3 under-matches (332/1500 = 0.22), NUTS 2 is exact (332/332 ≈ 1).
    const synthesis = [
      {
        basemap: 'europe-nuts1-2024-medium',
        shareCandidate: 100,
        shareBasemap: 3.6
      },
      {
        basemap: 'europe-nuts2-2024-medium',
        shareCandidate: 100,
        shareBasemap: 1.0
      },
      {
        basemap: 'europe-nuts3-2024-medium',
        shareCandidate: 100,
        shareBasemap: 0.22
      },
      {
        basemap: 'monde-countries-2024-medium',
        shareCandidate: 100,
        shareBasemap: 1.26
      }
    ];
    const suggestions = rankBasemapsByJoinSynthesis(
      [EUROPE_NUTS1, EUROPE_NUTS2, EUROPE_NUTS3, WORLD_BASEMAP],
      synthesis,
      4
    );
    expect(suggestions[0].file).toBe('europe-nuts2-2024-medium');
    expect(suggestions[0].matchScore).toBe(100);
  });
});

describe('[S02] rankBasemapsByJoinSynthesis — CSV-03 fuzzy match', () => {
  it('still returns the world basemap even when most candidates fail to match', () => {
    const synthesis = [
      {
        basemap: 'monde-countries-2024-medium',
        shareCandidate: 0.25, // 1/4 matched in live run after fuzzy lookup
        shareBasemap: 0.005
      }
    ];
    const suggestions = rankBasemapsByJoinSynthesis(
      [WORLD_BASEMAP, FRANCE_REGIONS],
      synthesis,
      3
    );
    expect(suggestions[0].file).toBe('monde-countries-2024-medium');
    expect(suggestions[0].matchScore).toBeLessThan(0.5);
  });

  it('returns an empty list when the synthesis references basemaps not in the catalog', () => {
    const synthesis = [
      {
        basemap: 'unknown-catalog-2020',
        shareCandidate: 1.0,
        shareBasemap: 1.0
      }
    ];
    const suggestions = rankBasemapsByJoinSynthesis(
      [WORLD_BASEMAP, FRANCE_REGIONS],
      synthesis,
      3
    );
    expect(suggestions).toHaveLength(0);
  });
});

describe('[S02] rankBasemapsByGPSBbox — CSV-04 GPS Seveso IDF', () => {
  const sevesoIdfBounds: GPSBounds = {
    minLon: 1.55,
    minLat: 48.18,
    maxLon: 3.18,
    maxLat: 49.21
  };

  it('prefers France departments over World when GPS extent is in Île-de-France', () => {
    const suggestions = rankBasemapsByGPSBbox(
      [WORLD_BASEMAP, FRANCE_DEPARTMENTS, EUROPE_NUTS2],
      sevesoIdfBounds,
      3
    );
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].file).toBe('france-departement-2025-high');
  });
});

describe('[S02] rankBasemapsByGPSBbox — GEO-01 NUTS2 Europe extent (nuts2_data.geojson)', () => {
  // Real bbox computed from tests-datasets/geojson/nuts2_data.geojson,
  // which includes French DOM-TOM on its Eurostat extract.
  const nuts2Bounds: GPSBounds = {
    minLon: -63.09,
    minLat: -21.39,
    maxLon: 55.84,
    maxLat: 71.12
  };

  it('ranks Europe NUTS-2 top (100%) ahead of France for a pan-European dataset', () => {
    const suggestions = rankBasemapsByGPSBbox(
      [FRANCE_REGIONS, FRANCE_DEPARTMENTS, EUROPE_NUTS2, WORLD_BASEMAP],
      nuts2Bounds,
      4
    );
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].file).toBe('europe-nuts2-2024-medium');
    expect(suggestions[0].matchScore).toBe(100);
  });

  it('never places a France basemap at the top when data covers the whole continent', () => {
    const suggestions = rankBasemapsByGPSBbox(
      [FRANCE_REGIONS, FRANCE_DEPARTMENTS, EUROPE_NUTS2, WORLD_BASEMAP],
      nuts2Bounds,
      4
    );
    const franceIndex = suggestions.findIndex((suggestion) =>
      suggestion.file.startsWith('france-')
    );
    expect(franceIndex).not.toBe(0);
  });

  it('rejects a narrower France basemap when it does not fully contain the data', () => {
    const suggestions = rankBasemapsByGPSBbox(
      [FRANCE_REGIONS, EUROPE_NUTS2],
      nuts2Bounds,
      3
    );
    const franceSuggestion = suggestions.find((suggestion) =>
      suggestion.file.startsWith('france-')
    );
    // France's bbox does not cover northern Europe → score strictly below 100.
    expect(franceSuggestion?.matchScore ?? 0).toBeLessThan(100);
  });
});

describe('[S02] calculateGeoColumnBasemapMatchScore', () => {
  it('awards a high score to ISO codes paired with the world basemap', () => {
    const result = calculateGeoColumnBasemapMatchScore(
      'code',
      WORLD_BASEMAP,
      GEO_COLUMN_TYPE.ISO3
    );
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.reason).toContain('Country');
  });

  it('awards a region bonus when a "region" column meets a France basemap that mentions regions', () => {
    const result = calculateGeoColumnBasemapMatchScore(
      'code_region_2016',
      FRANCE_REGIONS
    );
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.reason).toContain('Region');
  });

  it('caps the score at 100', () => {
    const result = calculateGeoColumnBasemapMatchScore(
      'code_country_iso',
      WORLD_BASEMAP,
      GEO_COLUMN_TYPE.ISO3
    );
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe('[S02] rankBasemapsByGeoColumn — ISO country column planisphere fallback', () => {
  const GENERIC_WORLD = basemap({
    file: 'world-borders-2000-medium',
    title_fr: 'World borders',
    title_en: 'World borders',
    date: '2000',
    bbox: [-180, -90, 180, 90],
    simplification_level: 'medium'
  });
  const FRANCE_REGIONS_OLD = basemap({
    file: 'france-region-2000-high',
    title_fr: 'France · par régions',
    title_en: 'France by regions',
    date: '2000',
    bbox: [-61.81, -21.39, 55.83, 51.09],
    simplification_level: 'high'
  });
  const FRANCE_DEPARTMENTS_OLD = basemap({
    file: 'france-departement-2000-high',
    title_fr: 'France · par départements',
    title_en: 'France by departments',
    date: '2000',
    bbox: [-61.81, -21.39, 55.83, 51.09],
    simplification_level: 'high'
  });

  function isoCountryDataset(columnName: string): ProcessedDataset {
    return {
      id: 'ds-iso',
      name: 'iso dataset',
      format: 'csv',
      data: [],
      rowCount: 0,
      columns: [
        { name: columnName, type: 'string', nullable: false, unique: true }
      ],
      analysis: {} as ProcessedDataset['analysis'],
      createdAt: new Date(),
      fileSize: 0,
      metadata: { processedAt: new Date(), transformations: [] },
      geoDetection: {
        geoColumns: [{ columnName, type: GEO_COLUMN_TYPE.ISO3 }]
      } as ProcessedDataset['geoDetection']
    };
  }

  it('surfaces world basemaps and drops zero-score region/department basemaps', () => {
    const suggestions = rankBasemapsByGeoColumn(
      [
        GENERIC_WORLD,
        FRANCE_REGIONS_OLD,
        WORLD_BASEMAP,
        FRANCE_DEPARTMENTS_OLD
      ],
      isoCountryDataset('code'),
      'code'
    );

    const files = suggestions.map((suggestion) => suggestion.file);
    expect(files).toContain('monde-countries-2024-medium');
    expect(files).not.toContain('france-region-2000-high');
    expect(files).not.toContain('france-departement-2000-high');
    expect(suggestions.every((suggestion) => suggestion.matchScore > 0)).toBe(
      true
    );
  });

  it('sorts surviving basemaps by descending match score', () => {
    const suggestions = rankBasemapsByGeoColumn(
      [GENERIC_WORLD, WORLD_BASEMAP],
      isoCountryDataset('code'),
      'code'
    );

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].file).toBe('monde-countries-2024-medium');
    expect(suggestions[0].matchScore).toBeGreaterThan(
      suggestions[1].matchScore
    );
  });

  it('respects the limit while keeping the highest-scoring basemap first', () => {
    const suggestions = rankBasemapsByGeoColumn(
      [GENERIC_WORLD, WORLD_BASEMAP],
      isoCountryDataset('code'),
      'code',
      1
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].file).toBe('monde-countries-2024-medium');
  });
});
