import type { GeoProjection } from 'd3-geo';
import * as d3Geo from 'd3-geo';
import * as d3GeoProjection from 'd3-geo-projection';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/paraglide/messages', () => {
  const message = () => '';
  return Object.fromEntries(
    [
      'projection_desc_airocean',
      'projection_desc_aitoff',
      'projection_desc_albers',
      'projection_desc_armadillo',
      'projection_desc_atlantis',
      'projection_desc_azimuthal_equal_area',
      'projection_desc_azimuthal_equidistant',
      'projection_desc_bertin_1953',
      'projection_desc_bonne',
      'projection_desc_cassini',
      'projection_desc_cylindrical_equal_area',
      'projection_desc_equal_earth',
      'projection_desc_equidistant_conic',
      'projection_desc_equirectangular',
      'projection_desc_gall_peters',
      'projection_desc_imago',
      'projection_desc_interrupted_mollweide',
      'projection_desc_lambert_conformal',
      'projection_desc_mercator',
      'projection_desc_mollweide',
      'projection_desc_mollweide_hemispheres',
      'projection_desc_mollweide_oceans',
      'projection_desc_natural_earth',
      'projection_desc_orthographic',
      'projection_desc_peirce_quincuncial',
      'projection_desc_robinson',
      'projection_desc_stereographic',
      'projection_desc_times',
      'projection_desc_transverse_mercator',
      'projection_desc_waterman',
      'projection_desc_winkel_tripel',
      'projection_name_airocean',
      'projection_name_aitoff',
      'projection_name_albers',
      'projection_name_armadillo',
      'projection_name_atlantis',
      'projection_name_azimuthal_equal_area',
      'projection_name_azimuthal_equidistant',
      'projection_name_bertin_1953',
      'projection_name_bonne',
      'projection_name_cassini',
      'projection_name_cylindrical_equal_area',
      'projection_name_equal_earth',
      'projection_name_equidistant_conic',
      'projection_name_equirectangular',
      'projection_name_gall_peters',
      'projection_name_imago',
      'projection_name_interrupted_mollweide',
      'projection_name_lambert_conformal',
      'projection_name_mercator',
      'projection_name_mollweide',
      'projection_name_mollweide_hemispheres',
      'projection_name_mollweide_oceans',
      'projection_name_natural_earth',
      'projection_name_orthographic',
      'projection_name_peirce_quincuncial',
      'projection_name_robinson',
      'projection_name_stereographic',
      'projection_name_times',
      'projection_name_transverse_mercator',
      'projection_name_waterman',
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

  it('fits conic projections to Europe without a degenerate projected extent', async () => {
    const { fitProjectionToBbox } = await import('./projection.utils');
    const projection = d3Geo.geoConicConformal();
    const europeBbox: [number, number, number, number] = [
      -24.6, 34.8, 45.8, 71.2
    ];

    fitProjectionToBbox(projection, europeBbox, 800, 600, 40);
    const [west, south, east, north] = europeBbox;
    const projectedBbox = d3Geo.geoPath(projection).bounds({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south]
          ]
        ]
      },
      properties: {}
    });
    const [[minX, minY], [maxX, maxY]] = projectedBbox;

    expect([minX, minY, maxX, maxY].every(Number.isFinite)).toBe(true);
    expect(maxX - minX).toBeGreaterThan(600);
    expect(maxY - minY).toBeGreaterThan(250);
  });
});

describe('resolveProjectionDefaultOrientation', () => {
  it('keeps the intrinsic orientation of a d3 suggestion config', async () => {
    const { resolveProjectionDefaultOrientation } =
      await import('./projection.utils');

    expect(
      resolveProjectionDefaultOrientation({
        suggestionD3Config: { projection: 'geoBertin1953' }
      })
    ).toEqual([16.5, 42]);
  });

  it('keeps the intrinsic orientation of a catalogue projection', async () => {
    const { resolveProjectionDefaultOrientation } =
      await import('./projection.utils');

    const [longitude, latitude] = resolveProjectionDefaultOrientation({
      selected: 'airocean'
    });

    expect(longitude).toBeCloseTo(83.65929, 5);
    expect(latitude).toBeCloseTo(-25.44458, 5);
  });

  it('reports no intrinsic orientation for a user CRS code', async () => {
    const { resolveProjectionDefaultOrientation } =
      await import('./projection.utils');

    expect(
      resolveProjectionDefaultOrientation({
        selected: 'mercator',
        customCode: '+proj=moll'
      })
    ).toEqual([0, 0]);
  });
});

describe('buildProjectionFromCatalogueId', () => {
  it('applies the Gall-Peters standard parallel through the single-parallel setter', async () => {
    const { buildProjectionFromCatalogueId } =
      await import('./projection.utils');
    const projection = buildProjectionFromCatalogueId('gall-peters');

    expect(projection).toBeDefined();
    const west = projection!([-180, 0])!;
    const east = projection!([180, 0])!;
    const north = projection!([0, 90])!;
    const south = projection!([0, -90])!;

    // A cylindrical equal-area with a 45° standard parallel has a world
    // aspect ratio of pi * cos(45)^2; d3's own default parallel (38.58°)
    // would give 1.92.
    expect(
      Math.abs(east[0] - west[0]) / Math.abs(south[1] - north[1])
    ).toBeCloseTo(Math.PI / 2, 3);
  });

  it('builds the square Peirce quincuncial world map centred on the North Pole', async () => {
    const { buildProjectionFromCatalogueId } =
      await import('./projection.utils');
    const projection = buildProjectionFromCatalogueId('peirce-quincuncial');

    expect(projection).toBeDefined();
    projection!.fitExtent(
      [
        [0, 0],
        [100, 100]
      ],
      { type: 'Sphere' }
    );

    expect(projection!([0, 90])![0]).toBeCloseTo(50, 3);
    expect(projection!([0, 90])![1]).toBeCloseTo(50, 3);
    expect(projection!([0, -90])![0]).toBeCloseTo(0, 3);
    expect(projection!([0, -90])![1]).toBeCloseTo(0, 3);
  });

  it('centres the square world map on lon 25 without the d3 default roll', async () => {
    const {
      buildProjectionFromCatalogueId,
      resolveProjectionDefaultOrientation
    } = await import('./projection.utils');
    const projection = buildProjectionFromCatalogueId('peirce-quincuncial');

    // d3's own default is rotate([-90, -90, 45]); that roll inverts part of
    // the polygon rings, which inflates the projected land area.
    expect(projection!.rotate()).toEqual([-25, -90, 0]);
    expect(
      resolveProjectionDefaultOrientation({ selected: 'peirce-quincuncial' })
    ).toEqual([25, 90]);
  });
});
