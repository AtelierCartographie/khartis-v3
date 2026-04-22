import {
  BasemapSource,
  GeoreferenceType,
  TableViewType
} from '$lib/features/commons/constants/ui.constants';

export interface DataControlState {
  expandedRowIds: (string | number)[];
  searchQuery: string;
  filterActive: boolean;
  tableView: TableViewType;
  showSummaryPlots: boolean;
  sortColumn: string | null;
  sortOrder: 'ASC' | 'DESC' | null;
}

export interface GeolocationState {
  geoReference: GeoreferenceType;
  linkedVariable: number | null;
  linkedVariableName: string;
  latitudeColumn?: string;
  longitudeColumn?: string;
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
}

export interface EnrichDataState {
  enrichmentDatasetId?: string;
  enrichmentColumn?: string;
  targetColumn?: string;
  isEnrichmentActive: boolean;
  joinTabularEnabled: boolean;
  basemapTabIndex: number;
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

export type SerializedBasemapJoinState = Omit<
  BasemapJoinState,
  'selectedBasemap' | 'basemapSource'
>;

export interface SerializedDataTabState extends Omit<
  DataTabState,
  'basemapJoin'
> {
  basemapJoin: SerializedBasemapJoinState;
}
