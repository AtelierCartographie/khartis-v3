import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BasemapSource } from '$lib/features/commons/constants/ui.constants';

const mocks = vi.hoisted(() => ({
  registerMock: vi.fn(),
  notifyChangeMock: vi.fn()
}));

vi.mock('$lib/features/project-management/core/persistence-registry', () => ({
  SavePriority: {
    IMMEDIATE: 'immediate',
    DEBOUNCED: 'debounced'
  },
  persistenceRegistry: {
    register: mocks.registerMock,
    notifyChange: mocks.notifyChangeMock
  }
}));

import { dataTabActions, dataTabState } from './data-tab.store.svelte';

const dataTabPersistenceEntry = mocks.registerMock.mock.calls.find(
  ([entry]) => entry?.key === 'dataTab'
)?.[0] as
  | {
      serialize: () => unknown;
      deserialize: (data: unknown) => void;
    }
  | undefined;

describe('dataTab persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataTabActions.reset();
  });

  it('does not persist project-owned basemap selection in ui settings', () => {
    dataTabActions.setBasemapJoinState({
      selectedBasemap: 'osm-standard',
      basemapSource: BasemapSource.OSM,
      joinedEntities: 12,
      entitiesToVerify: 3,
      duplicateEntities: ['Paris'],
      unrecognizedEntities: ['Lyon'],
      joinMappings: [
        {
          dataValue: 'Marseille',
          basemapOptions: ['Marseille'],
          selectedMapping: 'Marseille'
        }
      ]
    });

    expect(dataTabPersistenceEntry?.serialize()).toEqual({
      dataControl: expect.any(Object),
      geolocation: expect.any(Object),
      basemapJoin: {
        joinedEntities: 12,
        entitiesToVerify: 3,
        duplicateEntities: ['Paris'],
        unrecognizedEntities: ['Lyon'],
        joinMappings: [
          {
            dataValue: 'Marseille',
            basemapOptions: ['Marseille'],
            selectedMapping: 'Marseille'
          }
        ]
      },
      enrichData: expect.any(Object),
      notifications: expect.any(Object)
    });
    expect(dataTabPersistenceEntry?.serialize()).not.toMatchObject({
      basemapJoin: {
        selectedBasemap: expect.anything(),
        basemapSource: expect.anything()
      }
    });
  });

  it('keeps backward compatibility with legacy basemap selection payloads', () => {
    dataTabPersistenceEntry?.deserialize({
      basemapJoin: {
        selectedBasemap: 'osm-standard',
        basemapSource: BasemapSource.OSM,
        joinedEntities: 7,
        entitiesToVerify: 1,
        duplicateEntities: [],
        unrecognizedEntities: ['Lyon'],
        joinMappings: []
      }
    });

    expect(dataTabState.basemapJoin.selectedBasemap).toBe('osm-standard');
    expect(dataTabState.basemapJoin.basemapSource).toBe(BasemapSource.OSM);
    expect(dataTabState.basemapJoin.joinedEntities).toBe(7);
    expect(dataTabState.basemapJoin.entitiesToVerify).toBe(1);
    expect(dataTabState.basemapJoin.unrecognizedEntities).toEqual(['Lyon']);
  });
});
