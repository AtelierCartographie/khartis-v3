export interface ColumnInfo {
  name: string;
  type: 'number' | 'string' | 'date' | 'boolean' | 'geometry';
  nullable: boolean;
  unique: boolean;
  min?: number | string | Date;
  max?: number | string | Date;
  mean?: number;
  sampleValues?: unknown[];
}

export interface GeoColumnInfo {
  index: number;
  columnName: string;
  type:
    | 'latitude'
    | 'longitude'
    | 'country_name'
    | 'iso2'
    | 'iso3'
    | 'region'
    | 'city'
    | 'coordinates'
    | 'location_name'
    | 'unknown';
  confidence: number;
}

export interface AnalysisResult {
  columns: ColumnInfo[];
  geoColumns: GeoColumnInfo[];
  hasGeoData: boolean;
  suggestedGeoColumn?: GeoColumnInfo;
  rowCount: number;
  warnings: string[];
}
