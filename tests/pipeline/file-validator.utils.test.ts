import { describe, expect, it } from 'vitest';

import * as m from '$lib/paraglide/messages';
import {
  FileValidator,
  type DetailedValidationResult
} from '$lib/features/commons/utils/file-validator.utils';
import { FileType } from '$lib/features/commons/store/create-project.types';

function buildInitialResult(file: File): DetailedValidationResult {
  const result = FileValidator.validate(file);

  expect(result.fileType).toBe(FileType.GEOJSON);
  expect(result.requiresAsyncValidation).toBe(true);

  return result;
}

describe('FileValidator.validateGeoJSONContent', () => {
  it('accepts a valid geojson file larger than the header buffer', async () => {
    const content = JSON.stringify({
      type: 'FeatureCollection',
      features: Array.from({ length: 6 }, (_, index) => ({
        type: 'Feature',
        properties: {
          id: `feature-${index}`,
          name: `Feature ${index}`
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [index, 0],
              [index + 0.5, 0],
              [index + 0.5, 0.5],
              [index, 0.5],
              [index, 0]
            ]
          ]
        }
      }))
    });

    expect(content.length).toBeGreaterThan(512);

    const file = new File([content], 'tiny-geo-3features.geojson', {
      type: 'application/geo+json'
    });

    const result = await FileValidator.validateAsync(
      file,
      buildInitialResult(file)
    );

    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it('still reports invalid json for malformed geojson content', async () => {
    const file = new File(
      ['{"type":"FeatureCollection","features":[{"type":"Feature",]'],
      'broken.geojson',
      { type: 'application/geo+json' }
    );

    const result = await FileValidator.validateAsync(
      file,
      buildInitialResult(file)
    );

    expect(result.errors).toContain(m.validation_json_invalid());
    expect(result.isValid).toBe(false);
  });
});
