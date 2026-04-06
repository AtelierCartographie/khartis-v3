import { describe, expect, it } from 'vitest';
import { sanitizePreparedGeoJSON } from '$lib/features/commons/utils/persisted-geojson.utils';

describe('sanitizePreparedGeoJSON', () => {
  it('removes persisted OGC_FID properties that would collide with ST_Read restore', () => {
    const input = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [2.35, 48.85]
          },
          properties: {
            OGC_FID: 7,
            id: 'A',
            population_2024: 120
          }
        }
      ]
    });

    const sanitized = sanitizePreparedGeoJSON(input);

    expect(sanitized).toBeTypeOf('string');
    expect(JSON.parse(sanitized ?? '{}')).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [2.35, 48.85]
          },
          properties: {
            id: 'A',
            population_2024: 120
          }
        }
      ]
    });
  });

  it('leaves non-geojson payloads untouched', () => {
    const input = '{"foo":"bar"}';
    expect(sanitizePreparedGeoJSON(input)).toBe(input);
  });
});
