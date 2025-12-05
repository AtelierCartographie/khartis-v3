export interface DataControlState {
  selectedRowIds: (string | number)[];
  expandedRowIds: (string | number)[];
  searchQuery: string;
  filterActive: boolean;
  tableView: 'compact' | 'expanded';
}

export interface GeolocationState {
  geoReference: 'entities' | 'coordinates' | 'custom';
  linkedVariable: number | null;
  linkedVariableName: string;
  latitudeColumn?: string;
  longitudeColumn?: string;
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

export interface EnrichDataState {
  enrichmentDatasetId?: string;
  enrichmentColumn?: string;
  targetColumn?: string;
  isEnrichmentActive: boolean;
}

export interface DataTabState {
  dataControl: DataControlState;
  geolocation: GeolocationState;
  basemapJoin: BasemapJoinState;
  enrichData: EnrichDataState;
  notifications: {
    variableTypes: boolean;
    warnings: boolean;
  };
}
