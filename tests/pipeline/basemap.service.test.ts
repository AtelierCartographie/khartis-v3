import type { Table as ArrowTable } from 'apache-arrow/Arrow';
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

import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import { SimplificationLevel } from '$lib/features/commons/types/enums';
import {
  getResolvedBasemapVariant,
  resolveBasemapVariantFile
} from '$lib/features/map/services/basemap.service.svelte';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';

function createMetadata(
  file: string,
  simplificationLevel: 'medium' | 'high'
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
    layers: [
      {
        type: BasemapLayerType.LIMIT,
        file: `france-commune-limites-2025-${simplificationLevel}`
      }
    ]
  };
}

describe('basemap variant resolution', () => {
  it('replaces the simplification suffix when a level exists', () => {
    expect(
      resolveBasemapVariantFile(
        'france-commune-2025-medium',
        'medium',
        SimplificationLevel.High
      )
    ).toBe('france-commune-2025-high');

    expect(
      resolveBasemapVariantFile(
        'custom-basemap',
        undefined,
        SimplificationLevel.High
      )
    ).toBeNull();
  });

  it('returns the active variant metadata and layer tables', () => {
    const mediumMetadata = createMetadata(
      'france-commune-2025-medium',
      'medium'
    );
    const highMetadata = createMetadata('france-commune-2025-high', 'high');

    const mediumGeometry = { name: 'medium-geometry' } as unknown as ArrowTable;
    const highGeometry = { name: 'high-geometry' } as unknown as ArrowTable;
    const mediumLayer = { name: 'medium-layer' } as unknown as ArrowTable;
    const highLayer = { name: 'high-layer' } as unknown as ArrowTable;

    const loadedBasemap = {
      metadata: mediumMetadata,
      geometryTable: mediumGeometry,
      layerTables: new Map([[mediumMetadata.layers[0].file!, mediumLayer]]),
      simplifiedVariants: new Map([
        [
          SimplificationLevel.High,
          {
            metadata: highMetadata,
            geometryTable: highGeometry,
            layerTables: new Map([[highMetadata.layers[0].file!, highLayer]])
          }
        ]
      ]),
      activeSimplificationLevel: SimplificationLevel.High
    };

    const resolved = getResolvedBasemapVariant(loadedBasemap);

    expect(resolved?.metadata.file).toBe(highMetadata.file);
    expect(resolved?.geometryTable).toBe(highGeometry);
    expect(resolved?.layerTables.get(highMetadata.layers[0].file!)).toBe(
      highLayer
    );
  });
});
