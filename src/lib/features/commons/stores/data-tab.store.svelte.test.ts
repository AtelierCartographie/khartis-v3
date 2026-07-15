import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BasemapSource,
  GeoreferenceType,
  TableViewType
} from '$lib/features/commons/constants/ui.constants';

const mocks = vi.hoisted(() => ({
  registerMock: vi.fn(),
  notifyChangeMock: vi.fn()
}));

vi.mock('$lib/features/project-management/core', () => ({
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

  it('persists join counters and capped lists without project-owned basemap selection', () => {
    dataTabActions.setBasemapJoinState({
      selectedBasemap: 'osm-standard',
      basemapSource: BasemapSource.OSM,
      joinedEntities: 12,
      entitiesToVerify: 3,
      duplicateEntities: ['Paris'],
      duplicateTotal: 1,
      unrecognizedEntities: ['Lyon'],
      unrecognizedTotal: 1,
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
        duplicateEntities: ['Paris'],
        duplicateTotal: 1,
        unrecognizedEntities: ['Lyon'],
        unrecognizedTotal: 1,
        ignoredEntities: [],
        joinMappings: [
          {
            dataValue: 'Marseille',
            basemapOptions: ['Marseille'],
            selectedMapping: 'Marseille'
          }
        ]
      },
      enrichData: expect.any(Object),
      uiPanels: expect.any(Object),
      notifications: expect.any(Object)
    });
    expect(dataTabPersistenceEntry?.serialize()).not.toMatchObject({
      basemapJoin: {
        selectedBasemap: expect.anything(),
        basemapSource: expect.anything(),
        entitiesToVerify: expect.anything(),
        joinedEntitiesList: expect.anything(),
        duplicateLines: expect.anything()
      }
    });
  });

  it('restores counters from the persisted shape and recomputes to-verify from mappings', () => {
    dataTabPersistenceEntry?.deserialize({
      basemapJoin: {
        joinedEntities: 30848,
        duplicateEntities: ['Doublon'],
        duplicateTotal: 1556,
        unrecognizedEntities: ['Inconnue'],
        unrecognizedTotal: 140,
        entitiesToVerify: 42,
        joinMappings: [
          {
            dataValue: 'Marseille',
            basemapOptions: ['Marseille'],
            selectedMapping: 'Marseille'
          }
        ]
      }
    });

    expect(dataTabState.basemapJoin.joinedEntities).toBe(30848);
    expect(dataTabState.basemapJoin.duplicateTotal).toBe(1556);
    expect(dataTabState.basemapJoin.unrecognizedTotal).toBe(140);
    expect(dataTabState.basemapJoin.entitiesToVerify).toBe(1);
  });

  it('preserves candidate details when restoring persisted join mappings', () => {
    dataTabActions.setBasemapJoinState({
      joinMappings: [
        {
          dataValue: 'Frnace',
          basemapOptions: ['France'],
          selectedMapping: 'France',
          candidates: [
            {
              id: 'FRA',
              name: 'France',
              score: 0.96,
              type: 'partial',
              variant: 'name_engl'
            }
          ]
        }
      ]
    });

    const serialized = dataTabPersistenceEntry?.serialize();
    dataTabActions.reset();
    dataTabPersistenceEntry?.deserialize(serialized);

    expect(dataTabState.basemapJoin.joinMappings[0]?.candidates).toEqual([
      {
        id: 'FRA',
        name: 'France',
        score: 0.96,
        type: 'partial',
        variant: 'name_engl'
      }
    ]);
  });

  it('keeps backward compatibility with legacy basemap selection payloads', () => {
    dataTabPersistenceEntry?.deserialize({
      basemapJoin: {
        selectedBasemap: 'osm-standard',
        basemapSource: BasemapSource.OSM
      }
    });

    expect(dataTabState.basemapJoin.selectedBasemap).toBe('osm-standard');
    expect(dataTabState.basemapJoin.basemapSource).toBe(BasemapSource.OSM);
    expect(dataTabState.basemapJoin.joinedEntities).toBe(0);
    expect(dataTabState.basemapJoin.entitiesToVerify).toBe(0);
    expect(dataTabState.basemapJoin.duplicateEntities).toEqual([]);
    expect(dataTabState.basemapJoin.duplicateTotal).toBe(0);
    expect(dataTabState.basemapJoin.unrecognizedEntities).toEqual([]);
    expect(dataTabState.basemapJoin.unrecognizedTotal).toBe(0);
    expect(dataTabState.basemapJoin.ignoredEntities).toEqual([]);
    expect(dataTabState.basemapJoin.joinMappings).toEqual([]);
    expect(() => dataTabActions.clearJoinStats()).not.toThrow();
  });

  it('restores persisted data tab state through a whitelist of valid values', () => {
    dataTabPersistenceEntry?.deserialize({
      dataControl: {
        expandedRowIds: ['row-1', 2, { id: 'bad' }],
        searchQuery: 'Paris',
        filterActive: 'yes',
        tableView: 'grid',
        showSummaryPlots: false,
        sortColumn: 42,
        sortOrder: 'DOWN'
      },
      geolocation: {
        geoReference: GeoreferenceType.COORDINATES,
        linkedVariable: 3,
        linkedVariableName: 'Latitude',
        latitudeColumn: 'Latitude',
        longitudeColumn: 42,
        autoDetected: false
      },
      basemapJoin: {
        duplicateEntities: ['Paris', 12],
        unrecognizedEntities: 'Lyon',
        ignoredEntities: [
          {
            dataValue: 'Marseille',
            basemapValue: 'Marseille',
            source: 'joined',
            lines: [1, '2']
          },
          {
            dataValue: 'Bordeaux',
            source: 'unknown'
          }
        ],
        joinMappings: [
          {
            dataValue: 'Nice',
            basemapOptions: ['Nice', 6],
            selectedMapping: 'Nice'
          },
          {
            dataValue: 'Toulouse',
            basemapOptions: ['Toulouse']
          }
        ],
        selectedBasemap: 'osm-standard',
        basemapSource: 'invalid-source'
      },
      enrichData: {
        enrichmentDatasetId: 'enrichment-1',
        isEnrichmentActive: 'yes',
        joinTabularEnabled: true,
        overlayBasemapEnabled: false,
        basemapTabIndex: 4,
        preferredOverlayBasemapId: 'osm-standard',
        preferredOverlayBasemapSource: BasemapSource.OSM
      },
      uiPanels: {
        enrichJoinTabularOpen: true,
        enrichOverlayBasemapOpen: 'true',
        enrichBasemapSuggestionsOpen: false
      },
      notifications: {
        variableTypes: true,
        warnings: 'yes'
      }
    });

    expect(dataTabState.dataControl).toMatchObject({
      expandedRowIds: ['row-1', 2],
      searchQuery: 'Paris',
      filterActive: false,
      tableView: TableViewType.COMPACT,
      showSummaryPlots: false,
      sortColumn: null,
      sortOrder: null
    });
    expect(dataTabState.geolocation).toMatchObject({
      geoReference: GeoreferenceType.COORDINATES,
      linkedVariable: 3,
      linkedVariableName: 'Latitude',
      latitudeColumn: 'Latitude',
      autoDetected: false
    });
    expect(dataTabState.geolocation.longitudeColumn).toBeUndefined();
    expect(dataTabState.basemapJoin).toMatchObject({
      selectedBasemap: 'osm-standard',
      basemapSource: BasemapSource.CATALOG,
      duplicateEntities: ['Paris'],
      duplicateTotal: 1,
      unrecognizedEntities: [],
      unrecognizedTotal: 0,
      joinedEntities: 0,
      entitiesToVerify: 1,
      ignoredEntities: [
        {
          dataValue: 'Marseille',
          basemapValue: 'Marseille',
          source: 'joined',
          lines: [1]
        }
      ],
      joinMappings: [
        {
          dataValue: 'Nice',
          basemapOptions: ['Nice'],
          selectedMapping: 'Nice'
        }
      ]
    });
    expect(dataTabState.enrichData).toMatchObject({
      enrichmentDatasetId: 'enrichment-1',
      isEnrichmentActive: false,
      joinTabularEnabled: true,
      overlayBasemapEnabled: false,
      basemapTabIndex: 0,
      preferredOverlayBasemapId: 'osm-standard',
      preferredOverlayBasemapSource: BasemapSource.OSM
    });
    expect(dataTabState.uiPanels).toMatchObject({
      enrichJoinTabularOpen: true,
      enrichOverlayBasemapOpen: false,
      enrichBasemapSuggestionsOpen: false
    });
    expect(dataTabState.uiPanels.enrichBasemapCatalogOpen).toBeUndefined();
    expect(dataTabState.notifications).toEqual({
      variableTypes: true,
      warnings: false
    });
  });

  it('keeps ignore/restore/promote counters aligned with the visible buckets', () => {
    dataTabActions.setJoinStats({
      joinedCount: 10,
      toVerifyCount: 1,
      duplicateCount: 0,
      unrecognizedCount: 2,
      totalEntities: 13,
      joinMappings: [
        {
          dataValue: 'Frnace',
          basemapOptions: ['France'],
          selectedMapping: 'France',
          candidates: [
            {
              id: 'FRA',
              name: 'France',
              score: 0.96,
              type: 'partial',
              variant: 'name_engl'
            }
          ]
        }
      ],
      duplicateEntities: [],
      unrecognizedEntities: ['Atlantis', 'Mordor'],
      duplicateLines: []
    });

    dataTabActions.ignoreEntity({
      dataValue: 'Paris',
      basemapValue: 'Paris',
      source: 'joined'
    });
    expect(dataTabState.basemapJoin.joinedEntities).toBe(9);

    dataTabActions.ignoreEntity({
      dataValue: 'Atlantis',
      source: 'unrecognized'
    });
    expect(dataTabState.basemapJoin.unrecognizedTotal).toBe(1);
    expect(dataTabState.basemapJoin.unrecognizedEntities).toEqual(['Mordor']);

    dataTabActions.restoreEntity('Atlantis');
    expect(dataTabState.basemapJoin.unrecognizedTotal).toBe(2);
    expect(dataTabState.basemapJoin.unrecognizedEntities).toContain('Atlantis');

    dataTabActions.promoteToJoined('Frnace');
    expect(dataTabState.basemapJoin.joinedEntities).toBe(10);
    expect(dataTabState.basemapJoin.entitiesToVerify).toBe(0);
    expect(dataTabState.basemapJoin.joinMappings).toEqual([]);
  });

  it('clears duplicate join line references when no other join stats remain', () => {
    dataTabActions.setBasemapJoinState({
      duplicateLines: [{ dataValue: 'Paris', lines: [2, 8] }]
    });
    mocks.notifyChangeMock.mockClear();

    dataTabActions.clearJoinStats();

    expect(dataTabState.basemapJoin.duplicateLines).toEqual([]);
    expect(mocks.notifyChangeMock).toHaveBeenCalledWith('dataTab', 'debounced');
  });

  it('debounces auto-join setter saves but keeps manual corrections immediate', () => {
    mocks.notifyChangeMock.mockClear();
    dataTabActions.setBasemapJoinState({ selectedBasemap: 'b1' });
    dataTabActions.selectBasemap('b2');
    expect(mocks.notifyChangeMock).toHaveBeenCalledTimes(2);
    expect(
      mocks.notifyChangeMock.mock.calls.every(
        ([, priority]) => priority === 'debounced'
      )
    ).toBe(true);

    mocks.notifyChangeMock.mockClear();
    dataTabActions.setBasemapJoinState({
      joinMappings: [
        {
          dataValue: 'Nice',
          basemapOptions: ['Nice', 'Nizza'],
          selectedMapping: 'Nice'
        }
      ]
    });
    mocks.notifyChangeMock.mockClear();
    dataTabActions.updateJoinMapping(0, 'Nizza');
    expect(mocks.notifyChangeMock).toHaveBeenCalledWith('dataTab', 'immediate');

    mocks.notifyChangeMock.mockClear();
    dataTabActions.ignoreEntity({ dataValue: 'Nice', source: 'to_verify' });
    expect(mocks.notifyChangeMock).toHaveBeenCalledWith('dataTab', 'immediate');

    mocks.notifyChangeMock.mockClear();
    dataTabActions.restoreEntity('Nice');
    expect(mocks.notifyChangeMock).toHaveBeenCalledWith('dataTab', 'immediate');
  });

  it('resets state without notifying persistence by default', () => {
    dataTabActions.setSearch('Paris');
    mocks.notifyChangeMock.mockClear();

    dataTabActions.reset();

    expect(dataTabState.dataControl.searchQuery).toBe('');
    expect(mocks.notifyChangeMock).not.toHaveBeenCalled();
  });

  it('notifies persistence when reset is part of a user flow', () => {
    dataTabActions.setSearch('Paris');
    mocks.notifyChangeMock.mockClear();

    dataTabActions.reset({ notify: true });

    expect(dataTabState.dataControl.searchQuery).toBe('');
    expect(mocks.notifyChangeMock).toHaveBeenCalledWith('dataTab', 'immediate');
  });

  it('persists Data Tab panel state separately from feature state', () => {
    dataTabActions.setEnrichDataState({
      joinTabularEnabled: true,
      overlayBasemapEnabled: true,
      preferredOverlayBasemapId: 'nuts2.geojson',
      preferredOverlayBasemapSource: BasemapSource.CATALOG
    });
    dataTabActions.setUiPanelsState({
      enrichJoinTabularOpen: false,
      enrichOverlayBasemapOpen: true,
      enrichBasemapSuggestionsOpen: false,
      enrichBasemapCatalogOpen: true
    });

    expect(dataTabPersistenceEntry?.serialize()).toMatchObject({
      enrichData: {
        joinTabularEnabled: true,
        overlayBasemapEnabled: true,
        preferredOverlayBasemapId: 'nuts2.geojson',
        preferredOverlayBasemapSource: BasemapSource.CATALOG
      },
      uiPanels: {
        enrichJoinTabularOpen: false,
        enrichOverlayBasemapOpen: true,
        enrichBasemapSuggestionsOpen: false,
        enrichBasemapCatalogOpen: true
      }
    });
  });

  it('restores new panel state with safe defaults for legacy projects', () => {
    dataTabPersistenceEntry?.deserialize({
      enrichData: {
        joinTabularEnabled: true,
        overlayBasemapEnabled: true
      },
      uiPanels: {
        enrichJoinTabularOpen: true
      }
    });

    expect(dataTabState.enrichData.joinTabularEnabled).toBe(true);
    expect(dataTabState.enrichData.overlayBasemapEnabled).toBe(true);
    expect(dataTabState.uiPanels.enrichJoinTabularOpen).toBe(true);
    expect(dataTabState.uiPanels.enrichOverlayBasemapOpen).toBe(false);
    expect(dataTabState.uiPanels.enrichBasemapSuggestionsOpen).toBeUndefined();
    expect(dataTabState.uiPanels.enrichBasemapCatalogOpen).toBeUndefined();
  });
});
