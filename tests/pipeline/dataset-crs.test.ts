import { describe, expect, it } from 'vitest';
import {
  canUseBoundsForProjectionSuggestion,
  isWgs84LikeCrs
} from '$lib/features/map/utils/dataset-crs.utils';

describe('isWgs84LikeCrs', () => {
  it('recognizes WGS84 / CRS84 spellings as WGS84-like', () => {
    expect(isWgs84LikeCrs('EPSG:4326')).toBe(true);
    expect(isWgs84LikeCrs('WGS 84')).toBe(true);
    expect(isWgs84LikeCrs('urn:ogc:def:crs:OGC:1.3:CRS84')).toBe(true);
    expect(isWgs84LikeCrs('OGC:CRS84')).toBe(true);
  });

  it('treats other datums/projections as non-WGS84', () => {
    expect(isWgs84LikeCrs('EPSG:4269')).toBe(false); // NAD83 geographic
    expect(isWgs84LikeCrs('EPSG:2154')).toBe(false); // Lambert-93
    expect(isWgs84LikeCrs(null)).toBe(false);
    expect(isWgs84LikeCrs(undefined)).toBe(false);
  });
});

describe('canUseBoundsForProjectionSuggestion', () => {
  it('uses dataset bounds directly only when they are already WGS84', () => {
    // No CRS or WGS84-like → bounds are WGS84, usable as-is.
    expect(canUseBoundsForProjectionSuggestion(null)).toBe(true);
    expect(canUseBoundsForProjectionSuggestion('EPSG:4326')).toBe(true);
    // Non-WGS84 → bounds must be reprojected (ST_Transform) before use.
    expect(canUseBoundsForProjectionSuggestion('EPSG:4269')).toBe(false);
    expect(canUseBoundsForProjectionSuggestion('EPSG:2154')).toBe(false);
  });
});
