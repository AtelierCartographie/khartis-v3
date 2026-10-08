// @vitest-environment jsdom
// The GPX reader relies on the native DOMParser (browser global).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

const { duck } = vi.hoisted(() => ({
  duck: {
    register_files: vi.fn(),
    read_geofile: vi.fn()
  }
}));

vi.mock('$lib/features/duckdb', () => ({ Duck: duck }));

import { readGpxIntoTable } from '$lib/features/data-pipeline/processors/gpx-processor';

function gpxFile(name: string, content: string): File {
  return new File([content], name, { type: 'application/gpx+xml' });
}

async function registeredGeoJson() {
  const registered = duck.register_files.mock.calls[0]?.[0]?.[0] as File;
  expect(registered).toBeInstanceOf(File);
  return JSON.parse(await registered.text()) as {
    features: Array<{
      geometry: { coordinates: [number, number] };
      properties: Record<string, unknown>;
    }>;
  };
}

describe('readGpxIntoTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    duck.register_files.mockResolvedValue(undefined);
    duck.read_geofile.mockImplementation(
      async (_f: File, o: { tablename: string }) => o.tablename
    );
  });

  it('does not double-decode XML entities in GPX properties', async () => {
    await readGpxIntoTable(
      gpxFile(
        'track.gpx',
        '<?xml version="1.0"?><gpx version="1.1"><wpt lat="48.8" lon="2.3"><name>&amp;lt;b&amp;gt;Station&amp;lt;/b&amp;gt;</name><desc>AT&amp;amp;T</desc></wpt></gpx>'
      ),
      'tbl_gpx'
    );

    const geojson = await registeredGeoJson();

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
    const table = await readGpxIntoTable(
      gpxFile(
        'single-quoted-attributes.gpx',
        await fs.readFile(fixturePath, 'utf8')
      ),
      'tbl_gpx_quotes'
    );
    expect(table).toBe('tbl_gpx_quotes');

    const geojson = await registeredGeoJson();

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
    await expect(
      readGpxIntoTable(
        gpxFile(
          'broken.gpx',
          '<?xml version="1.0"?><gpx><wpt lat="1" lon="2"></gpx>'
        ),
        'tbl_gpx_bad'
      )
    ).rejects.toMatchObject({ name: 'ParseError', fileType: 'gpx' });
  });
});
