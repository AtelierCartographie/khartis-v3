import {
  BasemapSource,
  GeoreferenceType,
  JoinStatus,
  TableViewType
} from '$lib/features/commons/constants/ui.constants';
import {
  SavePriority,
  persistenceRegistry
} from '$lib/features/project-management/core/persistence-registry';
import type { JoinQuality } from '$lib/features/map/types/basemap.types';
import type {
  BasemapJoinState,
  DataTabState,
  IgnoredEntity,
  SerializedDataTabState
} from '../types/data-tab.types';

const DEFAULT_STATE: DataTabState = {
  dataControl: {
    expandedRowIds: [],
    searchQuery: '',
    filterActive: false,
    tableView: TableViewType.COMPACT,
    showSummaryPlots: true,
    sortColumn: null,
    sortOrder: null
  },
  geolocation: {
    geoReference: GeoreferenceType.ENTITIES,
    linkedVariable: null,
    linkedVariableName: '',
    autoDetected: true
  },
  basemapJoin: {
    selectedBasemap: '',
    basemapSource: BasemapSource.CATALOG,
    joinedEntities: 0,
    entitiesToVerify: 0,
    duplicateEntities: [],
    unrecognizedEntities: [],
    joinedEntitiesList: [],
    ignoredEntities: [],
    joinMappings: [],
    duplicateLines: []
  },
  enrichData: {
    enrichmentDatasetId: undefined,
    enrichmentColumn: undefined,
    targetColumn: undefined,
    isEnrichmentActive: false,
    joinTabularEnabled: false,
    overlayBasemapEnabled: false,
    basemapTabIndex: 0,
    preferredOverlayBasemapId: undefined,
    preferredOverlayBasemapSource: undefined
  },
  uiPanels: {
    enrichJoinTabularOpen: false,
    enrichOverlayBasemapOpen: false,
    enrichBasemapSuggestionsOpen: undefined,
    enrichBasemapCatalogOpen: undefined
  },
  notifications: {
    variableTypes: false,
    warnings: false
  }
};

export const dataTabState = $state<DataTabState>({ ...DEFAULT_STATE });

function notifyPersistence(
  priority: keyof typeof SavePriority = 'DEBOUNCED'
): void {
  persistenceRegistry.notifyChange('dataTab', SavePriority[priority]);
}

function restoreFromSerialized(data: unknown): void {
  const restored = data as
    Partial<DataTabState> | Partial<SerializedDataTabState> | undefined;
  const nextState = structuredClone(DEFAULT_STATE);

  if (restored?.dataControl) {
    Object.assign(nextState.dataControl, restored.dataControl);
  }
  if (restored?.geolocation) {
    Object.assign(nextState.geolocation, restored.geolocation);
  }
  if (restored?.basemapJoin) {
    const restoredJoin = restored.basemapJoin as Partial<BasemapJoinState>;
    Object.assign(nextState.basemapJoin, {
      joinedEntities: restoredJoin.joinedEntities,
      entitiesToVerify: restoredJoin.entitiesToVerify,
      duplicateEntities: restoredJoin.duplicateEntities,
      unrecognizedEntities: restoredJoin.unrecognizedEntities,
      joinedEntitiesList: restoredJoin.joinedEntitiesList ?? [],
      ignoredEntities: restoredJoin.ignoredEntities ?? [],
      joinMappings: restoredJoin.joinMappings
    });

    if (
      'selectedBasemap' in restored.basemapJoin &&
      typeof restored.basemapJoin.selectedBasemap === 'string'
    ) {
      nextState.basemapJoin.selectedBasemap =
        restored.basemapJoin.selectedBasemap;
    }

    if (
      'basemapSource' in restored.basemapJoin &&
      Object.values(BasemapSource).includes(
        restored.basemapJoin.basemapSource as BasemapSource
      )
    ) {
      nextState.basemapJoin.basemapSource = restored.basemapJoin
        .basemapSource as BasemapSource;
    }
  }
  if (restored?.enrichData) {
    Object.assign(nextState.enrichData, restored.enrichData);
  }
  if (restored?.uiPanels) {
    Object.assign(nextState.uiPanels, restored.uiPanels);
  }
  if (restored?.notifications) {
    Object.assign(nextState.notifications, restored.notifications);
  }

  Object.assign(dataTabState, nextState);
}

function serializeDataTabState(): SerializedDataTabState {
  return {
    dataControl: { ...dataTabState.dataControl },
    geolocation: { ...dataTabState.geolocation },
    basemapJoin: {
      joinedEntities: dataTabState.basemapJoin.joinedEntities,
      entitiesToVerify: dataTabState.basemapJoin.entitiesToVerify,
      duplicateEntities: [...dataTabState.basemapJoin.duplicateEntities],
      unrecognizedEntities: [...dataTabState.basemapJoin.unrecognizedEntities],
      joinedEntitiesList: dataTabState.basemapJoin.joinedEntitiesList.map(
        (entity) => ({ ...entity })
      ),
      ignoredEntities: dataTabState.basemapJoin.ignoredEntities.map(
        (entity) => ({ ...entity })
      ),
      joinMappings: dataTabState.basemapJoin.joinMappings.map((mapping) => ({
        dataValue: mapping.dataValue,
        basemapOptions: [...mapping.basemapOptions],
        selectedMapping: mapping.selectedMapping
      }))
    },
    enrichData: { ...dataTabState.enrichData },
    uiPanels: { ...dataTabState.uiPanels },
    notifications: { ...dataTabState.notifications }
  };
}

function areJoinStatsEmpty(): boolean {
  return (
    dataTabState.basemapJoin.joinedEntities === 0 &&
    dataTabState.basemapJoin.entitiesToVerify === 0 &&
    dataTabState.basemapJoin.duplicateEntities.length === 0 &&
    dataTabState.basemapJoin.unrecognizedEntities.length === 0 &&
    dataTabState.basemapJoin.joinedEntitiesList.length === 0 &&
    dataTabState.basemapJoin.ignoredEntities.length === 0 &&
    dataTabState.basemapJoin.joinMappings.length === 0
  );
}

export const dataTabActions = {
  setDataControlState(updates: Partial<DataTabState['dataControl']>): void {
    Object.assign(dataTabState.dataControl, updates);
    notifyPersistence('IMMEDIATE');
  },

  setGeolocationState(updates: Partial<DataTabState['geolocation']>): void {
    Object.assign(dataTabState.geolocation, updates);
    notifyPersistence('IMMEDIATE');
  },

  setBasemapJoinState(updates: Partial<DataTabState['basemapJoin']>): void {
    Object.assign(dataTabState.basemapJoin, updates);
    notifyPersistence('IMMEDIATE');
  },

  setEnrichDataState(updates: Partial<DataTabState['enrichData']>): void {
    Object.assign(dataTabState.enrichData, updates);
    notifyPersistence('IMMEDIATE');
  },

  setUiPanelsState(updates: Partial<DataTabState['uiPanels']>): void {
    Object.assign(dataTabState.uiPanels, updates);
    notifyPersistence('IMMEDIATE');
  },

  setJoinStats(stats: JoinQuality): void {
    const ignoredKeys = new Set(
      dataTabState.basemapJoin.ignoredEntities.map((e) => e.dataValue)
    );

    const entities = (stats.entities ?? []).filter(
      (e) => !ignoredKeys.has(e.dataValue)
    );

    dataTabState.basemapJoin.joinedEntitiesList = entities
      .filter((e) => e.status === JoinStatus.JOINED)
      .map((e) => {
        const basemapValue =
          e.basemapValue ??
          (e.matches && e.matches.length > 0 ? e.matches[0] : e.dataValue);
        const otherIdentifiers =
          e.matches?.filter(
            (match) => match !== basemapValue && match !== e.dataValue
          ) ?? [];
        return {
          dataValue: e.dataValue,
          basemapValue,
          otherIdentifiers
        };
      });

    dataTabState.basemapJoin.duplicateEntities = entities
      .filter((e) => e.status === JoinStatus.DUPLICATE)
      .map((e) => e.dataValue);

    dataTabState.basemapJoin.duplicateLines = stats.duplicateLines ?? [];

    dataTabState.basemapJoin.unrecognizedEntities = entities
      .filter((e) => e.status === JoinStatus.UNRECOGNIZED)
      .map((e) => e.dataValue);

    dataTabState.basemapJoin.joinMappings = entities
      .filter((e) => e.status === JoinStatus.TO_VERIFY)
      .map((e) => ({
        dataValue: e.dataValue,
        basemapOptions: e.matches || [],
        selectedMapping: e.matches && e.matches.length > 0 ? e.matches[0] : ''
      }));

    dataTabState.basemapJoin.joinedEntities =
      dataTabState.basemapJoin.joinedEntitiesList.length;
    dataTabState.basemapJoin.entitiesToVerify =
      dataTabState.basemapJoin.joinMappings.length;

    notifyPersistence('IMMEDIATE');
  },

  updateJoinMapping(index: number, selectedMapping: string): void {
    if (dataTabState.basemapJoin.joinMappings[index]) {
      dataTabState.basemapJoin.joinMappings[index].selectedMapping =
        selectedMapping;
      notifyPersistence('IMMEDIATE');
    }
  },

  ignoreEntity(entity: IgnoredEntity): void {
    if (
      dataTabState.basemapJoin.ignoredEntities.some(
        (existing) => existing.dataValue === entity.dataValue
      )
    ) {
      return;
    }

    dataTabState.basemapJoin.joinedEntitiesList =
      dataTabState.basemapJoin.joinedEntitiesList.filter(
        (e) => e.dataValue !== entity.dataValue
      );
    dataTabState.basemapJoin.joinMappings =
      dataTabState.basemapJoin.joinMappings.filter(
        (e) => e.dataValue !== entity.dataValue
      );
    dataTabState.basemapJoin.unrecognizedEntities =
      dataTabState.basemapJoin.unrecognizedEntities.filter(
        (value) => value !== entity.dataValue
      );
    dataTabState.basemapJoin.ignoredEntities = [
      ...dataTabState.basemapJoin.ignoredEntities,
      { ...entity }
    ];
    dataTabState.basemapJoin.joinedEntities =
      dataTabState.basemapJoin.joinedEntitiesList.length;
    dataTabState.basemapJoin.entitiesToVerify =
      dataTabState.basemapJoin.joinMappings.length;

    notifyPersistence('IMMEDIATE');
  },

  restoreEntity(dataValue: string): void {
    const exists = dataTabState.basemapJoin.ignoredEntities.some(
      (e) => e.dataValue === dataValue
    );
    if (!exists) return;

    dataTabState.basemapJoin.ignoredEntities =
      dataTabState.basemapJoin.ignoredEntities.filter(
        (e) => e.dataValue !== dataValue
      );

    if (!dataTabState.basemapJoin.unrecognizedEntities.includes(dataValue)) {
      dataTabState.basemapJoin.unrecognizedEntities = [
        ...dataTabState.basemapJoin.unrecognizedEntities,
        dataValue
      ];
    }

    notifyPersistence('IMMEDIATE');
  },

  promoteToJoined(dataValue: string, basemapValue: string): void {
    dataTabState.basemapJoin.joinMappings =
      dataTabState.basemapJoin.joinMappings.filter(
        (e) => e.dataValue !== dataValue
      );
    dataTabState.basemapJoin.unrecognizedEntities =
      dataTabState.basemapJoin.unrecognizedEntities.filter(
        (value) => value !== dataValue
      );

    if (
      !dataTabState.basemapJoin.joinedEntitiesList.some(
        (e) => e.dataValue === dataValue
      )
    ) {
      dataTabState.basemapJoin.joinedEntitiesList = [
        ...dataTabState.basemapJoin.joinedEntitiesList,
        { dataValue, basemapValue }
      ];
    }

    dataTabState.basemapJoin.joinedEntities =
      dataTabState.basemapJoin.joinedEntitiesList.length;
    dataTabState.basemapJoin.entitiesToVerify =
      dataTabState.basemapJoin.joinMappings.length;

    notifyPersistence('IMMEDIATE');
  },

  toggleNotification(type: 'variableTypes' | 'warnings'): void {
    dataTabState.notifications[type] = !dataTabState.notifications[type];
    notifyPersistence();
  },

  expandRows(ids: (string | number)[]): void {
    dataTabState.dataControl.expandedRowIds = ids;
    notifyPersistence();
  },

  setSearch(query: string): void {
    dataTabState.dataControl.searchQuery = query;
    notifyPersistence();
  },

  toggleFilter(): void {
    dataTabState.dataControl.filterActive =
      !dataTabState.dataControl.filterActive;
    notifyPersistence();
  },

  selectBasemap(basemapId: string): void {
    dataTabState.basemapJoin.selectedBasemap = basemapId;
    notifyPersistence('IMMEDIATE');
  },

  setBasemapSource(source: BasemapSource): void {
    dataTabState.basemapJoin.basemapSource = source;
    notifyPersistence('IMMEDIATE');
  },

  clearJoinStats(): void {
    if (areJoinStatsEmpty()) {
      return;
    }

    dataTabState.basemapJoin.joinedEntities = 0;
    dataTabState.basemapJoin.entitiesToVerify = 0;
    dataTabState.basemapJoin.duplicateEntities = [];
    dataTabState.basemapJoin.unrecognizedEntities = [];
    dataTabState.basemapJoin.joinedEntitiesList = [];
    dataTabState.basemapJoin.ignoredEntities = [];
    dataTabState.basemapJoin.joinMappings = [];
    notifyPersistence('IMMEDIATE');
  },

  reset(): void {
    restoreFromSerialized(undefined);
  }
};

persistenceRegistry.register({
  key: 'dataTab',
  serialize: () => serializeDataTabState(),
  deserialize: (data: unknown) => restoreFromSerialized(data),
  reset: () => restoreFromSerialized(undefined),
  priority: 'debounced'
});
