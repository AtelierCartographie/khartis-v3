// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { GPSBounds } from '$lib/features/duckdb';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import type { BasemapMetadata } from '../types/basemap.types';
import {
  rankBasemapsByGPSBbox,
  getDisplayedMatchScore,
  rankBasemapsByJoinSynthesis,
  selectRelevantBasemapSuggestions,
  shouldPreferTextBasemapRefinementForGPS,
  sortCatalogBasemapsForDisplay
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
    isCustom: overrides.isCustom,
    valid_from: overrides.valid_from,
    valid_to: overrides.valid_to
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

  it('should prefer the tighter basemap when its rounded bbox misses a sliver of the data', () => {
    const inseeGridBounds: GPSBounds = {
      minLon: -5.1377,
      minLat: 41.3676,
      maxLon: 9.5657,
      maxLat: 51.087
    };
    const suggestions = rankBasemapsByGPSBbox(
      [
        createBasemap({
          file: 'europe-nuts2-2024-medium',
          title_fr: 'Europe',
          title_en: 'Europe',
          date: '2024',
          bbox: [-10.5, 34.5, 34.5, 71.2]
        }),
        createBasemap({
          file: 'france-canton-2025-high',
          title_fr: 'France',
          title_en: 'France',
          date: '2025',
          bbox: [-5.14, 41.33, 9.56, 51.09]
        })
      ],
      inseeGridBounds,
      2
    );

    expect(suggestions.map((suggestion) => suggestion.file)).toEqual([
      'france-canton-2025-high',
      'europe-nuts2-2024-medium'
    ]);
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

  it('prefers coarser France administrative basemaps over canton and commune when bbox metrics tie', () => {
    const suggestions = rankBasemapsByGPSBbox(
      [
        createBasemap({
          file: 'france-region-2025-high',
          title_fr: 'France regions',
          title_en: 'France regions',
          date: '2025',
          bbox: [-61.81, -21.39, 55.83, 51.09],
          simplification_level: 'high',
          layers: [{ type: BasemapLayerType.LAND }]
        }),
        createBasemap({
          file: 'france-departement-2025-high',
          title_fr: 'France departments',
          title_en: 'France departments',
          date: '2025',
          bbox: [-61.81, -21.39, 55.83, 51.09],
          simplification_level: 'high',
          layers: [
            { type: BasemapLayerType.LAND },
            { type: BasemapLayerType.LIMIT }
          ]
        }),
        createBasemap({
          file: 'france-canton-2025-high',
          title_fr: 'France cantons',
          title_en: 'France cantons',
          date: '2025',
          bbox: [-61.81, -21.39, 55.83, 51.09],
          simplification_level: 'high',
          layers: [
            { type: BasemapLayerType.LAND },
            { type: BasemapLayerType.LIMIT },
            { type: BasemapLayerType.CENTROID }
          ]
        }),
        createBasemap({
          file: 'france-commune-2025-high',
          title_fr: 'France communes',
          title_en: 'France communes',
          date: '2025',
          bbox: [-61.81, -21.39, 55.83, 51.09],
          simplification_level: 'high',
          layers: [
            { type: BasemapLayerType.LAND },
            { type: BasemapLayerType.LIMIT },
            { type: BasemapLayerType.CENTROID },
            { type: BasemapLayerType.GRATICULE }
          ]
        })
      ],
      sitesSevesoIdfBounds,
      4
    );

    expect(suggestions.map((suggestion) => suggestion.file)).toEqual([
      'france-region-2025-high',
      'france-departement-2025-high',
      'france-canton-2025-high',
      'france-commune-2025-high'
    ]);
  });
});

describe('shouldPreferTextBasemapRefinementForGPS', () => {
  it('keeps bbox-driven suggestions when the GPS extent is already fully contained', () => {
    expect(
      shouldPreferTextBasemapRefinementForGPS(
        [
          {
            ...createBasemap({
              file: 'france-region-2025-high',
              title_fr: 'France regions',
              title_en: 'France regions',
              date: '2025',
              bbox: [-61.81, -21.39, 55.83, 51.09]
            }),
            matchScore: 100,
            matchReason: 'GPS bbox containment',
            matchesData: true
          }
        ],
        96
      )
    ).toBe(false);
  });

  it('allows text refinement when bbox suggestions are missing or only partial', () => {
    expect(shouldPreferTextBasemapRefinementForGPS([], 96)).toBe(true);
    expect(
      shouldPreferTextBasemapRefinementForGPS(
        [
          {
            ...createBasemap({
              file: 'monde-countries-2024-medium',
              title_fr: 'Monde',
              title_en: 'World',
              date: '2024',
              bbox: [-180, -90, 180, 90]
            }),
            matchScore: 54,
            matchReason: 'GPS bbox overlap',
            matchesData: true
          }
        ],
        96
      )
    ).toBe(true);
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

describe('sortCatalogBasemapsForDisplay', () => {
  it('ranks a basemap by the end of its validity period', () => {
    const franceBbox: [number, number, number, number] = [
      -5.14, 41.33, 9.56, 51.09
    ];
    const communes2025 = createBasemap({
      file: 'france-commune-2025-high',
      title_fr: 'France',
      title_en: 'France',
      subtitle_fr: 'par communes',
      date: '2025',
      bbox: franceBbox
    });
    const communes2026 = createBasemap({
      file: 'france-commune-2026-high',
      title_fr: 'France',
      title_en: 'France',
      subtitle_fr: 'par communes',
      date: '2026',
      bbox: franceBbox
    });
    const regions = createBasemap({
      file: 'france-region-2025-high',
      title_fr: 'France',
      title_en: 'France',
      subtitle_fr: 'par régions',
      date: '2025',
      valid_from: 2017,
      valid_to: 2026,
      bbox: franceBbox
    });

    expect(
      sortCatalogBasemapsForDisplay(
        [communes2025, regions, communes2026],
        'fr'
      ).map((basemap) => basemap.file)
    ).toEqual([
      'france-commune-2026-high',
      'france-region-2025-high',
      'france-commune-2025-high'
    ]);
  });
});

describe('selectRelevantBasemapSuggestions', () => {
  const idfBbox: [number, number, number, number] = [1.24, 48.01, 3.77, 49.35];
  const franceBbox: [number, number, number, number] = [
    -5.14, 41.33, 9.56, 51.09
  ];

  function ranked(
    file: string,
    score: number,
    options: {
      bbox?: [number, number, number, number];
      matchesData?: boolean;
    } = {}
  ) {
    return {
      basemap: createBasemap({
        file,
        title_fr: file,
        title_en: file,
        date: file.match(/(\d{4})/)?.[1] ?? '',
        bbox: options.bbox ?? franceBbox
      }),
      score,
      matchesData: options.matchesData ?? true
    };
  }

  function summary(
    suggestions: ReturnType<typeof selectRelevantBasemapSuggestions>
  ) {
    return suggestions.map((suggestion) => [
      suggestion.basemap.file,
      suggestion.vintages.map((vintage) => vintage.basemap.file)
    ]);
  }

  it('should keep only the top suggestion when the next ones fall far behind it', () => {
    const suggestions = selectRelevantBasemapSuggestions(
      [
        ranked('france-departement-2025-medium', 95),
        ranked('europe-nuts3-2024-medium', 10),
        ranked('france-region-2025-medium', 4)
      ],
      { limit: 3, rankedBy: 'values' }
    );

    expect(summary(suggestions)).toEqual([
      ['france-departement-2025-medium', ['france-departement-2025-medium']]
    ]);
  });

  it('should keep close alternatives and drop those under the floor when the top is strong', () => {
    const suggestions = selectRelevantBasemapSuggestions(
      [
        ranked('france-departement-2025-medium', 99),
        ranked('europe-nuts3-2024-medium', 82),
        ranked('france-canton-2025-medium', 60)
      ],
      { limit: 3, rankedBy: 'values' }
    );

    expect(suggestions.map((suggestion) => suggestion.basemap.file)).toEqual([
      'france-departement-2025-medium',
      'europe-nuts3-2024-medium'
    ]);
  });

  it('should offer no alternative when even the top suggestion matches poorly', () => {
    const suggestions = selectRelevantBasemapSuggestions(
      [ranked('monde-pays-2024-medium', 40), ranked('europe-pays-2024', 38)],
      { limit: 3, rankedBy: 'values' }
    );

    expect(suggestions.map((suggestion) => suggestion.basemap.file)).toEqual([
      'monde-pays-2024-medium'
    ]);
  });

  it('should drop a metadata-only alternative behind a suggestion resting on the data', () => {
    const suggestions = selectRelevantBasemapSuggestions(
      [
        ranked('france-region-2025-medium', 90),
        ranked('france-departement-2025-medium', 90, { matchesData: false })
      ],
      { limit: 3, rankedBy: 'values' }
    );

    expect(suggestions).toHaveLength(1);
  });

  it('should stack the vintages of one basemap when the score cannot tell them apart', () => {
    const suggestions = selectRelevantBasemapSuggestions(
      [
        ranked('france-commune-reg11-2026-medium', 100, { bbox: idfBbox }),
        ranked('france-commune-reg11-2025-medium', 100, { bbox: idfBbox }),
        ranked('france-commune-reg11-2024-medium', 100, { bbox: idfBbox }),
        ranked('france-commune-reg11-2023-medium', 100, { bbox: idfBbox }),
        ranked('france-commune-arrondissement-epci200054781-2026', 100, {
          bbox: [1.6, 48.3, 3.1, 49.1]
        })
      ],
      { limit: 3, rankedBy: 'extent' }
    );

    expect(summary(suggestions)).toEqual([
      [
        'france-commune-reg11-2026-medium',
        [
          'france-commune-reg11-2026-medium',
          'france-commune-reg11-2025-medium',
          'france-commune-reg11-2024-medium',
          'france-commune-reg11-2023-medium'
        ]
      ],
      [
        'france-commune-arrondissement-epci200054781-2026',
        ['france-commune-arrondissement-epci200054781-2026']
      ]
    ]);
  });

  it('should show the best-matching vintage first when the data tells vintages apart', () => {
    // Shares measured on the OFS 2022 communes against the catalog.
    const suggestions = selectRelevantBasemapSuggestions(
      [
        ranked('suisse-commune-2022-high', 100),
        ranked('suisse-commune-2021-high', 99.77),
        ranked('suisse-commune-2020-high', 99.49),
        ranked('suisse-commune-2023-high', 99.16),
        ranked('suisse-commune-2026-high', 98.4),
        ranked('suisse-district-2026-high', 12)
      ],
      { limit: 3, rankedBy: 'values' }
    );

    expect(summary(suggestions)).toEqual([
      [
        'suisse-commune-2022-high',
        [
          'suisse-commune-2022-high',
          'suisse-commune-2021-high',
          'suisse-commune-2020-high',
          'suisse-commune-2023-high',
          'suisse-commune-2026-high'
        ]
      ]
    ]);
    expect(suggestions[0]?.score).toBe(100);
    expect(suggestions[0]?.vintages[1]?.score).toBe(99.77);
  });

  it('should prefer the latest vintage only among vintages that tie exactly', () => {
    // ISTAT 2024 codes: the 2025 and 2026 boundaries hold every one of them.
    const suggestions = selectRelevantBasemapSuggestions(
      [
        ranked('italie-comune-2025-medium', 100),
        ranked('italie-comune-2026-medium', 100),
        ranked('italie-comune-2024-medium', 99.96)
      ],
      { limit: 3, rankedBy: 'values' }
    );

    expect(summary(suggestions)).toEqual([
      [
        'italie-comune-2026-medium',
        [
          'italie-comune-2026-medium',
          'italie-comune-2025-medium',
          'italie-comune-2024-medium'
        ]
      ]
    ]);
  });

  it('should drop an extent alternative far larger than the data it covers', () => {
    const suggestions = selectRelevantBasemapSuggestions(
      [
        ranked('france-commune-reg11-2026-medium', 100, { bbox: idfBbox }),
        ranked('france-commune-reg24-2026-medium', 100, {
          bbox: [-0.25, 46.09, 3.44, 49.2]
        }),
        ranked('france-region-2025-medium', 100, { bbox: franceBbox }),
        ranked('monde-pays-2024-medium', 100, { bbox: [-180, -90, 180, 90] })
      ],
      { limit: 3, rankedBy: 'extent' }
    );

    expect(suggestions.map((suggestion) => suggestion.basemap.file)).toEqual([
      'france-commune-reg11-2026-medium'
    ]);
  });

  it('should not let stacked vintages use up the limit', () => {
    const suggestions = selectRelevantBasemapSuggestions(
      [
        ranked('france-commune-2026-medium', 100),
        ranked('france-commune-2025-medium', 100),
        ranked('france-commune-2024-medium', 100),
        ranked('france-canton-2025-medium', 99),
        ranked('france-iris-2026-medium', 98),
        ranked('france-epci-2026-medium', 98)
      ],
      { limit: 3, rankedBy: 'values' }
    );

    expect(suggestions.map((suggestion) => suggestion.basemap.file)).toEqual([
      'france-commune-2026-medium',
      'france-canton-2025-medium',
      'france-iris-2026-medium'
    ]);
    expect(suggestions[0]?.vintages).toHaveLength(3);
  });
});

describe('getDisplayedMatchScore', () => {
  it('should never round a score up when every value does not match', () => {
    expect(getDisplayedMatchScore(100)).toBe(100);
    expect(getDisplayedMatchScore(99.96)).toBe(99.9);
    expect(getDisplayedMatchScore(99.77)).toBe(99.7);
    expect(getDisplayedMatchScore(98.88)).toBe(98);
  });
});
