export interface DataControlState {
  selectedRowIds: (string | number)[];
  expandedRowIds: (string | number)[];
  searchQuery: string;
  filterActive: boolean;
  tableView: 'compact' | 'expanded';
}

export interface GeolocationState {
  geoReference: 'admin' | 'places' | 'custom';
  linkedVariable: number | null;
  linkedVariableName: string;
  autoDetected: boolean;
}

export interface BasemapJoinState {
  selectedBasemap: string;
  basemapSource: 'catalog' | 'import' | 'osm';
  joinedEntities: number;
  entitiesToVerify: number;
  duplicateEntities: string[];
  unrecognizedEntities: string[];
  joinMappings: Array<{
    dataValue: string;
    basemapOptions: string[];
    selectedMapping: string;
  }>;
  correctionEnabled: boolean;
}

export interface DataTabState {
  dataControl: DataControlState;
  geolocation: GeolocationState;
  basemapJoin: BasemapJoinState;
  notifications: {
    variableTypes: boolean;
    warnings: boolean;
  };
}
