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

import { proj4d3 } from '$lib/features/map/utils/proj4d3.utils';
import { diagnoseProjectionCode } from '$lib/features/step-toolbar/tools/projections/projection-code.utils';

const LAMBERT_93_ESRI_PRJ = `PROJCS["RGF_1993_Lambert_93",GEOGCS["GCS_RGF_1993",DATUM["D_RGF_1993",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Lambert_Conformal_Conic"],PARAMETER["False_Easting",700000.0],PARAMETER["False_Northing",6600000.0],PARAMETER["Central_Meridian",3.0],PARAMETER["Standard_Parallel_1",49.0],PARAMETER["Standard_Parallel_2",44.0],PARAMETER["Latitude_Of_Origin",46.5],UNIT["Meter",1.0]]`;
const LAMBERT_93_WKT2 = `PROJCRS["RGF93 v1 / Lambert-93",BASEGEOGCRS["RGF93 v1",DATUM["Reseau Geodesique Francais 1993 v1",ELLIPSOID["GRS 1980",6378137,298.257222101,LENGTHUNIT["metre",1]]],PRIMEM["Greenwich",0,ANGLEUNIT["degree",0.0174532925199433]],ID["EPSG",4171]],CONVERSION["Lambert-93",METHOD["Lambert Conic Conformal (2SP)",ID["EPSG",9802]],PARAMETER["Latitude of false origin",46.5,ANGLEUNIT["degree",0.0174532925199433]],PARAMETER["Longitude of false origin",3,ANGLEUNIT["degree",0.0174532925199433]],PARAMETER["Latitude of 1st standard parallel",49,ANGLEUNIT["degree",0.0174532925199433]],PARAMETER["Latitude of 2nd standard parallel",44,ANGLEUNIT["degree",0.0174532925199433]],PARAMETER["Easting at false origin",700000,LENGTHUNIT["metre",1]],PARAMETER["Northing at false origin",6600000,LENGTHUNIT["metre",1]]],CS[Cartesian,2],AXIS["easting (X)",east,ORDER[1],LENGTHUNIT["metre",1]],AXIS["northing (Y)",north,ORDER[2],LENGTHUNIT["metre",1]],ID["EPSG",2154]]`;

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

  it('should report an EPSG code that is not bundled', () => {
    expect(diagnoseProjectionCode('EPSG:5070')).toEqual({
      status: 'unknown-authority-code',
      code: 'EPSG:5070'
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
