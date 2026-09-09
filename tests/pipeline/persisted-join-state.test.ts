import { describe, expect, it } from 'vitest';
import { resolvePersistedJoinState } from '$lib/features/commons/utils/persisted-join-state.utils';

const GPS_COLUMNS = [
  { name: 'lat', geo_type: 'latitude' },
  { name: 'long', geo_type: 'longitude' },
  { name: 'place_name' }
] as never;

const NAME_COLUMNS = [{ name: 'commune' }] as never;

describe('resolvePersistedJoinState', () => {
  it('keeps a coordinate dataset in GPS mode when a catalog basemap is its backdrop', () => {
    const state = resolvePersistedJoinState({
      file: { joinedBasemap: 'europe-nuts1-2024-medium' },
      duckDataset: {
        joinedBasemap: 'europe-nuts1-2024-medium',
        columns: GPS_COLUMNS,
        gpsMode: false
      },
      isSelectedSourceFile: true
    });

    expect(state.gpsMode).toBe(true);
    expect(state.gpsColumns).toEqual({ lat: 'lat', lon: 'long' });
    expect(state.geoColumn).toBeUndefined();
  });

  it('leaves a textual join untouched even when the dataset also carries coordinates', () => {
    const state = resolvePersistedJoinState({
      file: {
        joinedBasemap: 'france-commune-2025-medium',
        geoColumn: 'place_name'
      },
      duckDataset: {
        joinedBasemap: 'france-commune-2025-medium',
        geoColumn: 'place_name',
        columns: GPS_COLUMNS
      },
      isSelectedSourceFile: true
    });

    expect(state.gpsMode).toBeFalsy();
    expect(state.geoColumn).toBe('place_name');
  });

  it('does not invent a GPS mode for a dataset without coordinates', () => {
    const state = resolvePersistedJoinState({
      file: { joinedBasemap: 'france-commune-2025-medium' },
      duckDataset: {
        joinedBasemap: 'france-commune-2025-medium',
        columns: NAME_COLUMNS
      },
      linkedGeoColumn: 'commune',
      isSelectedSourceFile: true
    });

    expect(state.gpsMode).toBeFalsy();
    expect(state.geoColumn).toBe('commune');
  });

  it('does not switch a coordinate dataset to GPS mode before a basemap is picked', () => {
    const state = resolvePersistedJoinState({
      file: {},
      duckDataset: { columns: GPS_COLUMNS },
      isSelectedSourceFile: true
    });

    expect(state.gpsMode).toBeFalsy();
    expect(state.joinedBasemap).toBeUndefined();
  });
});
