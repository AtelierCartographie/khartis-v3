import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import type {
  JoinEntity,
  JoinStats
} from '$lib/features/main-toolbar/data-tab/components/join-accordion.types';

export type { JoinEntity };
export type JoinQuality = JoinStats;

export interface BasemapLayer {
  title?: string;
  name: string;
  type: BasemapLayerType;
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

export interface BasemapCatalog {
  basemaps: BasemapMetadata[];
  version: string;
}
