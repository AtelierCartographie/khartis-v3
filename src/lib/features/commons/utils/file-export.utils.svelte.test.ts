import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadFile, exportProcessedDatasets } from './file-export.utils';
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
