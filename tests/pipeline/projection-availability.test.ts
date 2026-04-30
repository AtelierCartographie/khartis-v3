import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAP_PROJECTION_TYPE } from '$lib/features/commons/constants';
import { BasemapStyle } from '$lib/features/map/constants/basemap-styles';
import {
  CDC_PRIMARY_PROJECTION_IDS,
  getAvailableProjectionIds,
  resolveDisplayedProjectionId,
  resolveProjectionAvailabilityContext,
  resolveProjectionSuggestionBoundsFromBasemap
} from '$lib/features/map/utils/projection-availability';
import {
  MAP_RENDER_ENGINE,
  resolveMapRenderEngine,
  shouldUseMapLibreInterleaved
} from '$lib/features/map/utils/render-engine.utils';
import { getCompositeProjectionSelectionId } from '$lib/features/map/utils/user-projection.utils';
import { PROJECTIONS } from '$lib/features/step-toolbar/tools/projections/data';
import type { ProjectionPresets } from '$lib/features/map/types/basemap.types';
import { PROJECTIONS as FULL_PROJECTION_CATALOG } from '$lib/features/commons/utils/projection.utils';

interface CatalogBasemapMetadata {
  file: string;
  bbox: [number, number, number, number];
  proj_to?: {
    type?: string;
    preset?: string | null;
  };
}

const catalogMetadata = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'static/basemaps/all-basemaps-metadata.json'),
    'utf8'
  )
) as CatalogBasemapMetadata[];

const catalogProjectionPresets = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'static/basemaps/projection-presets.json'),
    'utf8'
  )
) as ProjectionPresets;

const builtInProjectionIds = FULL_PROJECTION_CATALOG.map(
  (projection) => projection.id
);
const compositeProjectionIds = [
  getCompositeProjectionSelectionId('FRANCE_DOM_TOM'),
  getCompositeProjectionSelectionId('EUROPE_DOM_TOM')
];

const projectionPresets: ProjectionPresets = {
  FRANCE_DOM_TOM: {
    entries: [
      {
        id: 'mainland',
        proj4: '+proj=longlat +datum=WGS84 +no_defs',
        bounds: [
          [-5.8, 41],
          [10.2, 51.8]
        ],
        layout: { x: 0, y: 0, width: 1, height: 1 }
      }
    ]
  },
  EUROPE_DOM_TOM: {
    entries: [
      {
        id: 'mainland',
        proj4: '+proj=longlat +datum=WGS84 +no_defs',
        bounds: [
          [-25, 35],
          [45, 72]
        ],
        layout: { x: 0, y: 0, width: 1, height: 1 }
      }
    ]
  }
};

describe('projection availability', () => {
  it('uses explicit render engine names for Deck and MapLibre contexts', () => {
    expect(
      resolveMapRenderEngine({
        requiresMapLibre: false,
        hasOSMBasemap: false
      })
    ).toBe(MAP_RENDER_ENGINE.DECK_ORTHOGRAPHIC);
    expect(
      resolveMapRenderEngine({
        requiresMapLibre: true,
        hasOSMBasemap: false
      })
    ).toBe(MAP_RENDER_ENGINE.MAPLIBRE_INTERLEAVED);
    expect(
      shouldUseMapLibreInterleaved({
        requiresMapLibre: false,
        hasOSMBasemap: true
      })
    ).toBe(true);
  });

  it('keeps the full catalogue in Deck orthographic rendering mode', () => {
    const context = resolveProjectionAvailabilityContext({
      requiresMapLibre: false,
      currentStyle: BasemapStyle.BLANK_WHITE
    });

    expect(context.engine).toBe(MAP_RENDER_ENGINE.DECK_ORTHOGRAPHIC);
    expect(
      getAvailableProjectionIds(context, [
        'mercator',
        'orthographic',
        'robinson'
      ])
    ).toEqual(['mercator', 'orthographic', 'robinson']);
  });

  it('hides the France inset composite outside a France context', () => {
    const context = resolveProjectionAvailabilityContext({
      requiresMapLibre: false,
      currentStyle: BasemapStyle.BLANK_WHITE,
      preferredStyle: BasemapStyle.MONDE_COULEURS
    });

    expect(
      getAvailableProjectionIds(context, [
        getCompositeProjectionSelectionId('FRANCE_DOM_TOM'),
        getCompositeProjectionSelectionId('EUROPE_DOM_TOM')
      ])
    ).toEqual([getCompositeProjectionSelectionId('EUROPE_DOM_TOM')]);
  });

  it('keeps the France inset composite available in a France context', () => {
    const context = resolveProjectionAvailabilityContext({
      requiresMapLibre: false,
      currentStyle: BasemapStyle.FRANCE_COULEURS
    });

    expect(
      getAvailableProjectionIds(context, [
        getCompositeProjectionSelectionId('FRANCE_DOM_TOM'),
        getCompositeProjectionSelectionId('EUROPE_DOM_TOM')
      ])
    ).toEqual([
      getCompositeProjectionSelectionId('FRANCE_DOM_TOM'),
      getCompositeProjectionSelectionId('EUROPE_DOM_TOM')
    ]);
  });

  it('hides composites whose preset does not intersect the current projection bbox', () => {
    const context = resolveProjectionAvailabilityContext({
      requiresMapLibre: false,
      currentStyle: BasemapStyle.FRANCE_COULEURS,
      projectionBbox: [120, -10, 130, 0],
      projectionPresets
    });

    expect(
      getAvailableProjectionIds(context, [
        getCompositeProjectionSelectionId('FRANCE_DOM_TOM'),
        getCompositeProjectionSelectionId('EUROPE_DOM_TOM')
      ])
    ).toEqual([]);
  });

  it('hides composites when the active reference basemap uses another projection preset', () => {
    const context = resolveProjectionAvailabilityContext({
      requiresMapLibre: false,
      currentStyle: BasemapStyle.BLANK_WHITE,
      referenceBasemapId: 'monde-countries-2024-medium',
      referenceProjectionPresetId: null,
      projectionBbox: [-25, 35, 45, 72],
      projectionPresets
    });

    expect(
      getAvailableProjectionIds(context, [
        getCompositeProjectionSelectionId('FRANCE_DOM_TOM'),
        getCompositeProjectionSelectionId('EUROPE_DOM_TOM')
      ])
    ).toEqual([]);
  });

  it('keeps a composite available when the active reference basemap uses the same preset', () => {
    const context = resolveProjectionAvailabilityContext({
      requiresMapLibre: false,
      currentStyle: BasemapStyle.BLANK_WHITE,
      referenceBasemapId: 'europe-nuts2-2024-medium',
      referenceProjectionPresetId: 'EUROPE_DOM_TOM',
      projectionBbox: [-25, 35, 45, 72],
      projectionPresets
    });

    expect(
      getAvailableProjectionIds(context, [
        getCompositeProjectionSelectionId('FRANCE_DOM_TOM'),
        getCompositeProjectionSelectionId('EUROPE_DOM_TOM')
      ])
    ).toEqual([getCompositeProjectionSelectionId('EUROPE_DOM_TOM')]);
  });

  it('limits France tiled basemaps to mercator only', () => {
    const context = resolveProjectionAvailabilityContext({
      requiresMapLibre: true,
      currentStyle: BasemapStyle.FRANCE_COULEURS
    });

    expect(context.engine).toBe(MAP_RENDER_ENGINE.MAPLIBRE_INTERLEAVED);
    expect(
      getAvailableProjectionIds(context, [
        'mercator',
        'orthographic',
        'robinson'
      ])
    ).toEqual(['mercator']);
  });

  it('keeps mercator and orthographic for world tiled basemaps', () => {
    const context = resolveProjectionAvailabilityContext({
      requiresMapLibre: true,
      currentStyle: BasemapStyle.MONDE_COULEURS
    });

    expect(
      getAvailableProjectionIds(context, [
        'mercator',
        'orthographic',
        'robinson'
      ])
    ).toEqual(['mercator', 'orthographic']);
  });

  it('hides composite inset projections in tiled mode', () => {
    const context = resolveProjectionAvailabilityContext({
      requiresMapLibre: true,
      currentStyle: BasemapStyle.MONDE_COULEURS
    });

    expect(
      getAvailableProjectionIds(context, [
        'mercator',
        getCompositeProjectionSelectionId('FRANCE_DOM_TOM')
      ])
    ).toEqual(['mercator']);
  });

  it('falls back to mercator when a custom reference basemap disables globe', () => {
    const context = resolveProjectionAvailabilityContext({
      requiresMapLibre: true,
      currentStyle: BasemapStyle.MONDE_COULEURS,
      referenceBasemapId: 'custom_basemap_test'
    });

    expect(
      getAvailableProjectionIds(context, [
        'mercator',
        'orthographic',
        'robinson'
      ])
    ).toEqual(['mercator']);
  });

  it('uses globe display fallback when a hidden projection is active in tiled mode', () => {
    const context = resolveProjectionAvailabilityContext({
      requiresMapLibre: true,
      currentStyle: BasemapStyle.MONDE_COULEURS
    });

    expect(
      resolveDisplayedProjectionId({
        context,
        selectedProjectionId: 'robinson',
        mapProjection: MAP_PROJECTION_TYPE.GLOBE
      })
    ).toBe('orthographic');
  });

  it('derives a France zone from an OSM bbox when the tiled style stays blank', () => {
    const context = resolveProjectionAvailabilityContext({
      requiresMapLibre: false,
      hasOSMBasemap: true,
      currentStyle: BasemapStyle.BLANK_WHITE,
      osmBasemapBbox: [-5.5, 41.1, 9.8, 51.6]
    });

    expect(context.zone).toBe('france');
    expect(
      getAvailableProjectionIds(context, ['mercator', 'orthographic'])
    ).toEqual(['mercator']);
  });

  it('keeps every built-in projection available for every catalog basemap in Deck mode', () => {
    expect(catalogMetadata.length).toBeGreaterThan(0);

    for (const basemap of catalogMetadata) {
      const referenceProjectionPresetId =
        basemap.proj_to?.type === 'composite'
          ? (basemap.proj_to.preset ?? null)
          : null;
      const context = resolveProjectionAvailabilityContext({
        requiresMapLibre: false,
        currentStyle: BasemapStyle.BLANK_WHITE,
        referenceBasemapId: basemap.file,
        referenceProjectionPresetId,
        projectionBbox: basemap.bbox,
        projectionPresets: catalogProjectionPresets
      });
      const availableIds = getAvailableProjectionIds(context, [
        ...builtInProjectionIds,
        ...compositeProjectionIds
      ]);

      expect(
        builtInProjectionIds.every((projectionId) =>
          availableIds.includes(projectionId)
        ),
        `${basemap.file} should keep built-in projections available`
      ).toBe(true);

      const expectedCompositeIds = referenceProjectionPresetId
        ? [getCompositeProjectionSelectionId(referenceProjectionPresetId)]
        : [];
      expect(
        availableIds.filter((projectionId) =>
          projectionId.startsWith('composite:')
        ),
        `${basemap.file} should only expose compatible composite projections`
      ).toEqual(expectedCompositeIds);
    }
  });
});

describe('projection suggestion bounds fallback', () => {
  it('prefers the active reference basemap bbox', () => {
    expect(
      resolveProjectionSuggestionBoundsFromBasemap({
        currentStyle: BasemapStyle.BLANK_WHITE,
        referenceBasemapBbox: [-10, 20, 10, 40],
        currentBasemapBbox: [-180, -90, 180, 90]
      })
    ).toEqual([-10, 20, 10, 40]);
  });

  it('falls back to the current tiled style viewport preset', () => {
    expect(
      resolveProjectionSuggestionBoundsFromBasemap({
        currentStyle: BasemapStyle.MONDE_COULEURS
      })
    ).toEqual([-170, -55, 170, 80]);
  });
});

describe('projection primary catalogue', () => {
  it('matches the curated CDC projection list exactly', () => {
    expect(PROJECTIONS.map((projection) => projection.projectionId)).toEqual([
      ...CDC_PRIMARY_PROJECTION_IDS
    ]);
  });
});
