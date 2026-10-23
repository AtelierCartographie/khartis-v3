// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import {
  exportGeoPackageLayers,
  type GeoPackageExportOptions,
  type GeoPackageFeatureRow
} from './geopackage-export.utils';

function exportSingleLayer(
  features: GeoPackageFeatureRow[],
  options: GeoPackageExportOptions
): Promise<Blob> {
  return exportGeoPackageLayers([{ ...options, features }]);
}

function createPointWkb(x: number, y: number): Uint8Array {
  const wkb = new Uint8Array(21);
  const dataView = new DataView(wkb.buffer);
  wkb[0] = 1;
  dataView.setUint32(1, 1, true);
  dataView.setFloat64(5, x, true);
  dataView.setFloat64(13, y, true);
  return wkb;
}

function createLineStringWkb(points: Array<[number, number]>): Uint8Array {
  const wkb = new Uint8Array(9 + points.length * 16);
  const dataView = new DataView(wkb.buffer);
  wkb[0] = 1;
  dataView.setUint32(1, 2, true);
  dataView.setUint32(5, points.length, true);
  points.forEach(([x, y], index) => {
    const offset = 9 + index * 16;
    dataView.setFloat64(offset, x, true);
    dataView.setFloat64(offset + 8, y, true);
  });
  return wkb;
}

async function selectGeoPackageRows<T extends Record<string, unknown>>(
  blob: Blob,
  query: string
): Promise<T[]> {
  const sqlite3 = await sqlite3InitModule();
  const fileBytes = new Uint8Array(await blob.arrayBuffer());
  const tempPath = `/tmp/${crypto.randomUUID()}-khartis-export-test.gpkg`;
  sqlite3.capi.sqlite3_js_posix_create_file(tempPath, fileBytes);
  const db = new sqlite3.oo1.DB(tempPath, 'r');

  try {
    return db.selectObjects(query) as T[];
  } finally {
    db.close();
  }
}

// Point coordinates sit after the 8-byte GeoPackage header, its envelope and
// the 5-byte WKB prefix.
function readGeoPackagePoint(geometry: Uint8Array): [number, number] {
  const envelopeBytes = [0, 32, 48, 48, 64][(geometry[3] >> 1) & 7];
  const view = new DataView(
    geometry.buffer,
    geometry.byteOffset + 8 + envelopeBytes + 5
  );
  return [view.getFloat64(0, true), view.getFloat64(8, true)];
}

describe('GeoPackage export utils', () => {
  it('creates a readable GeoPackage feature layer from WKB rows', async () => {
    const blob = await exportSingleLayer(
      [
        {
          properties: {
            name: 'Paris',
            value: 42
          },
          wkb: createPointWkb(2.3522, 48.8566)
        }
      ],
      {
        layerName: 'khartis_export',
        sourceCrs: 'EPSG:4326'
      }
    );

    const rows = await selectGeoPackageRows<{
      name: string;
      value: number;
      geom: Uint8Array;
    }>(blob, 'SELECT name, value, geom FROM khartis_export');

    expect(blob.size).toBeGreaterThan(0);
    expect(rows).toHaveLength(1);
    const [x, y] = readGeoPackagePoint(rows[0].geom);
    expect(x).toBeCloseTo(2.3522);
    expect(y).toBeCloseTo(48.8566);
    expect(rows[0].name).toBe('Paris');
    expect(rows[0].value).toBe(42);
  });

  it('keeps safe DuckDB bigint properties as GeoPackage integers', async () => {
    const blob = await exportSingleLayer(
      [
        {
          properties: {
            population: 12_300_000n,
            oversized: BigInt(Number.MAX_SAFE_INTEGER) + 1n
          },
          wkb: createPointWkb(2.3522, 48.8566)
        }
      ],
      {
        layerName: 'bigint_properties',
        sourceCrs: 'EPSG:4326'
      }
    );

    const columns = await selectGeoPackageRows<{
      name: string;
      type: string;
    }>(blob, `PRAGMA table_info('bigint_properties')`);
    const row = await selectGeoPackageRows<{
      population: number;
      population_type: string;
      oversized: string;
      oversized_type: string;
    }>(
      blob,
      `SELECT population,
              typeof(population) AS population_type,
              oversized,
              typeof(oversized) AS oversized_type
       FROM bigint_properties`
    );

    expect(columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'population', type: 'INTEGER' }),
        expect.objectContaining({ name: 'oversized', type: 'TEXT' })
      ])
    );
    expect(row).toEqual([
      {
        population: 12_300_000,
        population_type: 'integer',
        oversized: '9007199254740992',
        oversized_type: 'text'
      }
    ]);
  });

  it('keeps user properties that collide with GeoPackage fid and geom columns', async () => {
    const blob = await exportSingleLayer(
      [
        {
          properties: {
            fid: 99,
            geom: 'raw geometry label',
            name: 'Reserved columns'
          },
          wkb: createPointWkb(2, 48)
        }
      ],
      {
        layerName: 'reserved_columns',
        sourceCrs: 'EPSG:4326'
      }
    );

    const rows = await selectGeoPackageRows<Record<string, unknown>>(
      blob,
      'SELECT fid_property, geom_property, name FROM reserved_columns'
    );

    expect(rows[0].fid_property).toBe(99);
    expect(rows[0].geom_property).toBe('raw geometry label');
    expect(rows[0].name).toBe('Reserved columns');
  });

  it('declares a generic geometry type when one layer contains mixed WKB types', async () => {
    const blob = await exportSingleLayer(
      [
        {
          properties: { name: 'Point' },
          wkb: createPointWkb(2, 48)
        },
        {
          properties: { name: 'Line' },
          wkb: createLineStringWkb([
            [2, 48],
            [3, 49]
          ])
        }
      ],
      {
        layerName: 'mixed_geometry',
        sourceCrs: 'EPSG:4326'
      }
    );

    const rows = await selectGeoPackageRows<{
      geometry_type_name: string;
    }>(blob, 'SELECT geometry_type_name FROM gpkg_geometry_columns');

    expect(rows).toEqual([{ geometry_type_name: 'GEOMETRY' }]);
  });

  it('exports multiple feature layers instead of mixing source datasets in one table', async () => {
    const blob = await exportGeoPackageLayers([
      {
        layerName: 'Cities',
        sourceCrs: 'EPSG:4326',
        features: [
          {
            properties: { name: 'Paris' },
            wkb: createPointWkb(2.3522, 48.8566)
          }
        ]
      },
      {
        layerName: 'Routes',
        sourceCrs: null,
        features: [
          {
            properties: { name: 'Segment' },
            wkb: createLineStringWkb([
              [2, 48],
              [3, 49]
            ])
          }
        ]
      }
    ]);

    const rows = await selectGeoPackageRows<{
      table_name: string;
      geometry_type_name: string;
      srs_id: number;
    }>(
      blob,
      `SELECT table_name, geometry_type_name, srs_id
       FROM gpkg_geometry_columns
       ORDER BY table_name`
    );

    expect(rows).toEqual([
      { table_name: 'Cities', geometry_type_name: 'POINT', srs_id: 4326 },
      { table_name: 'Routes', geometry_type_name: 'LINESTRING', srs_id: -1 }
    ]);
  });

  it('writes known non-WGS84 EPSG definitions as projection WKT', async () => {
    const blob = await exportSingleLayer(
      [
        {
          properties: { name: 'Lambert point' },
          wkb: createPointWkb(700000, 6600000)
        }
      ],
      {
        layerName: 'lambert',
        sourceCrs: 'EPSG:2154'
      }
    );

    const rows = await selectGeoPackageRows<{
      definition: string;
      organization: string;
      organization_coordsys_id: number;
    }>(
      blob,
      `SELECT definition, organization, organization_coordsys_id
       FROM gpkg_spatial_ref_sys
       WHERE srs_id = 2154`
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].organization).toBe('EPSG');
    expect(rows[0].organization_coordsys_id).toBe(2154);
    expect(rows[0].definition).toContain('Lambert_Conformal_Conic_2SP');
  });
});
