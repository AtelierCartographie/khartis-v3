import type { JoinQuality } from '$lib/features/map/types/basemap.types';
import type { DataTabState } from './data-tab.types';

const DEFAULT_STATE: DataTabState = {
  dataControl: {
    selectedRowIds: [],
    expandedRowIds: [],
    searchQuery: '',
    filterActive: false,
    tableView: 'compact'
  },
  geolocation: {
    geoReference: 'entities',
    linkedVariable: null,
    linkedVariableName: '',
    autoDetected: true
  },
  basemapJoin: {
    selectedBasemap: '',
    basemapSource: 'catalog',
    joinedEntities: 0,
    entitiesToVerify: 0,
    duplicateEntities: [],
    unrecognizedEntities: [],
    joinMappings: [],
    correctionEnabled: false
  },
  enrichData: {
    enrichmentDatasetId: undefined,
    enrichmentColumn: undefined,
    targetColumn: undefined,
    isEnrichmentActive: false
  },
  notifications: {
    variableTypes: false,
    warnings: false
  }
};

export const dataTabState = $state<DataTabState>({ ...DEFAULT_STATE });

export const dataTabActions = {
  setDataControlState(updates: Partial<DataTabState['dataControl']>): void {
    Object.assign(dataTabState.dataControl, updates);
  },

  setGeolocationState(updates: Partial<DataTabState['geolocation']>): void {
    Object.assign(dataTabState.geolocation, updates);
  },

  setBasemapJoinState(updates: Partial<DataTabState['basemapJoin']>): void {
    Object.assign(dataTabState.basemapJoin, updates);
  },

  setEnrichDataState(updates: Partial<DataTabState['enrichData']>): void {
    Object.assign(dataTabState.enrichData, updates);
  },

  setJoinStats(stats: JoinQuality): void {
    dataTabState.basemapJoin.joinedEntities = stats.joinedCount;
    dataTabState.basemapJoin.entitiesToVerify = stats.toVerifyCount;

    dataTabState.basemapJoin.duplicateEntities = stats.entities
      .filter((e) => e.status === 'duplicate')
      .map((e) => e.dataValue);

    dataTabState.basemapJoin.unrecognizedEntities = stats.entities
      .filter((e) => e.status === 'unrecognized')
      .map((e) => e.dataValue);

    dataTabState.basemapJoin.joinMappings = stats.entities
      .filter((e) => e.status === 'to_verify')
      .map((e) => ({
        dataValue: e.dataValue,
        basemapOptions: e.matches || [],
        selectedMapping: e.matches && e.matches.length > 0 ? e.matches[0] : ''
      }));
  },

  updateJoinMapping(index: number, selectedMapping: string): void {
    if (dataTabState.basemapJoin.joinMappings[index]) {
      dataTabState.basemapJoin.joinMappings[index].selectedMapping =
        selectedMapping;
    }
  },

  toggleNotification(type: 'variableTypes' | 'warnings'): void {
    dataTabState.notifications[type] = !dataTabState.notifications[type];
  },

  selectRows(ids: (string | number)[]): void {
    dataTabState.dataControl.selectedRowIds = ids;
  },

  expandRows(ids: (string | number)[]): void {
    dataTabState.dataControl.expandedRowIds = ids;
  },

  setSearch(query: string): void {
    dataTabState.dataControl.searchQuery = query;
  },

  toggleFilter(): void {
    dataTabState.dataControl.filterActive =
      !dataTabState.dataControl.filterActive;
  },

  selectBasemap(basemapId: string): void {
    dataTabState.basemapJoin.selectedBasemap = basemapId;
  },

  setBasemapSource(source: 'catalog' | 'import' | 'osm'): void {
    dataTabState.basemapJoin.basemapSource = source;
  },

  applyCorrections(): void {
    dataTabState.basemapJoin.correctionEnabled = true;
  },

  reset(): void {
    Object.assign(dataTabState, DEFAULT_STATE);
  }
};

export function hasJoinErrors() {
  return (
    dataTabState.basemapJoin.entitiesToVerify > 0 ||
    dataTabState.basemapJoin.duplicateEntities.length > 0 ||
    dataTabState.basemapJoin.unrecognizedEntities.length > 0
  );
}

export function totalEntities() {
  return (
    dataTabState.basemapJoin.joinedEntities +
    dataTabState.basemapJoin.entitiesToVerify
  );
}

export function isDataReady() {
  const geo = dataTabState.geolocation;

  if (geo.geoReference === 'coordinates') {
    return !!geo.latitudeColumn && !!geo.longitudeColumn;
  }

  return (
    geo.linkedVariable !== null &&
    dataTabState.basemapJoin.selectedBasemap !== ''
  );
}
