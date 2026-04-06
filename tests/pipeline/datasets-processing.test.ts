import { describe, expect, it, vi } from 'vitest';
import {
  DataSourceType,
  FileStatus,
  FileType,
  type UploadedFile
} from '$lib/features/commons/store/create-project.types';

vi.mock('$lib/features/data-pipeline', () => ({
  ColumnType: {
    TEXT: 'text',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    DATE: 'date',
    GEOMETRY: 'geometry'
  },
  computeCentroid: (bounds: [number, number, number, number]) => [
    (bounds[0] + bounds[2]) / 2,
    (bounds[1] + bounds[3]) / 2
  ],
  dataPipeline: {},
  isZipDatasetResult: () => false
}));

vi.mock('$lib/paraglide/messages', () => ({}));
vi.mock('$lib/features/commons/utils/notification.utils.svelte', () => ({
  showWarning: vi.fn()
}));

import { createDatasetFromPreprocessedFile } from '$lib/features/commons/store/datasets/datasets-processing';

describe('createDatasetFromPreprocessedFile', () => {
  it('restores geo datasets from prepared geojson snapshots', () => {
    const file: UploadedFile = {
      id: 'source-file-id',
      datasetId: 'dataset-id',
      name: 'tiny-geo-3features.geojson',
      size: 512,
      type: 'application/geo+json',
      fileType: FileType.GEOJSON,
      status: FileStatus.COMPLETE,
      sourceType: DataSourceType.URL,
      duckdbTableName: 'tiny_geo_enriched',
      parsedData: [{}, {}, {}],
      statistics: {
        id: { type: 'text', count: 3, nullCount: 0, unique: 3 },
        population_2024: {
          type: 'number',
          count: 3,
          nullCount: 0,
          unique: 3,
          min: 100,
          max: 300
        },
        geom: { type: 'geometry', count: 3, nullCount: 0, unique: 3 }
      },
      preparedGeoJSON: JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [1, 45],
                  [2, 45],
                  [2, 46],
                  [1, 46],
                  [1, 45]
                ]
              ]
            },
            properties: { id: 'A', population_2024: 100 }
          },
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [3, 47],
                  [4, 47],
                  [4, 48],
                  [3, 48],
                  [3, 47]
                ]
              ]
            },
            properties: { id: 'B', population_2024: 200 }
          },
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [5, 49],
                  [6, 49],
                  [6, 50],
                  [5, 50],
                  [5, 49]
                ]
              ]
            },
            properties: { id: 'C', population_2024: 300 }
          }
        ]
      })
    };

    const dataset = createDatasetFromPreprocessedFile(file);

    expect(dataset.id).toBe('dataset-id');
    expect(dataset.tableName).toBe('tiny_geo_enriched');
    expect(dataset.rowCount).toBe(3);
    expect(dataset.geometry).toMatchObject({
      type: 'Polygon',
      columnName: 'geom',
      bounds: [1, 45, 6, 50],
      centroid: [3.5, 47.5],
      featureCount: 3
    });
    expect(dataset.analysis?.hasGeoData).toBe(true);
    expect(dataset.analysis?.geoColumns).toHaveLength(1);
    expect(dataset.data).toEqual([
      { id: 'A', population_2024: 100 },
      { id: 'B', population_2024: 200 },
      { id: 'C', population_2024: 300 }
    ]);
  });
});
