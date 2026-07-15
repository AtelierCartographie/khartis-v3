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

export interface JoinedEntity {
  dataValue: string;
  basemapValue: string;
  otherIdentifiers?: string[];
}

export interface JoinCandidate {
  id: string;
  name: string;
  score: number;
  type: 'exact' | 'partial';
  variant: string | null;
}

export interface IgnoredEntity {
  dataValue: string;
  basemapValue?: string;
  source: 'joined' | 'to_verify' | 'unrecognized';
  lines?: number[];
}

export interface JoinMapping {
  dataValue: string;
  basemapOptions: string[];
  selectedMapping: string;
  candidates?: JoinCandidate[];
}

export interface DuplicateLineReference {
  dataValue: string;
  lines: number[];
}

export interface BasemapJoinState {
  selectedBasemap: string;
  basemapSource: BasemapSource;
  joinedEntities: number;
  entitiesToVerify: number;
  duplicateEntities: string[];
  duplicateTotal: number;
  unrecognizedEntities: string[];
  unrecognizedTotal: number;
  ignoredEntities: IgnoredEntity[];
  joinMappings: JoinMapping[];
  duplicateLines: DuplicateLineReference[];
}

export interface EnrichDataState {
  enrichmentDatasetId?: string;
  enrichmentColumn?: string;
  targetColumn?: string;
  isEnrichmentActive: boolean;
  joinTabularEnabled: boolean;
  overlayBasemapEnabled: boolean;
  basemapTabIndex: number;
  preferredOverlayBasemapId?: string;
  preferredOverlayBasemapSource?: BasemapSource;
}

export interface DataTabUiPanelsState {
  enrichJoinTabularOpen: boolean;
  enrichOverlayBasemapOpen: boolean;
  enrichBasemapSuggestionsOpen?: boolean;
  enrichBasemapCatalogOpen?: boolean;
}

export interface DataTabState {
  dataControl: DataControlState;
  geolocation: GeolocationState;
  basemapJoin: BasemapJoinState;
  enrichData: EnrichDataState;
  uiPanels: DataTabUiPanelsState;
  notifications: {
    variableTypes: boolean;
    warnings: boolean;
  };
}

export interface SerializedBasemapJoinState {
  joinedEntities: number;
  duplicateEntities: string[];
  duplicateTotal: number;
  unrecognizedEntities: string[];
  unrecognizedTotal: number;
  ignoredEntities: IgnoredEntity[];
  joinMappings: JoinMapping[];
}

export interface SerializedDataTabState extends Omit<
  DataTabState,
  'basemapJoin'
> {
  basemapJoin: SerializedBasemapJoinState;
}
