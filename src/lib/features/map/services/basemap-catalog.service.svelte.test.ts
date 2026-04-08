import { describe, expect, it } from 'vitest';
import type { GPSBounds } from '$lib/features/duckdb';
import type { BasemapMetadata } from '../types/basemap.types';
import {
  rankBasemapsByGPSBbox,
  rankBasemapsByJoinSynthesis
} from './basemap-catalog.service.svelte';

function createBasemap(
  overrides: Pick<
    BasemapMetadata,
    'file' | 'title_fr' | 'title_en' | 'date' | 'bbox'
  > &
    Partial<BasemapMetadata>
): BasemapMetadata {
  return {
    file: overrides.file,
    title_fr: overrides.title_fr,
    title_en: overrides.title_en,
    source: overrides.source ?? 'test',
    date: overrides.date,
    bbox: overrides.bbox,
    proj_source: overrides.proj_source ?? 'EPSG:4326',
    proj_to: overrides.proj_to ?? { type: 'simple' },
    layers: overrides.layers ?? [],
    subtitle_fr: overrides.subtitle_fr,
    subtitle_en: overrides.subtitle_en,
    description_fr: overrides.description_fr,
    description_en: overrides.description_en,
    simplification_level: overrides.simplification_level,
    isCustom: overrides.isCustom
  };
}

const sitesSevesoIdfBounds: GPSBounds = {
  minLon: 1.55039919942,
  minLat: 48.1819243014,
  maxLon: 3.17470943407,
  maxLat: 49.20468583
};

describe('rankBasemapsByGPSBbox', () => {
  it('prefers France over Europe when both fully contain the Seveso IDF GPS extent', () => {
    const suggestions = rankBasemapsByGPSBbox(
      [
        createBasemap({
          file: 'europe-nuts1-2024-medium',
          title_fr: 'Europe',
          title_en: 'Europe',
          date: '2024',
          bbox: [-63.13, -21.4, 55.86, 80.4],
          simplification_level: 'medium'
        }),
        createBasemap({
          file: 'france-region-2025-high',
          title_fr: 'France',
          title_en: 'France',
          date: '2025',
          bbox: [-61.81, -21.39, 55.83, 51.09],
          simplification_level: 'high'
        }),
        createBasemap({
          file: 'monde-countries-2024-medium',
          title_fr: 'Monde',
          title_en: 'World',
          date: '2024',
          bbox: [-180, -90, 180, 90],
          simplification_level: 'medium'
        })
      ],
      sitesSevesoIdfBounds,
      3
    );

    expect(suggestions.map((suggestion) => suggestion.file)).toEqual([
      'france-region-2025-high',
      'europe-nuts1-2024-medium',
      'monde-countries-2024-medium'
    ]);
    expect(suggestions[0]?.matchScore).toBe(100);
    expect(suggestions[0]?.matchReason).toBe('GPS bbox containment');
  });

  it('keeps full coverage ahead of a tighter but partial bbox', () => {
    const suggestions = rankBasemapsByGPSBbox(
      [
        createBasemap({
          file: 'paris-window',
          title_fr: 'Paris',
          title_en: 'Paris',
          date: '2026',
          bbox: [2.1, 48.6, 2.6, 48.95]
        }),
        createBasemap({
          file: 'france-region-2025-high',
          title_fr: 'France',
          title_en: 'France',
          date: '2025',
          bbox: [-61.81, -21.39, 55.83, 51.09],
          simplification_level: 'high'
        })
      ],
      sitesSevesoIdfBounds,
      2
    );

    expect(suggestions[0]?.file).toBe('france-region-2025-high');
    expect(suggestions[0]?.matchScore).toBe(100);
    expect(suggestions[1]?.file).toBe('paris-window');
    expect(suggestions[1]?.matchScore).toBeLessThan(100);
  });
});

describe('rankBasemapsByJoinSynthesis', () => {
  it('maps synthesis scores to the displayed catalog variant and prefers the strongest family match', () => {
    const suggestions = rankBasemapsByJoinSynthesis(
      [
        createBasemap({
          file: 'france-region-2025-high',
          title_fr: 'France regions high',
          title_en: 'France regions high',
          date: '2025',
          bbox: [-61.81, -21.39, 55.83, 51.09],
          simplification_level: 'high'
        }),
        createBasemap({
          file: 'france-region-2025-low',
          title_fr: 'France regions low',
          title_en: 'France regions low',
          date: '2025',
          bbox: [-61.81, -21.39, 55.83, 51.09],
          simplification_level: 'low'
        }),
        createBasemap({
          file: 'europe-nuts1-2024-medium',
          title_fr: 'Europe',
          title_en: 'Europe',
          date: '2024',
          bbox: [-63.13, -21.4, 55.86, 80.4],
          simplification_level: 'medium'
        })
      ],
      [
        {
          basemap: 'france-region-2025-low',
          shareCandidate: 96,
          shareBasemap: 42
        },
        {
          basemap: 'europe-nuts1-2024-medium',
          shareCandidate: 82,
          shareBasemap: 18
        }
      ],
      2
    );

    expect(suggestions.map((suggestion) => suggestion.file)).toEqual([
      'france-region-2025-high',
      'europe-nuts1-2024-medium'
    ]);
    expect(suggestions[0]?.matchScore).toBe(96);
    expect(suggestions[0]?.matchReason).toBe('Join synthesis coverage');
  });
});
