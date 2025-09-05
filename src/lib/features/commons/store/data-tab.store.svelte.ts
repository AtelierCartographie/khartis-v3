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
    geoReference: 'admin',
    linkedVariable: 0,
    linkedVariableName: 'Nom pays',
    autoDetected: true
  },
  basemapJoin: {
    selectedBasemap: 'world-admin',
    basemapSource: 'catalog',
    joinedEntities: 24,
    entitiesToVerify: 3,
    duplicateEntities: ['Congo', 'Guinée'],
    unrecognizedEntities: ['Abcdland', 'Foo Republic'],
    joinMappings: [
      {
        dataValue: 'Beglique',
        basemapOptions: ['Belgique', 'Belize', 'Bénin'],
        selectedMapping: 'Belgique'
      },
      {
        dataValue: 'Epsagne',
        basemapOptions: ['Espagne', 'Estonie'],
        selectedMapping: 'Espagne'
      },
      {
        dataValue: 'Lux.',
        basemapOptions: ['Luxembourg'],
        selectedMapping: 'Luxembourg'
      }
    ],
    correctionEnabled: false
  },
  notifications: {
    variableTypes: true,
    warnings: true
  }
};

export const dataTabState = $state<DataTabState>({ ...DEFAULT_STATE });

export const dataTabActions = {
  setDataControlState(updates: Partial<DataTabState['dataControl']>): void {
    Object.assign(dataTabState.dataControl, updates);
    console.log('[DataTab] 🔄 Data control updated:', updates);
  },

  setGeolocationState(updates: Partial<DataTabState['geolocation']>): void {
    Object.assign(dataTabState.geolocation, updates);
    console.log('[DataTab] 🔄 Geolocation updated:', updates);
  },

  setBasemapJoinState(updates: Partial<DataTabState['basemapJoin']>): void {
    Object.assign(dataTabState.basemapJoin, updates);
    console.log('[DataTab] 🔄 Basemap join updated:', updates);
  },

  updateJoinMapping(index: number, selectedMapping: string): void {
    if (dataTabState.basemapJoin.joinMappings[index]) {
      dataTabState.basemapJoin.joinMappings[index].selectedMapping =
        selectedMapping;
      console.log('[DataTab] 🔄 Join mapping updated:', {
        index,
        selectedMapping
      });
    }
  },

  toggleNotification(type: 'variableTypes' | 'warnings'): void {
    dataTabState.notifications[type] = !dataTabState.notifications[type];
    console.log('[DataTab] 🔄 Notification toggled:', type);
  },

  selectRows(ids: (string | number)[]): void {
    dataTabState.dataControl.selectedRowIds = ids;
    console.log('[DataTab] 🔄 Rows selected:', ids);
  },

  expandRows(ids: (string | number)[]): void {
    dataTabState.dataControl.expandedRowIds = ids;
    console.log('[DataTab] 🔄 Rows expanded:', ids);
  },

  setSearch(query: string): void {
    dataTabState.dataControl.searchQuery = query;
    console.log('[DataTab] 🔄 Search query updated:', query);
  },

  toggleFilter(): void {
    dataTabState.dataControl.filterActive =
      !dataTabState.dataControl.filterActive;
    console.log(
      '[DataTab] 🔄 Filter toggled:',
      dataTabState.dataControl.filterActive
    );
  },

  selectBasemap(basemapId: string): void {
    dataTabState.basemapJoin.selectedBasemap = basemapId;
    console.log('[DataTab] 🔄 Basemap selected:', basemapId);
  },

  setBasemapSource(source: 'catalog' | 'import' | 'osm'): void {
    dataTabState.basemapJoin.basemapSource = source;
    console.log('[DataTab] 🔄 Basemap source changed:', source);
  },

  applyCorrections(): void {
    dataTabState.basemapJoin.correctionEnabled = true;
    console.log('[DataTab] ✅ Corrections applied');
  },

  reset(): void {
    Object.assign(dataTabState, DEFAULT_STATE);
    console.log('[DataTab] 🔄 State reset to default');
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
  return (
    dataTabState.geolocation.linkedVariable !== null &&
    dataTabState.basemapJoin.selectedBasemap !== ''
  );
}
