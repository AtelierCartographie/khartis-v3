import { describe, expect, it } from 'vitest';

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
  it('prefers the high variant for France communes', () => {
    const selected = getCatalogBasemapsForDisplay([
      createCatalogMetadata('france-commune-2025-medium', 'medium'),
      createCatalogMetadata('france-commune-2025-high', 'high')
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.file).toBe('france-commune-2025-high');
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
