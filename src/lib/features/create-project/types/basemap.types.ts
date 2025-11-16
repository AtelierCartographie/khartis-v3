import type {
  BasemapLayer as MapBasemapLayer,
  BasemapMetadata as MapBasemapMetadata
} from '$lib/features/map/types/basemap.types';

export type BasemapLayer = MapBasemapLayer;
export type BasemapMetadata = MapBasemapMetadata;

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
