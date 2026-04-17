import { describe, expect, it } from 'vitest';
import type { GPSBounds } from '$lib/features/duckdb';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import {
  rankBasemapsByGPSBbox,
  rankBasemapsByJoinSynthesis,
  calculateGeoColumnBasemapMatchScore
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
  // Real bbox computed from static/tests-datasets/geojson/nuts2_data.geojson,
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
