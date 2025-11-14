export interface BasemapLayer {
  title?: string;
  name: string;
  type: 'centroid' | 'limit' | 'polygon' | 'line' | 'point';
  file?: string;
  count?: number;
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
  isCustom?: boolean;
}

export interface BasemapAttribute {
  raw: string;
  id: string;
  variant: string;
  normalized: string;
  basemap: string;
  basemap_count: number;
}

export interface BasemapSuggestion extends BasemapMetadata {
  matchScore: number;
  matchReason: string;
}

export interface JoinMapping {
  dataColumn: string;
  basemapColumn: string;
}

export interface JoinEntity {
  dataValue: string;
  basemapValue?: string;
  status: 'joined' | 'to_verify' | 'duplicate' | 'unrecognized';
  matches?: string[];
  matchCount?: number;
}

export interface JoinQuality {
  joinedCount: number;
  toVerifyCount: number;
  duplicateCount: number;
  unrecognizedCount: number;
  entities: JoinEntity[];
  totalEntities: number;
}

export interface BasemapCatalog {
  basemaps: BasemapMetadata[];
  version: string;
}
