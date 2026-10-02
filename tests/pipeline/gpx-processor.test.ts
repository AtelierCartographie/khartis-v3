// @vitest-environment jsdom
// The GPX processor relies on the native DOMParser (browser global).
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/types/create-project.types';

import { gpxProcessor } from '$lib/features/data-pipeline/processors/strategies/gpx-processor';

function file(name: string, fileType: FileType): UploadedFile {
  return {
    id: 'f1',
    name,
    size: 100,
    type: '',
    fileType,
    status: 'complete',
    sourceType: 'file_upload',
    content: new ArrayBuffer(8)
  } as UploadedFile;
}

function ctx(tableName = 'tbl') {
  return {
    tableName,
    Duck: {
      register_files: vi.fn().mockResolvedValue(undefined),
      read_geofile: vi.fn().mockResolvedValue(tableName),
      analyse: vi.fn().mockResolvedValue([])
    },
    callbacks: {
      getRowCount: vi.fn().mockResolvedValue(5),
      createArrowTableWithMetadata: vi.fn()
    }
  };
}

describe('gpxProcessor', () => {
  it('does not double-decode XML entities in GPX properties', async () => {
    const c = ctx('tbl_gpx');
    const f = file('track.gpx', FileType.GPX);
    f.content =
      '<?xml version="1.0"?><gpx version="1.1"><wpt lat="48.8" lon="2.3"><name>&amp;lt;b&amp;gt;Station&amp;lt;/b&amp;gt;</name><desc>AT&amp;amp;T</desc></wpt></gpx>';

    await gpxProcessor.process(c as never, f);

    const registeredFile = c.Duck.register_files.mock.calls[0]?.[0]?.[0];
    expect(registeredFile).toBeInstanceOf(File);

    const geojson = JSON.parse(await registeredFile.text()) as {
      features: Array<{
        properties: Record<string, unknown>;
      }>;
    };

    expect(geojson.features[0].properties.name).toBe(
      '&lt;b&gt;Station&lt;/b&gt;'
    );
    expect(geojson.features[0].properties.desc).toBe('AT&amp;T');
  });

  it('parses single-quoted attributes and CDATA sections from the fixture', async () => {
    const fixturePath = path.resolve(
      __dirname,
      '../../tests-datasets/gpx/single-quoted-attributes.gpx'
    );
    const c = ctx('tbl_gpx_quotes');
    const f = file('single-quoted-attributes.gpx', FileType.GPX);
    f.content = await fs.readFile(fixturePath, 'utf8');

    await gpxProcessor.process(c as never, f);

    const registeredFile = c.Duck.register_files.mock.calls[0]?.[0]?.[0];
    const geojson = JSON.parse(await registeredFile.text()) as {
      features: Array<{
        geometry: { coordinates: [number, number] };
        properties: Record<string, unknown>;
      }>;
    };

    expect(geojson.features).toHaveLength(3);
    expect(geojson.features[0].geometry.coordinates).toEqual([2.3522, 48.8566]);
    expect(geojson.features[0].properties.name).toBe('Paris <centre>');
    expect(geojson.features[0].properties.desc).toBe(
      'Capitale & plus grande ville'
    );
    expect(geojson.features[2].properties.gpx_point_type).toBe('trkpt');
    expect(geojson.features[2].properties.ele).toBe('12');
  });

  it('rejects malformed XML with the GPX extraction error', async () => {
    const c = ctx('tbl_gpx_bad');
    const f = file('broken.gpx', FileType.GPX);
    f.content = '<?xml version="1.0"?><gpx><wpt lat="1" lon="2"></gpx>';

    await expect(gpxProcessor.process(c as never, f)).rejects.toMatchObject({
      name: 'ParseError',
      fileType: 'gpx'
    });
  });
});
