import { describe, expect, it } from 'vitest';
import { MAP_PROJECTION_TYPE } from '$lib/features/commons/constants';
import {
  isGlobeProjectionAvailable,
  isGlobeProjectionDisabled,
  isCustomReferenceBasemap,
  resolveGlobeProjectionDisableReason,
  resolveProjectionForBasemapZone
} from './map-projection-availability';

describe('map projection availability', () => {
  it('disables globe projection for the France basemap zone', () => {
    expect(isGlobeProjectionDisabled('france')).toBe(true);
    expect(isGlobeProjectionDisabled('monde')).toBe(false);
    expect(isGlobeProjectionDisabled(null)).toBe(false);
    expect(isGlobeProjectionAvailable('france')).toBe(false);
    expect(isGlobeProjectionAvailable('monde')).toBe(true);
  });

  it('disables globe projection when an imported reference basemap is active', () => {
    expect(isCustomReferenceBasemap('custom_basemap_guadeloupe')).toBe(true);
    expect(
      resolveGlobeProjectionDisableReason('monde', 'custom_basemap_guadeloupe')
    ).toBe('custom-reference-basemap');
    expect(
      isGlobeProjectionDisabled('monde', 'custom_basemap_guadeloupe')
    ).toBe(true);
    expect(
      isGlobeProjectionAvailable('monde', 'custom_basemap_guadeloupe')
    ).toBe(false);
  });

  it('falls back to mercator when globe is unavailable for the current zone', () => {
    expect(
      resolveProjectionForBasemapZone(MAP_PROJECTION_TYPE.GLOBE, 'france')
    ).toBe(MAP_PROJECTION_TYPE.MERCATOR);
    expect(
      resolveProjectionForBasemapZone(MAP_PROJECTION_TYPE.GLOBE, 'monde')
    ).toBe(MAP_PROJECTION_TYPE.GLOBE);
    expect(
      resolveProjectionForBasemapZone(
        MAP_PROJECTION_TYPE.GLOBE,
        'monde',
        'custom_basemap_guadeloupe'
      )
    ).toBe(MAP_PROJECTION_TYPE.MERCATOR);
  });
});
