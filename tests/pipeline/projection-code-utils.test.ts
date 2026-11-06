import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/commons/utils/projection.utils', () => ({
  PROJECTIONS: [
    { id: 'mercator' },
    { id: 'natural-earth' },
    { id: 'equirectangular' },
    { id: 'orthographic' },
    { id: 'albers' },
    { id: 'lambert-conformal' },
    { id: 'robinson' },
    { id: 'mollweide' },
    { id: 'winkel-tripel' },
    { id: 'stereographic' },
    { id: 'azimuthal-equal-area' }
  ]
}));

import { geoPath } from 'd3-geo';
import { proj4d3 } from '$lib/features/map/utils/proj4d3.utils';
import { diagnoseProjectionCode } from '$lib/features/step-toolbar/tools/projections/projection-code.utils';
import { registerResolvedCoordinateSystem } from '$lib/features/commons/utils/proj4-crs.utils';

const LAMBERT_93_ESRI_PRJ = `PROJCS["RGF_1993_Lambert_93",GEOGCS["GCS_RGF_1993",DATUM["D_RGF_1993",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Lambert_Conformal_Conic"],PARAMETER["False_Easting",700000.0],PARAMETER["False_Northing",6600000.0],PARAMETER["Central_Meridian",3.0],PARAMETER["Standard_Parallel_1",49.0],PARAMETER["Standard_Parallel_2",44.0],PARAMETER["Latitude_Of_Origin",46.5],UNIT["Meter",1.0]]`;
const LAMBERT_93_WKT2 = `PROJCRS["RGF93 v1 / Lambert-93",BASEGEOGCRS["RGF93 v1",DATUM["Reseau Geodesique Francais 1993 v1",ELLIPSOID["GRS 1980",6378137,298.257222101,LENGTHUNIT["metre",1]]],PRIMEM["Greenwich",0,ANGLEUNIT["degree",0.0174532925199433]],ID["EPSG",4171]],CONVERSION["Lambert-93",METHOD["Lambert Conic Conformal (2SP)",ID["EPSG",9802]],PARAMETER["Latitude of false origin",46.5,ANGLEUNIT["degree",0.0174532925199433]],PARAMETER["Longitude of false origin",3,ANGLEUNIT["degree",0.0174532925199433]],PARAMETER["Latitude of 1st standard parallel",49,ANGLEUNIT["degree",0.0174532925199433]],PARAMETER["Latitude of 2nd standard parallel",44,ANGLEUNIT["degree",0.0174532925199433]],PARAMETER["Easting at false origin",700000,LENGTHUNIT["metre",1]],PARAMETER["Northing at false origin",6600000,LENGTHUNIT["metre",1]]],CS[Cartesian,2],AXIS["easting (X)",east,ORDER[1],LENGTHUNIT["metre",1]],AXIS["northing (Y)",north,ORDER[2],LENGTHUNIT["metre",1]],ID["EPSG",2154]]`;

const L93_PROJJSON = JSON.stringify({
  type: 'ProjectedCRS',
  name: 'RGF93 v2b / Lambert-93',
  base_crs: {
    name: 'RGF93 v2b',
    datum: {
      type: 'GeodeticReferenceFrame',
      name: 'RGF93 v2b',
      ellipsoid: {
        name: 'GRS 1980',
        semi_major_axis: 6378137,
        inverse_flattening: 298.257222101
      }
    }
  },
  conversion: {
    name: 'Lambert-93',
    method: { name: 'Lambert Conic Conformal (2SP)' },
    parameters: [
      { name: 'Latitude of false origin', value: 46.5, unit: 'degree' },
      { name: 'Longitude of false origin', value: 3, unit: 'degree' },
      { name: 'Latitude of 1st standard parallel', value: 49, unit: 'degree' },
      { name: 'Latitude of 2nd standard parallel', value: 44, unit: 'degree' },
      { name: 'Easting at false origin', value: 700000, unit: 'metre' },
      { name: 'Northing at false origin', value: 6600000, unit: 'metre' }
    ]
  },
  id: { authority: 'EPSG', code: 9794 }
});

const FRANCE: [number, number, number, number] = [-5, 41, 10, 51.5];
const ATLANTIC: [number, number, number, number] = [-120, -40, 40, 70];
const AUSTRALIA: [number, number, number, number] = [113, -44, 154, -10];

describe('diagnoseProjectionCode', () => {
  it('should project an Albers or LAEA definition that omits x_0, y_0 or lat_0', () => {
    for (const code of [
      '+proj=aea +lat_0=23 +lon_0=-96 +lat_1=29.5 +lat_2=45.5 +datum=NAD83 +units=m',
      '+proj=laea +lat_0=90 +lon_0=0 +datum=WGS84 +units=m'
    ]) {
      expect(diagnoseProjectionCode(code).status).toBe('valid');
      expect(proj4d3(code)([2, 60])?.every(Number.isFinite)).toBe(true);
    }
  });

  it('should name a registered EPSG code typed as a bare number', () => {
    const diagnosis = diagnoseProjectionCode(' 2154 ', FRANCE);

    expect(diagnosis).toMatchObject({
      status: 'valid',
      format: 'authority',
      normalizedCode: 'EPSG:2154',
      coverage: 'full',
      crs: { name: 'RGF93 v1 / Lambert-93', epsg: '2154' }
    });
  });

  it('should read the CRS name of an ESRI .prj and the EPSG id of a WKT2', () => {
    expect(diagnoseProjectionCode(LAMBERT_93_ESRI_PRJ)).toMatchObject({
      status: 'valid',
      format: 'wkt',
      crs: { name: 'RGF 1993 Lambert 93', epsg: undefined }
    });
    expect(diagnoseProjectionCode(LAMBERT_93_WKT2)).toMatchObject({
      status: 'valid',
      crs: { name: 'RGF93 v1 / Lambert-93', epsg: '2154' }
    });
  });

  it('should send a code proj4 does not bundle to the PROJ database', () => {
    expect(diagnoseProjectionCode('EPSG:4258')).toEqual({
      status: 'unresolved-authority-code',
      code: 'EPSG:4258'
    });
  });

  it('should apply a code read from the PROJ database as its PROJJSON', () => {
    const entry = {
      name: 'RGF93 v2b / Lambert-93',
      projjson: L93_PROJJSON,
      wkt: 'PROJCRS["RGF93 v2b / Lambert-93"]',
      renderable: true
    };
    registerResolvedCoordinateSystem('EPSG:9794', entry);
    registerResolvedCoordinateSystem('EPSG:9998', null);
    registerResolvedCoordinateSystem('EPSG:9999', {
      ...entry,
      name: 'Swiss oblique',
      renderable: false
    });

    expect(diagnoseProjectionCode('9794')).toMatchObject({
      status: 'valid',
      normalizedCode: L93_PROJJSON,
      crs: { name: 'RGF93 v2b / Lambert-93', epsg: '9794' }
    });
    expect(diagnoseProjectionCode('EPSG:9998').status).toBe(
      'unknown-authority-code'
    );
    expect(diagnoseProjectionCode('EPSG:9999')).toEqual({
      status: 'unrenderable-crs',
      code: 'EPSG:9999',
      name: 'Swiss oblique'
    });
  });

  it('should route a method proj4 lacks to its catalogue equivalent', () => {
    expect(diagnoseProjectionCode('+proj=natearth +lon_0=10')).toEqual({
      status: 'catalogue-equivalent',
      method: 'natearth',
      catalogueId: 'natural-earth',
      longitude: 10
    });
    expect(diagnoseProjectionCode('+proj=foo')).toEqual({
      status: 'unsupported-method',
      method: 'foo'
    });
  });

  it('should reject text that is not a CRS and a definition that projects nothing', () => {
    expect(diagnoseProjectionCode('Lambert 93').status).toBe('unrecognized');
    expect(diagnoseProjectionCode('+proj=lcc +lat_1=').status).toBe('invalid');
  });

  it('should grade how much of the extent an orthographic view can draw', () => {
    const code = '+proj=ortho +lat_0=45 +lon_0=10 +datum=WGS84';

    expect(diagnoseProjectionCode(code, ATLANTIC)).toMatchObject({
      coverage: 'partial'
    });
    expect(diagnoseProjectionCode(code, AUSTRALIA)).toMatchObject({
      coverage: 'none'
    });
  });
});

describe('diagnoseProjectionCode — closest catalogue projection', () => {
  it.each([
    ['+proj=merc +datum=WGS84', 'mercator'],
    ['+proj=eqc +datum=WGS84', 'equirectangular'],
    ['+proj=longlat +datum=WGS84', 'equirectangular'],
    ['+proj=ortho +datum=WGS84', 'orthographic'],
    ['+proj=robin +datum=WGS84', 'robinson'],
    ['+proj=moll +datum=WGS84', 'mollweide'],
    ['+proj=aea +lat_1=29.5 +lat_2=45.5 +datum=WGS84', 'albers'],
    ['+proj=stere +datum=WGS84', 'stereographic'],
    ['EPSG:3857', 'mercator'],
    ['epsg:2154', 'lambert-conformal'],
    ['EPSG:3035', 'azimuthal-equal-area'],
    [
      '+proj=lcc +lat_1=43 +lat_2=62 +lat_0=30 +lon_0=10 +datum=WGS84 +units=m',
      'lambert-conformal'
    ],
    ['+proj=gnom +lat_0=45 +lon_0=10 +datum=WGS84 +units=m', 'mercator']
  ])('should map %s to %s', (code, projectionId) => {
    expect(diagnoseProjectionCode(code)).toMatchObject({
      status: 'valid',
      projectionId
    });
  });

  it('should accept the national EPSG codes of the projection CDC', () => {
    for (const code of ['EPSG:27700', 'EPSG:2157', 'EPSG:2056']) {
      expect(diagnoseProjectionCode(code)).toMatchObject({
        status: 'valid',
        format: 'authority'
      });
    }
  });

  it('should detect WKT for PROJCS and GEOGCS and trim the input', () => {
    const geogcs =
      'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],' +
      'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';

    expect(diagnoseProjectionCode(geogcs)).toMatchObject({ format: 'wkt' });
    expect(diagnoseProjectionCode('  +proj=merc +datum=WGS84  ')).toMatchObject(
      { format: 'proj4', normalizedCode: '+proj=merc +datum=WGS84' }
    );
    expect(diagnoseProjectionCode('   ')).toEqual({ status: 'empty' });
  });
});

describe('proj4d3', () => {
  const LAMBERT_93 = 'EPSG:2154';
  // d3 reads clockwise rings as the small polygon.
  const square = (west: number, south: number, size: number) => ({
    type: 'Polygon' as const,
    coordinates: [
      [
        [west, south],
        [west, south + size / 2],
        [west + size, south + size / 2],
        [west + size, south],
        [west, south]
      ]
    ]
  });
  // The frame rotation changes where d3 puts the origin, never the shape:
  // compare vectors between projected points, which ignore translation.
  const vector = (
    projection: (point: [number, number]) => [number, number] | null,
    from: [number, number],
    to: [number, number]
  ) => {
    const a = projection(from) ?? [NaN, NaN];
    const b = projection(to) ?? [NaN, NaN];
    return [b[0] - a[0], b[1] - a[1]];
  };
  const sameVector = (a: number[], b: number[]) =>
    Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

  it('should keep the shape of the unrotated bridge once centred on the CRS', () => {
    for (const code of [
      LAMBERT_93,
      'EPSG:3035',
      '+proj=robin +lon_0=150 +datum=WGS84',
      '+proj=ortho +lat_0=45 +lon_0=10 +datum=WGS84'
    ]) {
      const centred = proj4d3(code);
      const legacy = proj4d3(code, { orient: false });

      expect(
        sameVector(
          vector(centred, [2.35, 48.85], [10, 52]),
          vector(legacy, [2.35, 48.85], [10, 52])
        )
      ).toBe(true);
    }
  });

  it('should cut a Pacific-centred CRS at its own opposite meridian', () => {
    const area = (orient: boolean, west: number) => {
      const projection = proj4d3('+proj=robin +lon_0=150 +datum=WGS84', {
        orient
      }).fitExtent(
        [
          [0, 0],
          [800, 400]
        ],
        { type: 'Sphere' }
      );
      return geoPath(projection).area(square(west, 0, 20));
    };

    expect(area(true, -40)).toBeLessThan(area(true, 0) * 1.1);
    expect(area(false, -40)).toBeGreaterThan(area(false, 0) * 10);
  });

  it('should clip an orthographic CRS to its visible hemisphere', () => {
    const projection = proj4d3('+proj=ortho +lat_0=45 +lon_0=10 +datum=WGS84');
    const bounds = geoPath(projection)
      .bounds(square(-170, -60, 340))
      .flat();

    expect(bounds.every(Number.isFinite)).toBe(true);
  });

  it('should move the central meridian like lon_0 when offset by the settings', () => {
    const shifted = proj4d3(LAMBERT_93);
    const [lambda, phi] = shifted.rotate();
    shifted.rotate([lambda - 5, phi]);
    const reference = proj4d3(
      '+proj=lcc +lat_0=46.5 +lon_0=8 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m'
    );

    expect(
      sameVector(
        vector(shifted, [12, 47], [15, 50]),
        vector(reference, [12, 47], [15, 50])
      )
    ).toBe(true);
  });

  it('should resolve the national EPSG codes proj-suggest can suggest', () => {
    for (const code of ['EPSG:5070', 'EPSG:28992', 'EPSG:3576']) {
      expect(diagnoseProjectionCode(code)).toMatchObject({ status: 'valid' });
    }
  });
});
