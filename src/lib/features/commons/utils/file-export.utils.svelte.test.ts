import { describe, expect, it } from 'vitest';
import {
  exportProcessedDatasets,
  exportToGeoJson,
  type GeoJsonExportDataset
} from './file-export.utils';
import { DataValidationError } from '$lib/features/commons/pipeline.errors';

function createGeometryDataset(
  geometryValue: Record<string, unknown> | string
): GeoJsonExportDataset & { rows: Record<string, unknown>[] } {
  return {
    id: 'dataset-1',
    name: 'Tiny geo',
    format: 'geojson',
    rows: [
      {
        OGC_FID: 1,
        id: 'A',
        name: 'Alpha',
        value: 42,
        geom: geometryValue,
        __id: 1
      }
    ],
    rowCount: 1,
    columns: [
      { name: 'OGC_FID', type: 'number', nullable: false, unique: true },
      { name: 'id', type: 'string', nullable: false, unique: true },
      { name: 'name', type: 'string', nullable: false, unique: true },
      { name: 'value', type: 'number', nullable: false, unique: true },
      { name: 'geom', type: 'string', nullable: false, unique: true },
      { name: '__id', type: 'number', nullable: false, unique: true }
    ],
    analysis: {
      columns: [],
      geoColumns: [],
      hasGeoData: true,
      rowCount: 1,
      warnings: []
    },
    geometry: 'Polygon',
    duckdbTableName: undefined,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    fileSize: 123,
    metadata: {
      processedAt: new Date('2026-01-01T00:00:00Z'),
      transformations: []
    }
  };
}

describe('file export utils', () => {
  it('keeps similarly named properties when a canonical geometry column exists', async () => {
    const dataset = createGeometryDataset({
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0],
          [1, 1]
        ]
      ]
    });
    dataset.columns.splice(1, 0, {
      name: 'geo_point_2d',
      type: 'string',
      nullable: true,
      unique: false
    });
    dataset.rows[0].geo_point_2d = 'source property';

    const geojson = JSON.parse(
      await (await exportProcessedDatasets([dataset], 'geojson')).text()
    ) as {
      features: Array<{
        geometry: { type: string };
        properties: Record<string, unknown>;
      }>;
    };

    expect(geojson.features[0].geometry.type).toBe('MultiLineString');
    expect(geojson.features[0].properties.geo_point_2d).toBe('source property');
    expect(geojson.features[0].properties).not.toHaveProperty('geom');
  });

  it('fails exports with a typed error when there are no datasets', async () => {
    await expect(exportProcessedDatasets([], 'geojson')).rejects.toMatchObject({
      name: 'DataValidationError',
      code: 'DATA_VALIDATION_ERROR',
      field: 'datasets',
      details: {
        field: 'datasets',
        format: 'geojson'
      }
    });
  });

  it('fails geojson exports with a typed error when no geometry is available', async () => {
    const dataset = createGeometryDataset({
      type: 'Point',
      coordinates: [2.3522, 48.8566]
    });
    dataset.geometry = undefined;
    dataset.analysis.hasGeoData = false;
    dataset.analysis.geoColumns = [];

    await expect(
      exportProcessedDatasets([dataset], 'geojson')
    ).rejects.toMatchObject({
      name: 'DataValidationError',
      code: 'DATA_VALIDATION_ERROR',
      field: 'geometry',
      details: {
        field: 'geometry',
        format: 'geojson'
      }
    });
  });

  it('fails invalid geojson payloads with a typed error', () => {
    expect(() => exportToGeoJson({ type: 'Table' })).toThrow(
      DataValidationError
    );
  });

  it('does not overwrite an existing _source_dataset property in geojson exports', async () => {
    const dataset = createGeometryDataset({
      type: 'Point',
      coordinates: [2.3522, 48.8566]
    });
    dataset.rows[0]._source_dataset = 'user value';
    dataset.columns.push({
      name: '_source_dataset',
      type: 'string',
      nullable: false,
      unique: true
    });

    const blob = await exportProcessedDatasets([dataset], 'geojson');
    const geojson = JSON.parse(await blob.text()) as {
      features: Array<{ properties: Record<string, unknown> }>;
    };

    expect(geojson.features[0].properties._source_dataset).toBe('user value');
    expect(geojson.features[0].properties._source_dataset_2).toBe('Tiny geo');
  });
});
