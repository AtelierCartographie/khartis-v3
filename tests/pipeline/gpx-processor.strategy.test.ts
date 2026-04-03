import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/store/create-project.types';

import { gpxProcessor } from '$lib/features/data-pipeline/processors/strategies/gpx-processor';

function file(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    id: 'f1',
    name: 'stops.gpx',
    size: 10,
    type: 'application/gpx+xml',
    fileType: FileType.GPX,
    status: 'complete',
    sourceType: 'file_upload',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1" xmlns:ods="https://help.huwise.com/">
  <wpt lat="48.11" lon="-1.67">
    <name>Stop A</name>
    <extension>
      <ods:id>1226</ods:id>
      <ods:nomcommune>Rennes</ods:nomcommune>
    </extension>
  </wpt>
  <wpt lat="48.12" lon="-1.68">
    <name>Stop B</name>
  </wpt>
</gpx>`,
    ...overrides
  } as UploadedFile;
}

function ctx() {
  return {
    tableName: 'tbl_gpx',
    Duck: {
      register_files: vi.fn().mockResolvedValue(undefined),
      read_geofile: vi.fn().mockResolvedValue('tbl_gpx_actual'),
      analyse: vi.fn().mockResolvedValue([])
    },
    callbacks: {
      getRowCount: vi.fn().mockResolvedValue(2),
      createArrowTableWithMetadata: vi.fn().mockResolvedValue({
        arrowTableWithMetadata: { rows: 2 },
        geoArrowMetadata: { version: '1.1.0' }
      })
    }
  };
}

describe('gpxProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches gpx files', () => {
    expect(gpxProcessor.canHandle(file())).toBe(true);
    expect(
      gpxProcessor.canHandle(file({ fileType: FileType.CSV, name: 'x.csv' }))
    ).toBe(false);
  });

  it('converts GPX waypoints to GeoJSON before DuckDB ingestion', async () => {
    const c = ctx();
    const result = await gpxProcessor.process(c as never, file());

    expect(c.Duck.register_files).toHaveBeenCalledTimes(1);
    expect(c.Duck.read_geofile).toHaveBeenCalledTimes(1);

    const registeredGeojson = c.Duck.register_files.mock.calls[0]?.[0]?.[0] as
      | File
      | undefined;
    if (!registeredGeojson) {
      throw new Error(
        'Expected register_files to receive a generated GeoJSON file'
      );
    }
    expect(registeredGeojson.name).toBe('stops.geojson');

    const parsedGeojson = JSON.parse(await registeredGeojson.text()) as {
      type: string;
      features: Array<{
        geometry: { type: string; coordinates: [number, number] };
        properties: Record<string, string>;
      }>;
    };

    expect(parsedGeojson.type).toBe('FeatureCollection');
    expect(parsedGeojson.features).toHaveLength(2);
    expect(parsedGeojson.features[0]?.geometry).toEqual({
      type: 'Point',
      coordinates: [-1.67, 48.11]
    });
    expect(parsedGeojson.features[0]?.properties).toMatchObject({
      name: 'Stop A',
      id: '1226',
      nomcommune: 'Rennes',
      gpx_point_type: 'wpt'
    });

    expect(result.tableName).toBe('tbl_gpx_actual');
    expect(result.rowCount).toBe(2);
  });
});
