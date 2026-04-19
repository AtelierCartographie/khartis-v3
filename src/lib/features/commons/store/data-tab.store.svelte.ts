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
import type { DataTabState } from './data-tab.types';

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
    joinMappings: []
  },
  enrichData: {
    enrichmentDatasetId: undefined,
    enrichmentColumn: undefined,
    targetColumn: undefined,
    isEnrichmentActive: false,
    joinTabularEnabled: false,
    basemapTabIndex: 0
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
  const restored = data as Partial<DataTabState> | undefined;
  const nextState = structuredClone(DEFAULT_STATE);

  if (restored?.dataControl) {
    Object.assign(nextState.dataControl, restored.dataControl);
  }
  if (restored?.geolocation) {
    Object.assign(nextState.geolocation, restored.geolocation);
  }
  if (restored?.basemapJoin) {
    Object.assign(nextState.basemapJoin, restored.basemapJoin);
  }
  if (restored?.enrichData) {
    Object.assign(nextState.enrichData, restored.enrichData);
  }
  if (restored?.notifications) {
    Object.assign(nextState.notifications, restored.notifications);
  }

  Object.assign(dataTabState, nextState);
}

function serializeDataTabState(): DataTabState {
  return {
    dataControl: { ...dataTabState.dataControl },
    geolocation: { ...dataTabState.geolocation },
    basemapJoin: {
      ...dataTabState.basemapJoin,
      duplicateEntities: [...dataTabState.basemapJoin.duplicateEntities],
      unrecognizedEntities: [...dataTabState.basemapJoin.unrecognizedEntities],
      joinMappings: dataTabState.basemapJoin.joinMappings.map((mapping) => ({
        dataValue: mapping.dataValue,
        basemapOptions: [...mapping.basemapOptions],
        selectedMapping: mapping.selectedMapping
      }))
    },
    enrichData: { ...dataTabState.enrichData },
    notifications: { ...dataTabState.notifications }
  };
}

function areJoinStatsEmpty(): boolean {
  return (
    dataTabState.basemapJoin.joinedEntities === 0 &&
    dataTabState.basemapJoin.entitiesToVerify === 0 &&
    dataTabState.basemapJoin.duplicateEntities.length === 0 &&
    dataTabState.basemapJoin.unrecognizedEntities.length === 0 &&
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

  setJoinStats(stats: JoinQuality): void {
    dataTabState.basemapJoin.joinedEntities = stats.joinedCount ?? 0;
    dataTabState.basemapJoin.entitiesToVerify = stats.toVerifyCount ?? 0;

    const entities = stats.entities ?? [];

    dataTabState.basemapJoin.duplicateEntities = entities
      .filter((e) => e.status === JoinStatus.DUPLICATE)
      .map((e) => e.dataValue);

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

    notifyPersistence('IMMEDIATE');
  },

  updateJoinMapping(index: number, selectedMapping: string): void {
    if (dataTabState.basemapJoin.joinMappings[index]) {
      dataTabState.basemapJoin.joinMappings[index].selectedMapping =
        selectedMapping;
      notifyPersistence('IMMEDIATE');
    }
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
