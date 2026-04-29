import { describe, expect, it } from 'vitest';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import { SimplificationLevel } from '$lib/features/commons/types/enums';
import type { BasemapMetadata } from '../types/basemap.types';
import {
  findBasemapLayerByType,
  getCustomBasemapLayerGeometryTypeOverride,
  getAvailableBasemapSimplificationLevels,
  getBasemapVariantFamily,
  getPreferredBasemapFile,
  getPreferredBasemapSimplificationLevel,
  getPreferredCatalogBasemapLevel,
  resolveBasemapVariantFile
} from './basemap.service.svelte';

function createBasemapMetadata(): BasemapMetadata {
  return {
    file: 'monde-countries-2024-medium',
    title_fr: 'Monde',
    title_en: 'World',
    source: 'test',
    date: '2024',
    bbox: [-180, -90, 180, 90],
    proj_source: 'EPSG:4326',
    proj_to: { type: 'simple' },
    simplification_level: 'medium',
    layers: [
      {
        title_fr: 'Centroids des pays',
        title_en: 'Country centroids',
        type: BasemapLayerType.CENTROID,
        file: 'monde-countries-centroids-2024-medium',
        style: null
      },
      {
        title_fr: 'Limites des pays',
        title_en: 'Country boundaries',
        type: BasemapLayerType.LIMIT,
        file: 'monde-countries-limites-2024-medium',
        style: 'limit-level-0'
      }
    ]
  };
}

function createVariantMetadata(
  file: string,
  level: SimplificationLevel
): BasemapMetadata {
  return {
    file,
    title_fr: 'Test',
    title_en: 'Test',
    source: 'test',
    date: '2025',
    bbox: [0, 0, 0, 0],
    proj_source: 'EPSG:4326',
    proj_to: { type: 'simple' },
    simplification_level: level,
    layers: []
  };
}

const FRANCE_FAMILIES = [
  'france-canton-2025',
  'france-commune-2025',
  'france-departement-2025',
  'france-region-2025'
] as const;

const FRANCE_CATALOG: BasemapMetadata[] = FRANCE_FAMILIES.flatMap((family) => [
  createVariantMetadata(`${family}-medium`, SimplificationLevel.Medium),
  createVariantMetadata(`${family}-high`, SimplificationLevel.High)
]);

const EUROPE_NUTS2_CATALOG: BasemapMetadata[] = [
  createVariantMetadata('europe-nuts2-2024-low', SimplificationLevel.Low),
  createVariantMetadata('europe-nuts2-2024-medium', SimplificationLevel.Medium),
  createVariantMetadata('europe-nuts2-2024-high', SimplificationLevel.High)
];

const MIXED_CATALOG: BasemapMetadata[] = [
  ...FRANCE_CATALOG,
  ...EUROPE_NUTS2_CATALOG
];

describe('findBasemapLayerByType', () => {
  it('returns the matching centroid layer when the basemap exposes one', () => {
    const layer = findBasemapLayerByType(
      createBasemapMetadata(),
      BasemapLayerType.CENTROID
    );

    expect(layer?.file).toBe('monde-countries-centroids-2024-medium');
  });

  it('returns null when the requested layer type is not present', () => {
    const layer = findBasemapLayerByType(
      createBasemapMetadata(),
      BasemapLayerType.POINT
    );

    expect(layer).toBeNull();
  });
});

describe('getCustomBasemapLayerGeometryTypeOverride', () => {
  it('uses line metadata for custom limit helper tables', () => {
    expect(
      getCustomBasemapLayerGeometryTypeOverride(BasemapLayerType.LIMIT)
    ).toBe('MULTILINESTRING');
    expect(
      getCustomBasemapLayerGeometryTypeOverride(BasemapLayerType.LINE)
    ).toBe('MULTILINESTRING');
  });

  it('uses point metadata for custom centroid helper tables', () => {
    expect(
      getCustomBasemapLayerGeometryTypeOverride(BasemapLayerType.CENTROID)
    ).toBe('POINT');
  });
});

describe('getBasemapVariantFamily', () => {
  it('strips the simplification suffix from a catalog file id', () => {
    expect(getBasemapVariantFamily('france-region-2025-medium')).toBe(
      'france-region-2025'
    );
    expect(getBasemapVariantFamily('europe-nuts2-2024-low')).toBe(
      'europe-nuts2-2024'
    );
    expect(getBasemapVariantFamily('monde-countries-2024-high')).toBe(
      'monde-countries-2024'
    );
  });

  it('returns the file unchanged when no simplification suffix is present', () => {
    expect(getBasemapVariantFamily('europe-graticule-10')).toBe(
      'europe-graticule-10'
    );
    expect(getBasemapVariantFamily('custom-imported-basemap')).toBe(
      'custom-imported-basemap'
    );
  });
});

describe('getAvailableBasemapSimplificationLevels', () => {
  it('returns the full 3-level set when the catalog provides low/medium/high', () => {
    expect(
      getAvailableBasemapSimplificationLevels(
        EUROPE_NUTS2_CATALOG,
        'europe-nuts2-2024-medium'
      )
    ).toEqual([
      SimplificationLevel.Low,
      SimplificationLevel.Medium,
      SimplificationLevel.High
    ]);
  });

  it('returns only the levels physically declared in the catalog (no artificial filtering)', () => {
    for (const family of FRANCE_FAMILIES) {
      expect(
        getAvailableBasemapSimplificationLevels(
          FRANCE_CATALOG,
          `${family}-medium`
        )
      ).toEqual([SimplificationLevel.Medium, SimplificationLevel.High]);
    }
  });

  it('orders results consistently regardless of catalog declaration order', () => {
    const shuffled = [
      EUROPE_NUTS2_CATALOG[2],
      EUROPE_NUTS2_CATALOG[0],
      EUROPE_NUTS2_CATALOG[1]
    ];

    expect(
      getAvailableBasemapSimplificationLevels(shuffled, 'europe-nuts2-2024-low')
    ).toEqual([
      SimplificationLevel.Low,
      SimplificationLevel.Medium,
      SimplificationLevel.High
    ]);
  });

  it('returns an empty list for a family that is not in the catalog', () => {
    expect(
      getAvailableBasemapSimplificationLevels(
        FRANCE_CATALOG,
        'unknown-family-medium'
      )
    ).toEqual([]);
  });

  it('skips entries whose simplification_level field is not a known value', () => {
    const corrupted: BasemapMetadata[] = [
      createVariantMetadata('foo-2025-high', SimplificationLevel.High),
      {
        ...createVariantMetadata('foo-2025-medium', SimplificationLevel.Medium),
        simplification_level: 'extra-fine' as unknown as SimplificationLevel
      }
    ];

    expect(
      getAvailableBasemapSimplificationLevels(corrupted, 'foo-2025-high')
    ).toEqual([SimplificationLevel.High]);
  });
});

describe('getPreferredCatalogBasemapLevel', () => {
  it('prefers Medium when available (catalog default)', () => {
    expect(
      getPreferredCatalogBasemapLevel(MIXED_CATALOG, 'europe-nuts2-2024-low')
    ).toBe(SimplificationLevel.Medium);
  });

  it('falls back to High when Medium is missing', () => {
    const highOnly = [
      createVariantMetadata('foo-2025-high', SimplificationLevel.High)
    ];

    expect(getPreferredCatalogBasemapLevel(highOnly, 'foo-2025-high')).toBe(
      SimplificationLevel.High
    );
  });

  it('returns null for an unknown family', () => {
    expect(
      getPreferredCatalogBasemapLevel(MIXED_CATALOG, 'unknown-family-low')
    ).toBeNull();
  });
});

describe('getPreferredBasemapFile', () => {
  it('returns the requested file unchanged when it exists in the catalog', () => {
    expect(
      getPreferredBasemapFile(FRANCE_CATALOG, 'france-region-2025-medium')
    ).toBe('france-region-2025-medium');
    expect(
      getPreferredBasemapFile(FRANCE_CATALOG, 'france-region-2025-high')
    ).toBe('france-region-2025-high');
  });

  it('migrates legacy ids whose level is missing from the current catalog', () => {
    expect(
      getPreferredBasemapFile(FRANCE_CATALOG, 'france-region-2025-low')
    ).toBe('france-region-2025-medium');
  });

  it('returns the requested file when the family is unknown (caller will handle the miss)', () => {
    expect(
      getPreferredBasemapFile(FRANCE_CATALOG, 'unknown-family-medium')
    ).toBe('unknown-family-medium');
  });
});

describe('getPreferredBasemapSimplificationLevel', () => {
  it('honours the requested level when it is available', () => {
    const metadata = FRANCE_CATALOG.find(
      (b) => b.file === 'france-region-2025-high'
    );
    expect(metadata).toBeDefined();
    if (!metadata) return;

    expect(
      getPreferredBasemapSimplificationLevel(
        FRANCE_CATALOG,
        metadata,
        SimplificationLevel.Medium
      )
    ).toBe(SimplificationLevel.Medium);
  });

  it('falls back to the metadata level when the requested level is unavailable', () => {
    const metadata = FRANCE_CATALOG.find(
      (b) => b.file === 'france-region-2025-high'
    );
    expect(metadata).toBeDefined();
    if (!metadata) return;

    expect(
      getPreferredBasemapSimplificationLevel(
        FRANCE_CATALOG,
        metadata,
        SimplificationLevel.Low
      )
    ).toBe(SimplificationLevel.High);
  });

  it('returns null when the family has no level at all', () => {
    const metadata = createVariantMetadata(
      'orphan-family-medium',
      SimplificationLevel.Medium
    );

    expect(
      getPreferredBasemapSimplificationLevel(
        EUROPE_NUTS2_CATALOG,
        metadata,
        SimplificationLevel.Medium
      )
    ).toBeNull();
  });
});

describe('resolveBasemapVariantFile', () => {
  it('rewrites the simplification suffix from the current to the next level', () => {
    expect(
      resolveBasemapVariantFile(
        'france-region-2025-high',
        SimplificationLevel.High,
        SimplificationLevel.Medium
      )
    ).toBe('france-region-2025-medium');
    expect(
      resolveBasemapVariantFile(
        'europe-nuts2-2024-low',
        SimplificationLevel.Low,
        SimplificationLevel.High
      )
    ).toBe('europe-nuts2-2024-high');
  });

  it('returns null when the current level is not a valid simplification level', () => {
    expect(
      resolveBasemapVariantFile(
        'france-region-2025-high',
        undefined,
        SimplificationLevel.Medium
      )
    ).toBeNull();
    expect(
      resolveBasemapVariantFile(
        'france-region-2025-high',
        'extreme' as unknown as SimplificationLevel,
        SimplificationLevel.Medium
      )
    ).toBeNull();
  });
});
