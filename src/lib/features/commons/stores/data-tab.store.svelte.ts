import {
  BasemapSource,
  GeoreferenceType,
  TableViewType
} from '$lib/features/commons/constants/ui.constants';
import { MAX_JOIN_BUCKET_LIST_VALUES } from '$lib/features/commons/constants/data.constants';
import {
  SavePriority,
  persistenceRegistry
} from '$lib/features/project-management/core';
import type { JoinQuality } from '$lib/features/map/types/basemap.types';
import type {
  BasemapJoinState,
  DataTabState,
  DuplicateLineReference,
  IgnoredEntity,
  JoinCandidate,
  JoinMapping,
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
    duplicateTotal: 0,
    unrecognizedEntities: [],
    unrecognizedTotal: 0,
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

interface BasemapJoinListsState {
  duplicateEntities: string[];
  unrecognizedEntities: string[];
  ignoredEntities: IgnoredEntity[];
  joinMappings: JoinMapping[];
  duplicateLines: DuplicateLineReference[];
}

type BasemapJoinCoreState = Omit<BasemapJoinState, keyof BasemapJoinListsState>;

interface DataTabCoreState extends Omit<DataTabState, 'basemapJoin'> {
  basemapJoin: BasemapJoinCoreState;
}

function splitBasemapJoin(basemapJoin: BasemapJoinState): {
  core: BasemapJoinCoreState;
  lists: BasemapJoinListsState;
} {
  const {
    duplicateEntities,
    unrecognizedEntities,
    ignoredEntities,
    joinMappings,
    duplicateLines,
    ...core
  } = basemapJoin;

  return {
    core,
    lists: {
      duplicateEntities,
      unrecognizedEntities,
      ignoredEntities,
      joinMappings,
      duplicateLines
    }
  };
}

const defaultSplit = splitBasemapJoin(
  structuredClone(DEFAULT_STATE).basemapJoin
);

const dataTabInternalState = $state<DataTabCoreState>({
  ...structuredClone(DEFAULT_STATE),
  basemapJoin: defaultSplit.core
});

// The join lists can hold hundreds of rows: raw state avoids one proxy per row.
let basemapJoinLists = $state.raw<BasemapJoinListsState>(defaultSplit.lists);

export const dataTabState: Readonly<DataTabState> = {
  get dataControl() {
    return dataTabInternalState.dataControl;
  },
  get geolocation() {
    return dataTabInternalState.geolocation;
  },
  get basemapJoin(): BasemapJoinState {
    return { ...dataTabInternalState.basemapJoin, ...basemapJoinLists };
  },
  get enrichData() {
    return dataTabInternalState.enrichData;
  },
  get uiPanels() {
    return dataTabInternalState.uiPanels;
  },
  get notifications() {
    return dataTabInternalState.notifications;
  }
};

function replaceJoinLists(updates: Partial<BasemapJoinListsState>): void {
  basemapJoinLists = { ...basemapJoinLists, ...updates };
}

function notifyPersistence(
  priority: keyof typeof SavePriority = 'DEBOUNCED'
): void {
  persistenceRegistry.notifyChange('dataTab', SavePriority[priority]);
}

interface ResetDataTabOptions {
  notify?: boolean;
  priority?: keyof typeof SavePriority;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function restoreStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is string => typeof item === 'string');
}

function restoreStringOrNumberArray(value: unknown): (string | number)[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is string | number =>
      typeof item === 'string' ||
      (typeof item === 'number' && Number.isFinite(item))
  );
}

function restoreNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is number => typeof item === 'number' && Number.isFinite(item)
  );
}

function isBasemapSource(value: unknown): value is BasemapSource {
  return (
    value === BasemapSource.CATALOG ||
    value === BasemapSource.IMPORT ||
    value === BasemapSource.OSM
  );
}

function isGeoreferenceType(value: unknown): value is GeoreferenceType {
  return (
    value === GeoreferenceType.ENTITIES ||
    value === GeoreferenceType.COORDINATES ||
    value === GeoreferenceType.CUSTOM
  );
}

function isTableViewType(value: unknown): value is TableViewType {
  return value === TableViewType.COMPACT || value === TableViewType.EXPANDED;
}

function isSortOrder(
  value: unknown
): value is NonNullable<DataTabState['dataControl']['sortOrder']> {
  return value === 'ASC' || value === 'DESC';
}

function isIgnoredEntitySource(
  value: unknown
): value is IgnoredEntity['source'] {
  return (
    value === 'joined' || value === 'to_verify' || value === 'unrecognized'
  );
}

function isBasemapTabIndex(value: unknown): value is number {
  return value === 0 || value === 1 || value === 2;
}

function restoreLinkedVariable(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  return undefined;
}

function restoreCount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }

  return undefined;
}

function restoreIgnoredEntities(value: unknown): IgnoredEntity[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): IgnoredEntity[] => {
    if (
      !isRecord(item) ||
      typeof item.dataValue !== 'string' ||
      !isIgnoredEntitySource(item.source)
    ) {
      return [];
    }

    const entity: IgnoredEntity = {
      dataValue: item.dataValue,
      source: item.source
    };

    if (typeof item.basemapValue === 'string') {
      entity.basemapValue = item.basemapValue;
    }
    if (Array.isArray(item.lines)) {
      entity.lines = restoreNumberArray(item.lines);
    }

    return [entity];
  });
}

function restoreJoinCandidates(value: unknown): JoinCandidate[] | undefined {
  if (!Array.isArray(value)) return undefined;

  return value.flatMap((item): JoinCandidate[] => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.score !== 'number' ||
      !Number.isFinite(item.score) ||
      item.score < 0 ||
      item.score > 1 ||
      (item.type !== 'exact' && item.type !== 'partial') ||
      (item.variant !== null && typeof item.variant !== 'string')
    ) {
      return [];
    }

    return [
      {
        id: item.id,
        name: item.name,
        score: item.score,
        type: item.type,
        variant: item.variant
      }
    ];
  });
}

function restoreJoinMappings(value: unknown): JoinMapping[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): JoinMapping[] => {
    if (
      !isRecord(item) ||
      typeof item.dataValue !== 'string' ||
      typeof item.selectedMapping !== 'string' ||
      !Array.isArray(item.basemapOptions)
    ) {
      return [];
    }

    const mapping: JoinMapping = {
      dataValue: item.dataValue,
      basemapOptions: restoreStringArray(item.basemapOptions),
      selectedMapping: item.selectedMapping
    };
    const candidates = restoreJoinCandidates(item.candidates);
    if (candidates) mapping.candidates = candidates;

    return [mapping];
  });
}

function restoreDataControl(
  dataControl: unknown,
  nextState: DataTabState
): void {
  if (!isRecord(dataControl)) return;

  if (Array.isArray(dataControl.expandedRowIds)) {
    nextState.dataControl.expandedRowIds = restoreStringOrNumberArray(
      dataControl.expandedRowIds
    );
  }
  if (typeof dataControl.searchQuery === 'string') {
    nextState.dataControl.searchQuery = dataControl.searchQuery;
  }
  if (typeof dataControl.filterActive === 'boolean') {
    nextState.dataControl.filterActive = dataControl.filterActive;
  }
  if (isTableViewType(dataControl.tableView)) {
    nextState.dataControl.tableView = dataControl.tableView;
  }
  if (typeof dataControl.showSummaryPlots === 'boolean') {
    nextState.dataControl.showSummaryPlots = dataControl.showSummaryPlots;
  }
  if (
    typeof dataControl.sortColumn === 'string' ||
    dataControl.sortColumn === null
  ) {
    nextState.dataControl.sortColumn = dataControl.sortColumn;
  }
  if (isSortOrder(dataControl.sortOrder) || dataControl.sortOrder === null) {
    nextState.dataControl.sortOrder = dataControl.sortOrder;
  }
}

function restoreGeolocation(
  geolocation: unknown,
  nextState: DataTabState
): void {
  if (!isRecord(geolocation)) return;

  const linkedVariable = restoreLinkedVariable(geolocation.linkedVariable);

  if (isGeoreferenceType(geolocation.geoReference)) {
    nextState.geolocation.geoReference = geolocation.geoReference;
  }
  if (linkedVariable !== undefined) {
    nextState.geolocation.linkedVariable = linkedVariable;
  }
  if (typeof geolocation.linkedVariableName === 'string') {
    nextState.geolocation.linkedVariableName = geolocation.linkedVariableName;
  }
  if (typeof geolocation.latitudeColumn === 'string') {
    nextState.geolocation.latitudeColumn = geolocation.latitudeColumn;
  }
  if (typeof geolocation.longitudeColumn === 'string') {
    nextState.geolocation.longitudeColumn = geolocation.longitudeColumn;
  }
  if (typeof geolocation.autoDetected === 'boolean') {
    nextState.geolocation.autoDetected = geolocation.autoDetected;
  }
}

function restoreBasemapJoin(
  basemapJoin: unknown,
  nextState: DataTabState
): void {
  if (!isRecord(basemapJoin)) return;

  const duplicateEntities = restoreStringArray(basemapJoin.duplicateEntities);
  const unrecognizedEntities = restoreStringArray(
    basemapJoin.unrecognizedEntities
  );

  nextState.basemapJoin.duplicateEntities = duplicateEntities.slice(
    0,
    MAX_JOIN_BUCKET_LIST_VALUES
  );
  nextState.basemapJoin.unrecognizedEntities = unrecognizedEntities.slice(
    0,
    MAX_JOIN_BUCKET_LIST_VALUES
  );
  nextState.basemapJoin.ignoredEntities = restoreIgnoredEntities(
    basemapJoin.ignoredEntities
  );
  nextState.basemapJoin.joinMappings = restoreJoinMappings(
    basemapJoin.joinMappings
  );

  nextState.basemapJoin.joinedEntities =
    restoreCount(basemapJoin.joinedEntities) ?? 0;
  nextState.basemapJoin.duplicateTotal =
    restoreCount(basemapJoin.duplicateTotal) ?? duplicateEntities.length;
  nextState.basemapJoin.unrecognizedTotal =
    restoreCount(basemapJoin.unrecognizedTotal) ?? unrecognizedEntities.length;
  nextState.basemapJoin.entitiesToVerify =
    nextState.basemapJoin.joinMappings.length;

  if (typeof basemapJoin.selectedBasemap === 'string') {
    nextState.basemapJoin.selectedBasemap = basemapJoin.selectedBasemap;
  }
  if (isBasemapSource(basemapJoin.basemapSource)) {
    nextState.basemapJoin.basemapSource = basemapJoin.basemapSource;
  }
}

function restoreEnrichData(enrichData: unknown, nextState: DataTabState): void {
  if (!isRecord(enrichData)) return;

  if (typeof enrichData.enrichmentDatasetId === 'string') {
    nextState.enrichData.enrichmentDatasetId = enrichData.enrichmentDatasetId;
  }
  if (typeof enrichData.enrichmentColumn === 'string') {
    nextState.enrichData.enrichmentColumn = enrichData.enrichmentColumn;
  }
  if (typeof enrichData.targetColumn === 'string') {
    nextState.enrichData.targetColumn = enrichData.targetColumn;
  }
  if (typeof enrichData.isEnrichmentActive === 'boolean') {
    nextState.enrichData.isEnrichmentActive = enrichData.isEnrichmentActive;
  }
  if (typeof enrichData.joinTabularEnabled === 'boolean') {
    nextState.enrichData.joinTabularEnabled = enrichData.joinTabularEnabled;
  }
  if (typeof enrichData.overlayBasemapEnabled === 'boolean') {
    nextState.enrichData.overlayBasemapEnabled =
      enrichData.overlayBasemapEnabled;
  }
  if (isBasemapTabIndex(enrichData.basemapTabIndex)) {
    nextState.enrichData.basemapTabIndex = enrichData.basemapTabIndex;
  }
  if (typeof enrichData.preferredOverlayBasemapId === 'string') {
    nextState.enrichData.preferredOverlayBasemapId =
      enrichData.preferredOverlayBasemapId;
  }
  if (isBasemapSource(enrichData.preferredOverlayBasemapSource)) {
    nextState.enrichData.preferredOverlayBasemapSource =
      enrichData.preferredOverlayBasemapSource;
  }
}

function restoreUiPanels(uiPanels: unknown, nextState: DataTabState): void {
  if (!isRecord(uiPanels)) return;

  if (typeof uiPanels.enrichJoinTabularOpen === 'boolean') {
    nextState.uiPanels.enrichJoinTabularOpen = uiPanels.enrichJoinTabularOpen;
  }
  if (typeof uiPanels.enrichOverlayBasemapOpen === 'boolean') {
    nextState.uiPanels.enrichOverlayBasemapOpen =
      uiPanels.enrichOverlayBasemapOpen;
  }
  if (typeof uiPanels.enrichBasemapSuggestionsOpen === 'boolean') {
    nextState.uiPanels.enrichBasemapSuggestionsOpen =
      uiPanels.enrichBasemapSuggestionsOpen;
  }
  if (typeof uiPanels.enrichBasemapCatalogOpen === 'boolean') {
    nextState.uiPanels.enrichBasemapCatalogOpen =
      uiPanels.enrichBasemapCatalogOpen;
  }
}

function restoreNotifications(
  notifications: unknown,
  nextState: DataTabState
): void {
  if (!isRecord(notifications)) return;

  if (typeof notifications.variableTypes === 'boolean') {
    nextState.notifications.variableTypes = notifications.variableTypes;
  }
  if (typeof notifications.warnings === 'boolean') {
    nextState.notifications.warnings = notifications.warnings;
  }
}

function applyDataTabState(nextState: DataTabState): void {
  const { basemapJoin, ...rest } = nextState;
  const { core, lists } = splitBasemapJoin(basemapJoin);
  Object.assign(dataTabInternalState, { ...rest, basemapJoin: core });
  basemapJoinLists = lists;
}

function restoreFromSerialized(data: unknown): void {
  const nextState = structuredClone(DEFAULT_STATE);

  if (isRecord(data)) {
    restoreDataControl(data.dataControl, nextState);
    restoreGeolocation(data.geolocation, nextState);
    restoreBasemapJoin(data.basemapJoin, nextState);
    restoreEnrichData(data.enrichData, nextState);
    restoreUiPanels(data.uiPanels, nextState);
    restoreNotifications(data.notifications, nextState);
  }

  applyDataTabState(nextState);
}

function serializeDataTabState(): SerializedDataTabState {
  return {
    dataControl: { ...dataTabInternalState.dataControl },
    geolocation: { ...dataTabInternalState.geolocation },
    basemapJoin: {
      joinedEntities: dataTabInternalState.basemapJoin.joinedEntities,
      duplicateEntities: [...basemapJoinLists.duplicateEntities],
      duplicateTotal: dataTabInternalState.basemapJoin.duplicateTotal,
      unrecognizedEntities: [...basemapJoinLists.unrecognizedEntities],
      unrecognizedTotal: dataTabInternalState.basemapJoin.unrecognizedTotal,
      ignoredEntities: basemapJoinLists.ignoredEntities.map((entity) => ({
        ...entity
      })),
      joinMappings: basemapJoinLists.joinMappings.map((mapping) => ({
        dataValue: mapping.dataValue,
        basemapOptions: [...mapping.basemapOptions],
        selectedMapping: mapping.selectedMapping,
        ...(mapping.candidates
          ? {
              candidates: mapping.candidates.map((candidate) => ({
                ...candidate
              }))
            }
          : {})
      }))
    },
    enrichData: { ...dataTabInternalState.enrichData },
    uiPanels: { ...dataTabInternalState.uiPanels },
    notifications: { ...dataTabInternalState.notifications }
  };
}

function areJoinStatsEmpty(): boolean {
  return (
    dataTabInternalState.basemapJoin.joinedEntities === 0 &&
    dataTabInternalState.basemapJoin.entitiesToVerify === 0 &&
    dataTabInternalState.basemapJoin.duplicateTotal === 0 &&
    dataTabInternalState.basemapJoin.unrecognizedTotal === 0 &&
    basemapJoinLists.duplicateEntities.length === 0 &&
    basemapJoinLists.unrecognizedEntities.length === 0 &&
    basemapJoinLists.ignoredEntities.length === 0 &&
    basemapJoinLists.joinMappings.length === 0 &&
    basemapJoinLists.duplicateLines.length === 0
  );
}

export const dataTabActions = {
  setDataControlState(updates: Partial<DataTabState['dataControl']>): void {
    Object.assign(dataTabInternalState.dataControl, updates);
    notifyPersistence();
  },

  setGeolocationState(updates: Partial<DataTabState['geolocation']>): void {
    Object.assign(dataTabInternalState.geolocation, updates);
    notifyPersistence();
  },

  setBasemapJoinState(updates: Partial<BasemapJoinState>): void {
    const {
      duplicateEntities,
      unrecognizedEntities,
      ignoredEntities,
      joinMappings,
      duplicateLines,
      ...coreUpdates
    } = updates;

    Object.assign(dataTabInternalState.basemapJoin, coreUpdates);

    const listUpdates: Partial<BasemapJoinListsState> = {};
    if (duplicateEntities !== undefined) {
      listUpdates.duplicateEntities = duplicateEntities;
    }
    if (unrecognizedEntities !== undefined) {
      listUpdates.unrecognizedEntities = unrecognizedEntities;
    }
    if (ignoredEntities !== undefined) {
      listUpdates.ignoredEntities = ignoredEntities;
    }
    if (joinMappings !== undefined) {
      listUpdates.joinMappings = joinMappings;
    }
    if (duplicateLines !== undefined) {
      listUpdates.duplicateLines = duplicateLines;
    }
    if (Object.keys(listUpdates).length > 0) {
      replaceJoinLists(listUpdates);
    }

    notifyPersistence();
  },

  setEnrichDataState(updates: Partial<DataTabState['enrichData']>): void {
    Object.assign(dataTabInternalState.enrichData, updates);
    notifyPersistence();
  },

  setUiPanelsState(updates: Partial<DataTabState['uiPanels']>): void {
    Object.assign(dataTabInternalState.uiPanels, updates);
    notifyPersistence();
  },

  setJoinStats(stats: JoinQuality): void {
    dataTabInternalState.basemapJoin.joinedEntities = stats.joinedCount;
    dataTabInternalState.basemapJoin.entitiesToVerify = stats.toVerifyCount;
    dataTabInternalState.basemapJoin.duplicateTotal = stats.duplicateCount;
    dataTabInternalState.basemapJoin.unrecognizedTotal =
      stats.unrecognizedCount;

    replaceJoinLists({
      duplicateEntities: stats.duplicateEntities,
      unrecognizedEntities: stats.unrecognizedEntities,
      joinMappings: stats.joinMappings,
      duplicateLines: stats.duplicateLines
    });

    notifyPersistence();
  },

  updateJoinMapping(index: number, selectedMapping: string): void {
    const current = basemapJoinLists.joinMappings[index];
    if (!current) return;

    const joinMappings = basemapJoinLists.joinMappings.slice();
    joinMappings[index] = { ...current, selectedMapping };
    replaceJoinLists({ joinMappings });
    notifyPersistence('IMMEDIATE');
  },

  ignoreEntity(entity: IgnoredEntity): void {
    if (
      basemapJoinLists.ignoredEntities.some(
        (existing) => existing.dataValue === entity.dataValue
      )
    ) {
      return;
    }

    const joinMappings = basemapJoinLists.joinMappings.filter(
      (e) => e.dataValue !== entity.dataValue
    );
    const unrecognizedEntities = basemapJoinLists.unrecognizedEntities.filter(
      (value) => value !== entity.dataValue
    );
    const removedFromUnrecognized =
      unrecognizedEntities.length !==
      basemapJoinLists.unrecognizedEntities.length;

    replaceJoinLists({
      joinMappings,
      unrecognizedEntities,
      ignoredEntities: [...basemapJoinLists.ignoredEntities, { ...entity }]
    });

    if (entity.source === 'joined') {
      dataTabInternalState.basemapJoin.joinedEntities = Math.max(
        0,
        dataTabInternalState.basemapJoin.joinedEntities - 1
      );
    }
    if (removedFromUnrecognized) {
      dataTabInternalState.basemapJoin.unrecognizedTotal = Math.max(
        0,
        dataTabInternalState.basemapJoin.unrecognizedTotal - 1
      );
    }
    dataTabInternalState.basemapJoin.entitiesToVerify = joinMappings.length;

    notifyPersistence('IMMEDIATE');
  },

  restoreEntity(dataValue: string): void {
    const exists = basemapJoinLists.ignoredEntities.some(
      (e) => e.dataValue === dataValue
    );
    if (!exists) return;

    const ignoredEntities = basemapJoinLists.ignoredEntities.filter(
      (e) => e.dataValue !== dataValue
    );
    const alreadyListed =
      basemapJoinLists.unrecognizedEntities.includes(dataValue);

    replaceJoinLists({
      ignoredEntities,
      ...(alreadyListed
        ? {}
        : {
            unrecognizedEntities: [
              ...basemapJoinLists.unrecognizedEntities,
              dataValue
            ]
          })
    });

    if (!alreadyListed) {
      dataTabInternalState.basemapJoin.unrecognizedTotal += 1;
    }

    notifyPersistence('IMMEDIATE');
  },

  promoteToJoined(dataValue: string): void {
    const joinMappings = basemapJoinLists.joinMappings.filter(
      (e) => e.dataValue !== dataValue
    );
    const removedFromToVerify =
      joinMappings.length !== basemapJoinLists.joinMappings.length;
    const unrecognizedEntities = basemapJoinLists.unrecognizedEntities.filter(
      (value) => value !== dataValue
    );
    const removedFromUnrecognized =
      unrecognizedEntities.length !==
      basemapJoinLists.unrecognizedEntities.length;

    replaceJoinLists({ joinMappings, unrecognizedEntities });

    if (removedFromToVerify || removedFromUnrecognized) {
      dataTabInternalState.basemapJoin.joinedEntities += 1;
    }
    if (removedFromUnrecognized) {
      dataTabInternalState.basemapJoin.unrecognizedTotal = Math.max(
        0,
        dataTabInternalState.basemapJoin.unrecognizedTotal - 1
      );
    }
    dataTabInternalState.basemapJoin.entitiesToVerify = joinMappings.length;

    notifyPersistence('IMMEDIATE');
  },

  toggleNotification(type: 'variableTypes' | 'warnings'): void {
    dataTabInternalState.notifications[type] =
      !dataTabInternalState.notifications[type];
    notifyPersistence();
  },

  expandRows(ids: (string | number)[]): void {
    dataTabInternalState.dataControl.expandedRowIds = ids;
    notifyPersistence();
  },

  setSearch(query: string): void {
    dataTabInternalState.dataControl.searchQuery = query;
    notifyPersistence();
  },

  toggleFilter(): void {
    dataTabInternalState.dataControl.filterActive =
      !dataTabInternalState.dataControl.filterActive;
    notifyPersistence();
  },

  selectBasemap(basemapId: string): void {
    dataTabInternalState.basemapJoin.selectedBasemap = basemapId;
    notifyPersistence();
  },

  setBasemapSource(source: BasemapSource): void {
    dataTabInternalState.basemapJoin.basemapSource = source;
    notifyPersistence();
  },

  clearJoinStats(): void {
    if (areJoinStatsEmpty()) {
      return;
    }

    dataTabInternalState.basemapJoin.joinedEntities = 0;
    dataTabInternalState.basemapJoin.entitiesToVerify = 0;
    dataTabInternalState.basemapJoin.duplicateTotal = 0;
    dataTabInternalState.basemapJoin.unrecognizedTotal = 0;
    replaceJoinLists({
      duplicateEntities: [],
      unrecognizedEntities: [],
      ignoredEntities: [],
      joinMappings: [],
      duplicateLines: []
    });
    notifyPersistence();
  },

  reset(options: ResetDataTabOptions = {}): void {
    restoreFromSerialized(undefined);
    if (options.notify) {
      notifyPersistence(options.priority ?? 'IMMEDIATE');
    }
  }
};

persistenceRegistry.register({
  key: 'dataTab',
  serialize: () => serializeDataTabState(),
  deserialize: (data: unknown) => restoreFromSerialized(data),
  reset: () => restoreFromSerialized(undefined),
  priority: 'debounced'
});
