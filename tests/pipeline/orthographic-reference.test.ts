import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { describe, expect, it } from 'vitest';

import {
  resolveOrthographicDatasetBounds,
  resolveOrthographicReferenceBbox,
  resolveOrthographicReferenceTable,
  shouldUseBasemapReferenceInOrthographicView
} from '$lib/features/map/utils/orthographic-reference';

describe('orthographic reference selection', () => {
  const datasetTable = { name: 'dataset-table' } as unknown as ArrowTable;
  const basemapTable = { name: 'basemap-table' } as unknown as ArrowTable;

  it('keeps the basemap as orthographic reference for joined tabular datasets', () => {
    const dataset = { geometry: undefined };
    const duckDataset = { joinedBasemap: 'world-countries-50m' };

    expect(
      shouldUseBasemapReferenceInOrthographicView(dataset, duckDataset)
    ).toBe(true);

    expect(
      resolveOrthographicReferenceTable({
        dataset,
        duckDataset,
        datasetTable,
        basemapTable
      })
    ).toBe(basemapTable);
  });

  it('keeps using the dataset geometry for imported geographic files', () => {
    const dataset = {
      geometry: {
        type: 'Polygon',
        bounds: [-180, -90, 180, 90] as [number, number, number, number],
        centroid: [0, 0] as [number, number]
      }
    };
    const duckDataset = { joinedBasemap: 'world-countries-50m' };

    expect(
      shouldUseBasemapReferenceInOrthographicView(dataset, duckDataset)
    ).toBe(false);

    expect(
      resolveOrthographicReferenceTable({
        dataset,
        duckDataset,
        datasetTable,
        basemapTable
      })
    ).toBe(datasetTable);
  });

  it('keeps using the dataset table when no joined basemap is involved', () => {
    const dataset = { geometry: undefined };

    expect(shouldUseBasemapReferenceInOrthographicView(dataset, null)).toBe(
      false
    );

    expect(
      resolveOrthographicReferenceTable({
        dataset,
        duckDataset: null,
        datasetTable,
        basemapTable
      })
    ).toBe(datasetTable);
  });

  it('keeps dataset bounds for imported geographic files even if a world basemap is loaded', () => {
    const datasetBounds = [3.01, 43.35, 3.95, 43.9] as const;
    const basemapProjectedBbox = [-180, -90, 180, 90] as const;
    const basemapMainlandBbox = [-20, 10, 30, 75] as const;

    expect(
      resolveOrthographicReferenceBbox({
        datasetBounds: [...datasetBounds],
        shouldUseBasemapReference: false,
        basemapProjectedBbox: [...basemapProjectedBbox],
        basemapMainlandBbox: [...basemapMainlandBbox]
      })
    ).toEqual(datasetBounds);
  });

  it('prefers the projected dataset bbox for imported geographic files in orthographic mode', () => {
    const datasetBounds = [3.01, 43.35, 3.95, 43.9] as const;
    const datasetProjectedBbox = [402.1, 188.4, 417.9, 204.6] as const;

    expect(
      resolveOrthographicReferenceBbox({
        datasetBounds: [...datasetBounds],
        datasetProjectedBbox: [...datasetProjectedBbox],
        shouldUseBasemapReference: false
      })
    ).toEqual(datasetProjectedBbox);
  });

  it('prefers the projected basemap bbox when a reference basemap is required', () => {
    const datasetBounds = [3.01, 43.35, 3.95, 43.9] as const;
    const datasetProjectedBbox = [402.1, 188.4, 417.9, 204.6] as const;
    const basemapProjectedBbox = [-120, -60, 120, 60] as const;

    expect(
      resolveOrthographicReferenceBbox({
        datasetBounds: [...datasetBounds],
        datasetProjectedBbox: [...datasetProjectedBbox],
        shouldUseBasemapReference: true,
        basemapProjectedBbox: [...basemapProjectedBbox]
      })
    ).toEqual(basemapProjectedBbox);
  });

  it('falls back to stored dataset bounds for projected files when Arrow bounds are geographic-only', () => {
    const dataset = {
      geometry: {
        type: 'Polygon',
        bounds: [704320, 6276820, 783140, 6359140] as [
          number,
          number,
          number,
          number
        ],
        centroid: [743730, 6317980] as [number, number],
        crs: 'EPSG:2154'
      }
    };

    expect(resolveOrthographicDatasetBounds(dataset, null)).toEqual([
      [dataset.geometry.bounds[0], dataset.geometry.bounds[1]],
      [dataset.geometry.bounds[2], dataset.geometry.bounds[3]]
    ]);
  });

  it('keeps Arrow-derived bounds for geographic files', () => {
    const dataset = {
      geometry: {
        type: 'Polygon',
        bounds: [3.01, 43.35, 3.95, 43.9] as [number, number, number, number],
        centroid: [3.48, 43.62] as [number, number],
        crs: 'EPSG:4326'
      }
    };
    const tableBounds: [[number, number], [number, number]] = [
      [3.02, 43.36],
      [3.94, 43.89]
    ];

    expect(resolveOrthographicDatasetBounds(dataset, tableBounds)).toEqual(
      tableBounds
    );
  });
});
