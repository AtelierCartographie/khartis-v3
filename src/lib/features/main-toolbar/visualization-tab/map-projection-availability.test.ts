import { describe, expect, it } from 'vitest';
import { MAP_PROJECTION_TYPE } from '$lib/features/commons/constants';
import {
  isGlobeProjectionAvailable,
  isGlobeProjectionDisabled,
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

  it('falls back to mercator when globe is unavailable for the current zone', () => {
    expect(
      resolveProjectionForBasemapZone(MAP_PROJECTION_TYPE.GLOBE, 'france')
    ).toBe(MAP_PROJECTION_TYPE.MERCATOR);
    expect(
      resolveProjectionForBasemapZone(MAP_PROJECTION_TYPE.GLOBE, 'monde')
    ).toBe(MAP_PROJECTION_TYPE.GLOBE);
  });
});
