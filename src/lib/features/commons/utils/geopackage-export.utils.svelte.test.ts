import { describe, expect, it, vi } from 'vitest';
import { convertGeoPackageToGeoJsonFile } from '$lib/features/map/utils/geopackage-browser-fallback.utils';
import { logger } from '$lib/features/commons/utils/logger';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import {
  exportGeoPackage,
  exportGeoPackageLayers
} from './geopackage-export.utils';

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

describe('GeoPackage export utils', () => {
  it('creates a readable GeoPackage feature layer from WKB rows', async () => {
    const blob = await exportGeoPackage(
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

    const file = new File([blob], 'khartis_export.gpkg', {
      type: 'application/geopackage+sqlite3'
    });
    const geojsonFile = await convertGeoPackageToGeoJsonFile(file);
    const geojson = JSON.parse(await geojsonFile.text()) as {
      features: Array<{
        geometry: { type: string; coordinates: [number, number] };
        properties: Record<string, unknown>;
      }>;
    };

    expect(blob.size).toBeGreaterThan(0);
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].geometry.type).toBe('Point');
    expect(geojson.features[0].geometry.coordinates[0]).toBeCloseTo(2.3522);
    expect(geojson.features[0].geometry.coordinates[1]).toBeCloseTo(48.8566);
    expect(geojson.features[0].properties.name).toBe('Paris');
    expect(geojson.features[0].properties.value).toBe(42);
  });

  it('keeps user properties that collide with GeoPackage fid and geom columns', async () => {
    const blob = await exportGeoPackage(
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

    const file = new File([blob], 'reserved_columns.gpkg', {
      type: 'application/geopackage+sqlite3'
    });
    const geojsonFile = await convertGeoPackageToGeoJsonFile(file);
    const geojson = JSON.parse(await geojsonFile.text()) as {
      features: Array<{ properties: Record<string, unknown> }>;
    };

    expect(geojson.features[0].properties.fid_property).toBe(99);
    expect(geojson.features[0].properties.geom_property).toBe(
      'raw geometry label'
    );
    expect(geojson.features[0].properties.name).toBe('Reserved columns');
  });

  it('declares a generic geometry type when one layer contains mixed WKB types', async () => {
    const blob = await exportGeoPackage(
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

    const warn = vi.spyOn(logger, 'warn');
    try {
      const routeFile = await convertGeoPackageToGeoJsonFile(
        new File([blob], 'layers.gpkg', {
          type: 'application/geopackage+sqlite3'
        }),
        { preferredLayer: 'Routes' }
      );
      const routeGeojson = JSON.parse(await routeFile.text()) as {
        features: Array<{ geometry: { type: string } }>;
      };

      expect(routeGeojson.features[0].geometry.type).toBe('LineString');
      expect(warn).not.toHaveBeenCalledWith(
        'Failed to register GeoPackage projection definition',
        expect.anything(),
        expect.anything()
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('writes known non-WGS84 EPSG definitions as projection WKT', async () => {
    const blob = await exportGeoPackage(
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
