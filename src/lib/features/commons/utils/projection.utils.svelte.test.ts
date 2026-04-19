import type { GeoProjection } from 'd3-geo';
import * as d3GeoProjection from 'd3-geo-projection';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/paraglide/messages', () => {
  const message = () => '';
  return Object.fromEntries(
    [
      'projection_desc_aitoff',
      'projection_desc_albers',
      'projection_desc_armadillo',
      'projection_desc_atlantis',
      'projection_desc_azimuthal_equal_area',
      'projection_desc_bertin_1953',
      'projection_desc_bonne',
      'projection_desc_equal_earth',
      'projection_desc_equirectangular',
      'projection_desc_gall_peters',
      'projection_desc_interrupted_mollweide',
      'projection_desc_lambert_conformal',
      'projection_desc_mercator',
      'projection_desc_mollweide',
      'projection_desc_natural_earth',
      'projection_desc_orthographic',
      'projection_desc_robinson',
      'projection_desc_stereographic',
      'projection_desc_winkel_tripel',
      'projection_name_aitoff',
      'projection_name_albers',
      'projection_name_armadillo',
      'projection_name_atlantis',
      'projection_name_azimuthal_equal_area',
      'projection_name_bertin_1953',
      'projection_name_bonne',
      'projection_name_equal_earth',
      'projection_name_equirectangular',
      'projection_name_gall_peters',
      'projection_name_interrupted_mollweide',
      'projection_name_lambert_conformal',
      'projection_name_mercator',
      'projection_name_mollweide',
      'projection_name_natural_earth',
      'projection_name_orthographic',
      'projection_name_robinson',
      'projection_name_stereographic',
      'projection_name_winkel_tripel'
    ].map((key) => [key, message])
  );
});

describe('fitProjectionToBbox', () => {
  it('fits small extents without treating them as the spherical complement', async () => {
    const { fitProjectionToBbox } = await import('./projection.utils');
    const projection = (
      d3GeoProjection as unknown as { geoNaturalEarth2: () => GeoProjection }
    ).geoNaturalEarth2();

    fitProjectionToBbox(projection, [0, 0, 5, 1], 778, 531, 40);

    const origin = projection([0, 0]);
    const farCorner = projection([5, 1]);

    expect(origin).not.toBeNull();
    expect(farCorner).not.toBeNull();
    expect(Math.abs(farCorner![0] - origin![0])).toBeGreaterThan(600);
    expect(Math.abs(farCorner![1] - origin![1])).toBeGreaterThan(100);
  });
});
