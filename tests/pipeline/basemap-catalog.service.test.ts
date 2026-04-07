import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/duckdb', () => ({
  Duck: null,
  GEO_CONSTANTS: {
    WGS84_CRS: 'EPSG:4326'
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/arrow-ops', () => ({
  addGeoArrowMetadataFromDuckDB: vi.fn(),
  fetchArrowTableWithGeometry: vi.fn()
}));

import { getCatalogBasemapsForDisplay } from '$lib/features/map/services/basemap-catalog.service.svelte';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';

function createCatalogMetadata(
  file: string,
  simplificationLevel?: 'low' | 'medium' | 'high'
): BasemapMetadata {
  return {
    file,
    title_fr: file,
    title_en: file,
    source: 'IGN',
    date: '2025',
    bbox: [-10, -10, 10, 10],
    proj_source: 'EPSG:4326',
    proj_to: { type: 'identity' },
    simplification_level: simplificationLevel,
    layers: []
  };
}

describe('catalog basemap selection', () => {
  it('prefers the high variant for France administrative basemaps', () => {
    const baseNames = [
      'france-canton-2025',
      'france-commune-2025',
      'france-departement-2025',
      'france-region-2025'
    ];

    const selected = getCatalogBasemapsForDisplay(
      baseNames.flatMap((baseName) => [
        createCatalogMetadata(`${baseName}-medium`, 'medium'),
        createCatalogMetadata(`${baseName}-high`, 'high')
      ])
    );

    expect(selected).toHaveLength(baseNames.length);
    expect(selected.map((basemap) => basemap.file)).toEqual(
      baseNames.map((baseName) => `${baseName}-high`)
    );
  });

  it('keeps preferring the medium variant for other catalog basemaps', () => {
    const selected = getCatalogBasemapsForDisplay([
      createCatalogMetadata('monde-countries-2024-high', 'high'),
      createCatalogMetadata('monde-countries-2024-medium', 'medium')
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.file).toBe('monde-countries-2024-medium');
  });
});
