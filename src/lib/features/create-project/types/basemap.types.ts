export interface BasemapLayer {
  title: string;
  type: 'centroid' | 'limit';
  file: string;
}

export interface BasemapMetadata {
  file: string;
  title: string;
  description: string;
  source: string;
  date: string;
  bbox: [number, number, number, number];
  projection: string;
  layers: BasemapLayer[];
}

export interface BasemapMatchResult {
  basemap: BasemapMetadata;
  matchScore: number;
  matchedEntities: number;
  totalEntities: number;
  matchPercentage: number;
}

export interface GeoColumnDetection {
  hasGeoColumns: boolean;
  latitudeColumn?: string;
  longitudeColumn?: string;
  locationColumn?: string;
  geoCodeColumn?: string;
  detectedType?: 'coordinates' | 'location_name' | 'geo_code';
}

export interface JoinCategory {
  type: 'joined' | 'to_verify' | 'non_unique' | 'not_recognized';
  count: number;
  entities: JoinEntity[];
}

export interface JoinEntity {
  dataValue: string;
  basemapValue?: string;
  confidence: number;
  suggestions?: string[];
}

export interface JoinAssistanceResult {
  categories: {
    joined: JoinCategory;
    toVerify: JoinCategory;
    nonUnique: JoinCategory;
    notRecognized: JoinCategory;
  };
  totalDataEntities: number;
  totalBasemapEntities: number;
  joinColumn: string;
  basemapColumn: string;
}
