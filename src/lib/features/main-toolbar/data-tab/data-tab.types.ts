import {
  BasemapSource,
  GeoreferenceType,
  TableViewType
} from '$lib/features/commons/constants/ui.constants';

export enum DataToolType {
  None = 'none',
  Search = 'search',
  Filters = 'filters',
  Calculator = 'calculator'
}

export interface DataControlState {
  selectedRowIds: (string | number)[];
  expandedRowIds: (string | number)[];
  searchQuery: string;
  filterActive: boolean;
  tableView: TableViewType;
}

export interface GeolocationState {
  geoReference: GeoreferenceType;
  linkedVariable: number | null;
  linkedVariableName: string;
  autoDetected: boolean;
}

export interface BasemapJoinState {
  selectedBasemap: string;
  basemapSource: BasemapSource;
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
