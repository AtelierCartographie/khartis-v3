import { describe, expect, it } from 'vitest';

import {
  canUseBoundsForProjectionSuggestion,
  isWgs84LikeCrs,
  shouldUseIdentityProjectionForDatasetCrs
} from '$lib/features/map/utils/dataset-crs';

describe('dataset CRS helpers', () => {
  it('detects WGS84-like CRS values', () => {
    expect(isWgs84LikeCrs('EPSG:4326')).toBe(true);
    expect(isWgs84LikeCrs('epsg:4326')).toBe(true);
    expect(isWgs84LikeCrs('WGS 84')).toBe(true);
    expect(isWgs84LikeCrs('EPSG:2154')).toBe(false);
    expect(isWgs84LikeCrs(undefined)).toBe(false);
  });

  it('only accepts geographic bounds for projection suggestions', () => {
    expect(canUseBoundsForProjectionSuggestion(undefined)).toBe(true);
    expect(canUseBoundsForProjectionSuggestion('EPSG:4326')).toBe(true);
    expect(canUseBoundsForProjectionSuggestion('WGS 84')).toBe(true);
    expect(canUseBoundsForProjectionSuggestion('EPSG:2154')).toBe(false);
  });

  it('keeps projected datasets on the identity path by default', () => {
    expect(shouldUseIdentityProjectionForDatasetCrs(undefined)).toBe(false);
    expect(shouldUseIdentityProjectionForDatasetCrs('EPSG:4326')).toBe(false);
    expect(shouldUseIdentityProjectionForDatasetCrs('EPSG:2154')).toBe(true);
  });
});
