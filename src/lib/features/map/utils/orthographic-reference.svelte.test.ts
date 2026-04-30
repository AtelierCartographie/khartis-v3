import { describe, expect, it } from 'vitest';

import {
  resolveOrthographicDatasetBounds,
  resolveOrthographicProjectionFitBbox,
  resolveOrthographicReferenceBbox
} from './orthographic-reference';

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

describe('resolveOrthographicProjectionFitBbox', () => {
  it('prefers the active dataset bbox for manual projection fitting', () => {
    expect(
      resolveOrthographicProjectionFitBbox({
        datasetBbox: [-10, 35, 30, 70],
        shouldUseBasemapReference: true,
        basemapBbox: [-180, -90, 180, 90],
        preferDatasetBbox: true
      })
    ).toEqual([-10, 35, 30, 70]);
  });

  it('keeps basemap bounds for reference-driven fitting by default', () => {
    expect(
      resolveOrthographicProjectionFitBbox({
        datasetBbox: [-10, 35, 30, 70],
        shouldUseBasemapReference: true,
        basemapBbox: [-180, -90, 180, 90]
      })
    ).toEqual([-180, -90, 180, 90]);
  });
});

describe('resolveOrthographicReferenceBbox', () => {
  it('can prefer the projected dataset bbox even when a basemap reference exists', () => {
    expect(
      resolveOrthographicReferenceBbox({
        datasetBounds: [-10, 35, 30, 70],
        datasetProjectedBbox: [100, 100, 500, 500],
        shouldUseBasemapReference: true,
        basemapProjectedBbox: [0, 0, 960, 600],
        preferDatasetBbox: true
      })
    ).toEqual([100, 100, 500, 500]);
  });
});
