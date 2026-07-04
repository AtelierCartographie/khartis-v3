import {
  BasemapSource,
  GeoreferenceType,
  JoinStatus,
  TableViewType
} from '$lib/features/commons/constants/ui.constants';
import {
  SavePriority,
  persistenceRegistry
} from '$lib/features/project-management/core';
import { createReadonlyStateFacade } from '../utils/store.utils.svelte';
import type { JoinQuality } from '$lib/features/map/types/basemap.types';
import type {
  BasemapJoinState,
  DataTabState,
  IgnoredEntity,
  JoinedEntity,
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

const dataTabInternalState = $state<DataTabState>(
  structuredClone(DEFAULT_STATE)
);

export const dataTabState = createReadonlyStateFacade(dataTabInternalState);

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

function restoreJoinedEntities(value: unknown): JoinedEntity[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): JoinedEntity[] => {
    if (
      !isRecord(item) ||
      typeof item.dataValue !== 'string' ||
      typeof item.basemapValue !== 'string'
    ) {
      return [];
    }

    const entity: JoinedEntity = {
      dataValue: item.dataValue,
      basemapValue: item.basemapValue
    };

    if (Array.isArray(item.otherIdentifiers)) {
      entity.otherIdentifiers = restoreStringArray(item.otherIdentifiers);
    }

    return [entity];
  });
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

function restoreJoinMappings(value: unknown): BasemapJoinState['joinMappings'] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): BasemapJoinState['joinMappings'] => {
    if (
      !isRecord(item) ||
      typeof item.dataValue !== 'string' ||
      typeof item.selectedMapping !== 'string' ||
      !Array.isArray(item.basemapOptions)
    ) {
      return [];
    }

    return [
      {
        dataValue: item.dataValue,
        basemapOptions: restoreStringArray(item.basemapOptions),
        selectedMapping: item.selectedMapping
      }
    ];
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

  nextState.basemapJoin.duplicateEntities = restoreStringArray(
    basemapJoin.duplicateEntities
  );
  nextState.basemapJoin.unrecognizedEntities = restoreStringArray(
    basemapJoin.unrecognizedEntities
  );
  nextState.basemapJoin.joinedEntitiesList = restoreJoinedEntities(
    basemapJoin.joinedEntitiesList
  );
  nextState.basemapJoin.ignoredEntities = restoreIgnoredEntities(
    basemapJoin.ignoredEntities
  );
  nextState.basemapJoin.joinMappings = restoreJoinMappings(
    basemapJoin.joinMappings
  );

  if (typeof basemapJoin.selectedBasemap === 'string') {
    nextState.basemapJoin.selectedBasemap = basemapJoin.selectedBasemap;
  }
  if (isBasemapSource(basemapJoin.basemapSource)) {
    nextState.basemapJoin.basemapSource = basemapJoin.basemapSource;
  }

  nextState.basemapJoin = recomputeBasemapJoinCounters(nextState.basemapJoin);
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

function recomputeBasemapJoinCounters(
  basemapJoin: BasemapJoinState
): BasemapJoinState {
  return {
    ...basemapJoin,
    joinedEntities: basemapJoin.joinedEntitiesList.length,
    entitiesToVerify: basemapJoin.joinMappings.length
  };
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

  Object.assign(dataTabInternalState, nextState);
}

function serializeDataTabState(): SerializedDataTabState {
  return {
    dataControl: { ...dataTabInternalState.dataControl },
    geolocation: { ...dataTabInternalState.geolocation },
    basemapJoin: {
      duplicateEntities: [
        ...dataTabInternalState.basemapJoin.duplicateEntities
      ],
      unrecognizedEntities: [
        ...dataTabInternalState.basemapJoin.unrecognizedEntities
      ],
      joinedEntitiesList:
        dataTabInternalState.basemapJoin.joinedEntitiesList.map((entity) => ({
          ...entity
        })),
      ignoredEntities: dataTabInternalState.basemapJoin.ignoredEntities.map(
        (entity) => ({ ...entity })
      ),
      joinMappings: dataTabInternalState.basemapJoin.joinMappings.map(
        (mapping) => ({
          dataValue: mapping.dataValue,
          basemapOptions: [...mapping.basemapOptions],
          selectedMapping: mapping.selectedMapping
        })
      )
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
    dataTabInternalState.basemapJoin.duplicateEntities.length === 0 &&
    dataTabInternalState.basemapJoin.unrecognizedEntities.length === 0 &&
    dataTabInternalState.basemapJoin.joinedEntitiesList.length === 0 &&
    dataTabInternalState.basemapJoin.ignoredEntities.length === 0 &&
    dataTabInternalState.basemapJoin.joinMappings.length === 0 &&
    dataTabInternalState.basemapJoin.duplicateLines.length === 0
  );
}

export const dataTabActions = {
  setDataControlState(updates: Partial<DataTabState['dataControl']>): void {
    Object.assign(dataTabInternalState.dataControl, updates);
    notifyPersistence('IMMEDIATE');
  },

  setGeolocationState(updates: Partial<DataTabState['geolocation']>): void {
    Object.assign(dataTabInternalState.geolocation, updates);
    notifyPersistence('IMMEDIATE');
  },

  setBasemapJoinState(updates: Partial<DataTabState['basemapJoin']>): void {
    Object.assign(dataTabInternalState.basemapJoin, updates);
    notifyPersistence('IMMEDIATE');
  },

  setEnrichDataState(updates: Partial<DataTabState['enrichData']>): void {
    Object.assign(dataTabInternalState.enrichData, updates);
    notifyPersistence('IMMEDIATE');
  },

  setUiPanelsState(updates: Partial<DataTabState['uiPanels']>): void {
    Object.assign(dataTabInternalState.uiPanels, updates);
    notifyPersistence('IMMEDIATE');
  },

  setJoinStats(stats: JoinQuality): void {
    const ignoredKeys = new Set(
      dataTabInternalState.basemapJoin.ignoredEntities.map((e) => e.dataValue)
    );

    const entities = (stats.entities ?? []).filter(
      (e) => !ignoredKeys.has(e.dataValue)
    );

    dataTabInternalState.basemapJoin.joinedEntitiesList = entities
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

    dataTabInternalState.basemapJoin.duplicateEntities = entities
      .filter((e) => e.status === JoinStatus.DUPLICATE)
      .map((e) => e.dataValue);

    dataTabInternalState.basemapJoin.duplicateLines =
      stats.duplicateLines ?? [];

    dataTabInternalState.basemapJoin.unrecognizedEntities = entities
      .filter((e) => e.status === JoinStatus.UNRECOGNIZED)
      .map((e) => e.dataValue);

    dataTabInternalState.basemapJoin.joinMappings = entities
      .filter((e) => e.status === JoinStatus.TO_VERIFY)
      .map((e) => ({
        dataValue: e.dataValue,
        basemapOptions: e.matches || [],
        selectedMapping: e.matches && e.matches.length > 0 ? e.matches[0] : ''
      }));

    dataTabInternalState.basemapJoin.joinedEntities =
      dataTabInternalState.basemapJoin.joinedEntitiesList.length;
    dataTabInternalState.basemapJoin.entitiesToVerify =
      dataTabInternalState.basemapJoin.joinMappings.length;

    notifyPersistence('IMMEDIATE');
  },

  updateJoinMapping(index: number, selectedMapping: string): void {
    if (dataTabInternalState.basemapJoin.joinMappings[index]) {
      dataTabInternalState.basemapJoin.joinMappings[index].selectedMapping =
        selectedMapping;
      notifyPersistence('IMMEDIATE');
    }
  },

  ignoreEntity(entity: IgnoredEntity): void {
    if (
      dataTabInternalState.basemapJoin.ignoredEntities.some(
        (existing) => existing.dataValue === entity.dataValue
      )
    ) {
      return;
    }

    dataTabInternalState.basemapJoin.joinedEntitiesList =
      dataTabInternalState.basemapJoin.joinedEntitiesList.filter(
        (e) => e.dataValue !== entity.dataValue
      );
    dataTabInternalState.basemapJoin.joinMappings =
      dataTabInternalState.basemapJoin.joinMappings.filter(
        (e) => e.dataValue !== entity.dataValue
      );
    dataTabInternalState.basemapJoin.unrecognizedEntities =
      dataTabInternalState.basemapJoin.unrecognizedEntities.filter(
        (value) => value !== entity.dataValue
      );
    dataTabInternalState.basemapJoin.ignoredEntities = [
      ...dataTabInternalState.basemapJoin.ignoredEntities,
      { ...entity }
    ];
    dataTabInternalState.basemapJoin.joinedEntities =
      dataTabInternalState.basemapJoin.joinedEntitiesList.length;
    dataTabInternalState.basemapJoin.entitiesToVerify =
      dataTabInternalState.basemapJoin.joinMappings.length;

    notifyPersistence('IMMEDIATE');
  },

  restoreEntity(dataValue: string): void {
    const exists = dataTabInternalState.basemapJoin.ignoredEntities.some(
      (e) => e.dataValue === dataValue
    );
    if (!exists) return;

    dataTabInternalState.basemapJoin.ignoredEntities =
      dataTabInternalState.basemapJoin.ignoredEntities.filter(
        (e) => e.dataValue !== dataValue
      );

    if (
      !dataTabInternalState.basemapJoin.unrecognizedEntities.includes(dataValue)
    ) {
      dataTabInternalState.basemapJoin.unrecognizedEntities = [
        ...dataTabInternalState.basemapJoin.unrecognizedEntities,
        dataValue
      ];
    }

    notifyPersistence('IMMEDIATE');
  },

  promoteToJoined(dataValue: string, basemapValue: string): void {
    dataTabInternalState.basemapJoin.joinMappings =
      dataTabInternalState.basemapJoin.joinMappings.filter(
        (e) => e.dataValue !== dataValue
      );
    dataTabInternalState.basemapJoin.unrecognizedEntities =
      dataTabInternalState.basemapJoin.unrecognizedEntities.filter(
        (value) => value !== dataValue
      );

    if (
      !dataTabInternalState.basemapJoin.joinedEntitiesList.some(
        (e) => e.dataValue === dataValue
      )
    ) {
      dataTabInternalState.basemapJoin.joinedEntitiesList = [
        ...dataTabInternalState.basemapJoin.joinedEntitiesList,
        { dataValue, basemapValue }
      ];
    }

    dataTabInternalState.basemapJoin.joinedEntities =
      dataTabInternalState.basemapJoin.joinedEntitiesList.length;
    dataTabInternalState.basemapJoin.entitiesToVerify =
      dataTabInternalState.basemapJoin.joinMappings.length;

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
    notifyPersistence('IMMEDIATE');
  },

  setBasemapSource(source: BasemapSource): void {
    dataTabInternalState.basemapJoin.basemapSource = source;
    notifyPersistence('IMMEDIATE');
  },

  clearJoinStats(): void {
    if (areJoinStatsEmpty()) {
      return;
    }

    dataTabInternalState.basemapJoin.joinedEntities = 0;
    dataTabInternalState.basemapJoin.entitiesToVerify = 0;
    dataTabInternalState.basemapJoin.duplicateEntities = [];
    dataTabInternalState.basemapJoin.unrecognizedEntities = [];
    dataTabInternalState.basemapJoin.joinedEntitiesList = [];
    dataTabInternalState.basemapJoin.ignoredEntities = [];
    dataTabInternalState.basemapJoin.joinMappings = [];
    dataTabInternalState.basemapJoin.duplicateLines = [];
    notifyPersistence('IMMEDIATE');
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
