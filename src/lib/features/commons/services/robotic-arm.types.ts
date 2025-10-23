export enum RoboticArmCommand {
  SELECT_DATASET = 'SELECT_DATASET',
  RENAME_DATASET = 'RENAME_DATASET',
  RESET_DATASET = 'RESET_DATASET',
  LIST_DATASETS = 'LIST_DATASETS',
  AUTO_DETECT_GEO = 'AUTO_DETECT_GEO',
  CONFIGURE_GEOLOCATION = 'CONFIGURE_GEOLOCATION',
  SUGGEST_BASEMAP = 'SUGGEST_BASEMAP',
  SELECT_BASEMAP = 'SELECT_BASEMAP',
  AUTO_JOIN_BASEMAP = 'AUTO_JOIN_BASEMAP',
  APPLY_JOIN_CORRECTIONS = 'APPLY_JOIN_CORRECTIONS',
  GET_JOIN_STATS = 'GET_JOIN_STATS',
  AUTO_CONFIGURE_PIPELINE = 'AUTO_CONFIGURE_PIPELINE'
}

export enum RoboticArmStatus {
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  WARNING = 'WARNING',
  INFO = 'INFO'
}

export interface RoboticArmResult<T = unknown> {
  status: RoboticArmStatus;
  message: string;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface DatasetInfo {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  hasGeometry: boolean;
  isSelected: boolean;
  hasModifications: boolean;
}

export interface GeoDetectionResult {
  hasGeoColumns: boolean;
  detectedType?: 'coordinates' | 'location_name' | 'geo_code';
  latitudeColumn?: string;
  longitudeColumn?: string;
  locationColumn?: string;
  geoCodeColumn?: string;
  geoCodePattern?: string;
}

export interface BasemapSuggestion {
  basemapFile: string;
  basemapTitle: string;
  matchScore: number;
  description: string;
}

export interface JoinStatistics {
  joinedEntities: number;
  entitiesToVerify: number;
  duplicateEntities: string[];
  unrecognizedEntities: string[];
  totalEntities: number;
  successRate: number;
  hasErrors: boolean;
}

export interface AutoConfigurationResult {
  datasetSelected: boolean;
  geoDetected: boolean;
  geoType?: 'coordinates' | 'location_name' | 'geo_code';
  basemapSuggested: boolean;
  basemapSelected?: string;
  basemapJoined: boolean;
  joinStats?: JoinStatistics;
  warnings: string[];
}
