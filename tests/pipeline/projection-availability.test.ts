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
import { getCompositeProjectionSelectionId } from '$lib/features/map/utils/user-projection.utils';
import { PROJECTIONS } from '$lib/features/step-toolbar/tools/projections/data';

describe('projection availability', () => {
  it('keeps the full catalogue in orthographic mode', () => {
    const context = resolveProjectionAvailabilityContext({
      requiresMapLibre: false,
      currentStyle: BasemapStyle.BLANK_WHITE
    });

    expect(
      getAvailableProjectionIds(context, [
        'mercator',
        'orthographic',
        'robinson'
      ])
    ).toEqual(['mercator', 'orthographic', 'robinson']);
  });

  it('limits France tiled basemaps to mercator only', () => {
    const context = resolveProjectionAvailabilityContext({
      requiresMapLibre: true,
      currentStyle: BasemapStyle.FRANCE_COULEURS
    });

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
