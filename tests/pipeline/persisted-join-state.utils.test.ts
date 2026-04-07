import { describe, expect, it } from 'vitest';
import { resolvePersistedJoinState } from '$lib/features/commons/utils/persisted-join-state.utils';
import { DuckDBSimplifiedType } from '$lib/features/duckdb/types';

describe('resolvePersistedJoinState', () => {
  it('persists OSM GPS selections before finalizeJoin updates the runtime dataset', () => {
    const result = resolvePersistedJoinState({
      file: {
        geoColumn: 'nom_de_linstallation'
      },
      duckDataset: {
        columns: [
          {
            name: 'lat',
            type: 'DOUBLE',
            type_simple: DuckDBSimplifiedType.NUMERIC
          },
          {
            name: 'long',
            type: 'DOUBLE',
            type_simple: DuckDBSimplifiedType.NUMERIC
          }
        ]
      },
      selectedBasemapId: 'osm_standard_123',
      linkedGeoColumn: 'nom_de_linstallation',
      isSelectedSourceFile: true
    });

    expect(result).toEqual({
      joinedBasemap: 'osm_standard_123',
      geoColumn: undefined,
      gpsMode: true,
      gpsColumns: {
        lat: 'lat',
        lon: 'long'
      }
    });
  });

  it('keeps explicit GPS runtime metadata as the source of truth', () => {
    const result = resolvePersistedJoinState({
      file: {
        geoColumn: 'entity'
      },
      duckDataset: {
        joinedBasemap: 'osm_carto_42',
        gpsMode: true,
        gpsColumns: {
          lat: 'latitude',
          lon: 'longitude'
        },
        columns: []
      },
      linkedGeoColumn: 'entity',
      isSelectedSourceFile: true
    });

    expect(result).toEqual({
      joinedBasemap: 'osm_carto_42',
      geoColumn: undefined,
      gpsMode: true,
      gpsColumns: {
        lat: 'latitude',
        lon: 'longitude'
      }
    });
  });

  it('rebuilds gps columns from geo detection when custom names are used', () => {
    const result = resolvePersistedJoinState({
      file: {
        geoColumn: 'entity'
      },
      duckDataset: {
        gpsMode: true,
        columns: [
          {
            name: 'Latitude_WGS84',
            type_simple: DuckDBSimplifiedType.NUMERIC
          },
          {
            name: 'Longitude_WGS84',
            type_simple: DuckDBSimplifiedType.NUMERIC
          }
        ],
        geoDetection: {
          hasGeoColumns: true,
          geoColumns: [
            {
              index: 0,
              columnName: 'Latitude_WGS84',
              type: 'latitude',
              confidence: 0.99
            },
            {
              index: 1,
              columnName: 'Longitude_WGS84',
              type: 'longitude',
              confidence: 0.98
            }
          ],
          warnings: []
        }
      },
      selectedBasemapId: 'osm_standard_123',
      linkedGeoColumn: 'entity',
      isSelectedSourceFile: true
    });

    expect(result).toEqual({
      joinedBasemap: 'osm_standard_123',
      geoColumn: undefined,
      gpsMode: true,
      gpsColumns: {
        lat: 'Latitude_WGS84',
        lon: 'Longitude_WGS84'
      }
    });
  });

  it('persists only the linked geo column before a textual join is finalized', () => {
    const result = resolvePersistedJoinState({
      file: {},
      selectedBasemapId: 'monde-countries-2024-medium',
      linkedGeoColumn: 'country_name',
      isSelectedSourceFile: true
    });

    expect(result).toEqual({
      geoColumn: 'country_name',
      gpsMode: undefined,
      gpsColumns: undefined
    });
  });

  it('keeps a finalized textual join when runtime metadata already contains it', () => {
    const result = resolvePersistedJoinState({
      file: {},
      duckDataset: {
        joinedBasemap: 'monde-countries-2024-medium',
        geoColumn: 'country_name',
        columns: []
      },
      selectedBasemapId: 'monde-countries-2024-medium',
      linkedGeoColumn: 'country_name',
      isSelectedSourceFile: true
    });

    expect(result).toEqual({
      joinedBasemap: 'monde-countries-2024-medium',
      geoColumn: 'country_name',
      gpsMode: undefined,
      gpsColumns: undefined
    });
  });
});
