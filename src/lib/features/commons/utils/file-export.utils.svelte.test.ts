import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadFile,
  exportProcessedDatasets,
  exportToGeoJson
} from './file-export.utils';
import type { ProcessedDataset } from '$lib/features/data-pipeline';
import { DataValidationError } from '$lib/features/commons/pipeline.errors';

function createGeometryDataset(
  geometryValue: Record<string, unknown> | string,
  options: { includeGeometryMeta?: boolean; includeGeoDetection?: boolean } = {}
): ProcessedDataset {
  const geoColumns = options.includeGeoDetection
    ? [
        {
          index: 4,
          columnName: 'geom',
          type: 'coordinates' as const,
          confidence: 1
        }
      ]
    : [];
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
      geoColumns,
      hasGeoData: true,
      suggestedGeoColumn: options.includeGeoDetection ? 'geom' : undefined,
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

function stubBlobUrlApi(): {
  createObjectURL: ReturnType<typeof vi.fn>;
  revokeObjectURL: ReturnType<typeof vi.fn>;
  restore: () => void;
} {
  const createDescriptor = Object.getOwnPropertyDescriptor(
    URL,
    'createObjectURL'
  );
  const revokeDescriptor = Object.getOwnPropertyDescriptor(
    URL,
    'revokeObjectURL'
  );
  const createObjectURL = vi.fn(() => 'blob:khartis-export');
  const revokeObjectURL = vi.fn();

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: createObjectURL
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: revokeObjectURL
  });

  return {
    createObjectURL,
    revokeObjectURL,
    restore: () => {
      if (createDescriptor) {
        Object.defineProperty(URL, 'createObjectURL', createDescriptor);
      } else {
        Reflect.deleteProperty(URL, 'createObjectURL');
      }

      if (revokeDescriptor) {
        Object.defineProperty(URL, 'revokeObjectURL', revokeDescriptor);
      } else {
        Reflect.deleteProperty(URL, 'revokeObjectURL');
      }
    }
  };
}

describe('file export utils', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps generated blob URLs alive until the browser has handled the download', () => {
    vi.useFakeTimers();
    const { createObjectURL, revokeObjectURL, restore } = stubBlobUrlApi();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    try {
      downloadFile(new Blob(['map']), 'map.jpg');

      const anchor = document.querySelector(
        'a[download="map.jpg"]'
      ) as HTMLAnchorElement | null;
      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledOnce();
      expect(anchor?.getAttribute('href')).toBe('blob:khartis-export');
      expect(anchor?.style.display).toBe('none');
      expect(revokeObjectURL).not.toHaveBeenCalled();

      vi.advanceTimersByTime(29999);
      expect(document.querySelector('a[download="map.jpg"]')).not.toBeNull();
      expect(revokeObjectURL).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(document.querySelector('a[download="map.jpg"]')).toBeNull();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:khartis-export');
    } finally {
      restore();
    }
  });

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

  it('fails csv exports with a clear error when no tabular column remains', async () => {
    const dataset = createGeometryDataset({
      type: 'Point',
      coordinates: [2.3522, 48.8566]
    });
    dataset.columns = dataset.columns.filter(
      (column) => column.name === 'geom'
    );
    dataset.data = dataset.data.map((row) => ({ geom: row.geom }));

    const request = exportProcessedDatasets([dataset], 'csv');

    await expect(request).rejects.toMatchObject({
      name: 'DataValidationError',
      code: 'DATA_VALIDATION_ERROR',
      field: 'columns',
      details: {
        datasetId: 'dataset-1',
        field: 'columns',
        format: 'csv'
      }
    });
    await expect(request).rejects.toBeInstanceOf(DataValidationError);
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
      { includeGeometryMeta: false, includeGeoDetection: true }
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

  it('does not overwrite an existing _source_dataset property in geojson exports', async () => {
    const dataset = createGeometryDataset({
      type: 'Point',
      coordinates: [2.3522, 48.8566]
    });
    dataset.data[0]._source_dataset = 'user value';
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

  it('keeps text columns named location when GPS columns provide geometry', async () => {
    const dataset: ProcessedDataset = {
      id: 'dataset-gps',
      name: 'GPS places',
      format: 'csv',
      data: [
        {
          location: 'Central office',
          lat: 48.8566,
          lon: 2.3522
        }
      ],
      rowCount: 1,
      columns: [
        { name: 'location', type: 'string', nullable: false, unique: true },
        { name: 'lat', type: 'number', nullable: false, unique: true },
        { name: 'lon', type: 'number', nullable: false, unique: true }
      ],
      analysis: {
        columns: [],
        geoColumns: [
          {
            index: 1,
            columnName: 'lat',
            type: 'latitude',
            confidence: 1
          },
          {
            index: 2,
            columnName: 'lon',
            type: 'longitude',
            confidence: 1
          }
        ],
        hasGeoData: true,
        suggestedGeoColumn: 'lat',
        rowCount: 1,
        warnings: []
      },
      geometry: undefined,
      duckdbTableName: undefined,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      fileSize: 123,
      metadata: {
        processedAt: new Date('2026-01-01T00:00:00Z'),
        transformations: []
      }
    };

    const blob = await exportProcessedDatasets([dataset], 'csv');
    const text = await blob.text();

    expect(text).toContain('location,lat,lon');
    expect(text).toContain('Central office,48.8566,2.3522');
  });
});
