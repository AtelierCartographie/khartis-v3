import { describe, expect, it } from 'vitest';
import { exportProcessedDatasets } from './file-export.utils';
import type { ProcessedDataset } from '$lib/features/data-pipeline';

function createGeometryDataset(
  geometryValue: Record<string, unknown> | string,
  options: { includeGeometryMeta?: boolean } = {}
): ProcessedDataset {
  return {
    id: 'dataset-1',
    name: 'Tiny geo',
    format: 'geojson',
    data: [
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
    geometry: options.includeGeometryMeta === false ? undefined : 'Polygon',
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
  it('excludes recognized geometry columns from plain csv exports', async () => {
    const dataset = createGeometryDataset({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0]
        ]
      ]
    });

    const blob = await exportProcessedDatasets([dataset], 'csv');
    const text = await blob.text();

    expect(text).toContain('OGC_FID,id,name,value,__id');
    expect(text).not.toContain('geom');
    expect(text).not.toContain('geometry_wkt');
  });

  it('exports geometry to geometry_wkt for csv-geo exports', async () => {
    const dataset = createGeometryDataset(
      {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0]
          ]
        ]
      },
      { includeGeometryMeta: false }
    );

    const blob = await exportProcessedDatasets([dataset], 'csv-geo');
    const text = await blob.text();

    expect(text).toContain('geometry_wkt');
    expect(text).toContain('POLYGON ((0 0, 1 0, 1 1, 0 1, 0 0))');
  });

  it('builds valid geojson exports from recognized geometry columns', async () => {
    const dataset = createGeometryDataset(
      JSON.stringify({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0]
          ]
        ]
      }),
      { includeGeometryMeta: false }
    );

    const blob = await exportProcessedDatasets([dataset], 'geojson');
    const text = await blob.text();
    const geojson = JSON.parse(text) as {
      type: string;
      features: Array<{
        geometry: { type: string; coordinates: unknown[] };
        properties: Record<string, unknown>;
      }>;
    };

    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].geometry.type).toBe('Polygon');
    expect(geojson.features[0].properties).not.toHaveProperty('geom');
    expect(geojson.features[0].properties.name).toBe('Alpha');
  });
});
