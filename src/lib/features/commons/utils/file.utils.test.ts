import { describe, expect, it } from 'vitest';
import { replaceFileExtension } from './file.utils';

describe('replaceFileExtension', () => {
  it('should replace an existing extension', () => {
    expect(replaceFileExtension('places.kmz', 'geojson')).toBe(
      'places.geojson'
    );
  });

  it('should append an extension when the source name has none', () => {
    expect(replaceFileExtension('cities-points', '.geojson')).toBe(
      'cities-points.geojson'
    );
  });
});
