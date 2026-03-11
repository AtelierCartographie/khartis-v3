import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { describe, expect, it } from 'vitest';

import {
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
});
