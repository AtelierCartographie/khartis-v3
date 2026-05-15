import { describe, expect, it } from 'vitest';
import { convertGeoPackageToGeoJsonFile } from '$lib/features/map/utils/geopackage-browser-fallback.utils';
import { exportGeoPackage } from './geopackage-export.utils';

function createPointWkb(x: number, y: number): Uint8Array {
  const wkb = new Uint8Array(21);
  const dataView = new DataView(wkb.buffer);
  wkb[0] = 1;
  dataView.setUint32(1, 1, true);
  dataView.setFloat64(5, x, true);
  dataView.setFloat64(13, y, true);
  return wkb;
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
});
