import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import type { BasemapMetadata } from '../types/basemap.types';
import { describe, expect, it } from 'vitest';
import { resolveActiveBasemapMetadata } from './basemap-metadata-resolution.utils';

function createMetadata(file: string): BasemapMetadata {
  return {
    file,
    title_fr: file,
    title_en: file,
    source: 'test',
    date: '2026',
    bbox: [-10, -10, 10, 10],
    proj_source: 'EPSG:4326',
    proj_to: { type: 'identity' },
    layers: [{ type: BasemapLayerType.LAND }]
  };
}

describe('resolveActiveBasemapMetadata', () => {
  it('does not treat cached metadata as active when no reference basemap is selected', () => {
    expect(
      resolveActiveBasemapMetadata({
        referenceBasemapId: null,
        availableBasemaps: [],
        currentMetadata: createMetadata('monde-countries-2024-medium')
      })
    ).toBeNull();
  });

  it('returns the selected metadata from the catalog', () => {
    const selected = createMetadata('europe-nuts2-2024-medium');

    expect(
      resolveActiveBasemapMetadata({
        referenceBasemapId: 'europe-nuts2-2024-medium',
        availableBasemaps: [
          createMetadata('monde-countries-2024-medium'),
          selected
        ],
        currentMetadata: createMetadata('monde-countries-2024-medium')
      })
    ).toBe(selected);
  });

  it('uses the resolved variant id when the selected id maps to another catalog file', () => {
    const resolved = createMetadata('france-region-2025-medium');

    expect(
      resolveActiveBasemapMetadata({
        referenceBasemapId: 'france-region-2025',
        resolvedBasemapId: 'france-region-2025-medium',
        availableBasemaps: [resolved],
        currentMetadata: null
      })
    ).toBe(resolved);
  });

  it('falls back to the current metadata only when it matches the active reference', () => {
    const custom = createMetadata('custom_basemap_test');

    expect(
      resolveActiveBasemapMetadata({
        referenceBasemapId: 'custom_basemap_test',
        availableBasemaps: [],
        currentMetadata: custom
      })
    ).toBe(custom);
  });

  it('rejects unrelated cached metadata for a stale or missing reference', () => {
    expect(
      resolveActiveBasemapMetadata({
        referenceBasemapId: 'europe-nuts2-2024-medium',
        availableBasemaps: [],
        currentMetadata: createMetadata('monde-countries-2024-medium')
      })
    ).toBeNull();
  });
});
