import { describe, expect, it } from 'vitest';

import { resolveOrthographicDatasetBounds } from './orthographic-reference';

describe('resolveOrthographicDatasetBounds', () => {
  it('prefers measured table bounds over persisted dataset bounds', () => {
    expect(
      resolveOrthographicDatasetBounds(
        {
          geometry: {
            bounds: [0, 0, 1, 1],
            centroid: [0.5, 0.5],
            crs: 'EPSG:4326',
            type: 'Polygon'
          }
        },
        [
          [0, 0],
          [5, 1]
        ]
      )
    ).toEqual([
      [0, 0],
      [5, 1]
    ]);
  });
});
