import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

import { parseProjectionCode } from '$lib/features/step-toolbar/tools/projections/projection-code.utils';

const frMessages = JSON.parse(
  readFileSync(resolve(process.cwd(), 'messages/fr.json'), 'utf8')
) as Record<string, string>;
const enMessages = JSON.parse(
  readFileSync(resolve(process.cwd(), 'messages/en.json'), 'utf8')
) as Record<string, string>;

// ─── null cases ────────────────────────────────────────────────────────────

describe('parseProjectionCode — null cases', () => {
  it('returns null for empty string', () => {
    expect(parseProjectionCode('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(parseProjectionCode('   ')).toBeNull();
  });

  it('returns null when no WKT or proj4 hint is detected', () => {
    expect(parseProjectionCode('hello world')).toBeNull();
  });
});

describe('projection code helper copy', () => {
  it('advertises every CRS format accepted by the parser', () => {
    for (const helper of [
      frMessages.projection_code_helper,
      enMessages.projection_code_helper
    ]) {
      expect(helper).toContain('WKT');
      expect(helper).toContain('PROJ.4');
      expect(helper).toContain('EPSG');
    }
  });
});

// ─── format detection ──────────────────────────────────────────────────────

describe('parseProjectionCode — format detection', () => {
  it('detects proj4 format for +proj= prefix', () => {
    const result = parseProjectionCode('+proj=merc +datum=WGS84');
    expect(result?.format).toBe('proj4');
  });

  it('detects proj4 format for EPSG: prefix', () => {
    const result = parseProjectionCode('EPSG:3857');
    expect(result?.format).toBe('proj4');
  });

  it('detects wkt format for PROJCS keyword', () => {
    const wkt =
      'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",' +
      'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
      'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],' +
      'PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0.0],' +
      'PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],' +
      'PARAMETER["Standard_Parallel_1",0.0],PARAMETER["Auxiliary_Sphere_Type",0.0],' +
      'UNIT["Meter",1.0]]';
    const result = parseProjectionCode(wkt);
    expect(result?.format).toBe('wkt');
  });

  it('detects wkt format for GEOGCS keyword', () => {
    const wkt =
      'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],' +
      'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
    const result = parseProjectionCode(wkt);
    expect(result?.format).toBe('wkt');
  });
});

// ─── projection ID inference ───────────────────────────────────────────────

describe('parseProjectionCode — projection ID inference', () => {
  it('infers mercator for +proj=merc', () => {
    expect(parseProjectionCode('+proj=merc +datum=WGS84')?.projectionId).toBe(
      'mercator'
    );
  });

  it('infers equirectangular for +proj=eqc', () => {
    expect(parseProjectionCode('+proj=eqc +datum=WGS84')?.projectionId).toBe(
      'equirectangular'
    );
  });

  it('infers equirectangular for +proj=longlat', () => {
    expect(
      parseProjectionCode('+proj=longlat +datum=WGS84')?.projectionId
    ).toBe('equirectangular');
  });

  it('infers orthographic for +proj=ortho', () => {
    expect(parseProjectionCode('+proj=ortho +datum=WGS84')?.projectionId).toBe(
      'orthographic'
    );
  });

  it('infers robinson for +proj=robin', () => {
    expect(parseProjectionCode('+proj=robin +datum=WGS84')?.projectionId).toBe(
      'robinson'
    );
  });

  it('infers mollweide for +proj=moll', () => {
    expect(parseProjectionCode('+proj=moll +datum=WGS84')?.projectionId).toBe(
      'mollweide'
    );
  });

  it('infers albers for +proj=aea', () => {
    expect(
      parseProjectionCode('+proj=aea +lat_1=29.5 +lat_2=45.5 +datum=WGS84')
        ?.projectionId
    ).toBe('albers');
  });

  it('infers stereographic for +proj=stere', () => {
    expect(parseProjectionCode('+proj=stere +datum=WGS84')?.projectionId).toBe(
      'stereographic'
    );
  });

  it('infers mercator for EPSG:3857', () => {
    expect(parseProjectionCode('EPSG:3857')?.projectionId).toBe('mercator');
  });

  it('accepts Lambert-93 EPSG code and infers the closest catalogue projection', () => {
    const result = parseProjectionCode('epsg:2154');

    expect(result).toEqual({
      normalizedCode: 'EPSG:2154',
      format: 'proj4',
      projectionId: 'lambert-conformal'
    });
  });

  it('accepts ETRS89-LAEA EPSG code and infers the equal-area projection', () => {
    const result = parseProjectionCode('EPSG:3035');

    expect(result?.format).toBe('proj4');
    expect(result?.projectionId).toBe('azimuthal-equal-area');
  });

  it('accepts explicit national EPSG codes from the projection CDC', () => {
    expect(parseProjectionCode('EPSG:27700')?.format).toBe('proj4');
    expect(parseProjectionCode('EPSG:2157')?.format).toBe('proj4');
    expect(parseProjectionCode('EPSG:2056')?.format).toBe('proj4');
  });

  it('falls back to mercator for a valid but unrecognized projection', () => {
    const lcc =
      '+proj=lcc +lat_1=43 +lat_2=62 +lat_0=30 +lon_0=10 +datum=WGS84 +units=m';
    expect(parseProjectionCode(lcc)?.projectionId).toBe('mercator');
  });
});

// ─── normalizedCode ────────────────────────────────────────────────────────

describe('parseProjectionCode — normalizedCode', () => {
  it('trims surrounding whitespace from the input', () => {
    const result = parseProjectionCode('  +proj=merc +datum=WGS84  ');
    expect(result?.normalizedCode).toBe('+proj=merc +datum=WGS84');
  });
});
