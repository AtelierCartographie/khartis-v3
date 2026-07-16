import { describe, expect, it } from 'vitest';
import {
  khartisProjectionFactories,
  KHARTIS_USER_PROJECTION_FACTORY,
  KHARTIS_PROJ4_FACTORY,
  KHARTIS_COMPOSITE_FACTORY
} from './khartis-projection-factories.utils';
import type { UserProjectionBuildParams } from './user-projection-build.utils';

const EUROPE_BBOX: [number, number, number, number] = [-10, 35, 30, 60];

function userParams(
  overrides: Partial<UserProjectionBuildParams>
): UserProjectionBuildParams {
  return {
    selected: 'custom',
    longitude: 0,
    latitude: 0,
    rotation: 0,
    fitBbox: EUROPE_BBOX,
    width: 800,
    height: 600,
    padding: 40,
    ...overrides
  };
}

function isProjected(projection: unknown): boolean {
  const result = (projection as (p: [number, number]) => [number, number])([
    5, 47
  ]);
  return (
    Array.isArray(result) && result.length >= 2 && result.every(Number.isFinite)
  );
}

// These params are exactly what crosses into the parse worker as a
// ProjectionSpec's `params`; resolving them here guarantees the worker-side
// registry can rebuild every projection family the UI can produce — including
// the exotic d3-geo-projection / d3-geo-polygon factories that must be bundled
// into the worker chunk.
describe('khartisProjectionFactories (worker-side registry)', () => {
  it('resolves an exotic d3-geo-projection suggestion (Bertin 1953)', () => {
    const projection = khartisProjectionFactories[
      KHARTIS_USER_PROJECTION_FACTORY
    ](
      userParams({
        suggestionD3Config: { projection: 'geoBertin1953' },
        suggestionScale: ['world']
      })
    );
    expect(isProjected(projection)).toBe(true);
  });

  it('resolves an exotic d3-geo-polygon suggestion (interrupted Mollweide)', () => {
    const projection = khartisProjectionFactories[
      KHARTIS_USER_PROJECTION_FACTORY
    ](
      userParams({
        suggestionD3Config: { projection: 'geoInterruptedMollweide' },
        suggestionScale: ['world']
      })
    );
    expect(isProjected(projection)).toBe(true);
  });

  it('resolves a proj4 basemap projection with a screen fit', () => {
    const projection = khartisProjectionFactories[KHARTIS_PROJ4_FACTORY]({
      proj4:
        '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +units=m +no_defs',
      fit: { bbox: EUROPE_BBOX, width: 800, height: 600, padding: 40 }
    });
    expect(isProjected(projection)).toBe(true);
  });

  it('exposes the three khartis factory ids', () => {
    expect(Object.keys(khartisProjectionFactories).sort()).toEqual(
      [
        KHARTIS_COMPOSITE_FACTORY,
        KHARTIS_PROJ4_FACTORY,
        KHARTIS_USER_PROJECTION_FACTORY
      ].sort()
    );
  });
});
