import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import type { JoinEntity, JoinStats } from '$lib/features/data-tab/types';

export type { JoinEntity };
export type JoinQuality = JoinStats;

export type ProjectionType = 'composite' | 'simple' | 'identity';

export interface ProjectionConfig {
  type: ProjectionType;
  preset?: string | null;
  proj4?: string | null;
}

export interface ProjectionPresetEntry {
  id: string;
  proj4: string;
  bounds: [[number, number], [number, number]];
  layout: { x: number; y: number; width: number; height: number };
  scaleMultiplier?: number;
}

export interface ProjectionPreset {
  description_fr?: string;
  description_en?: string;
  entries: ProjectionPresetEntry[];
}

export type ProjectionPresets = Record<string, ProjectionPreset>;

export interface PathStylePreset {
  description_fr?: string;
  description_en?: string;
  layer_type: 'path';
  width: number;
  widthUnits: string;
  color: [number, number, number, number];
}

export interface PolygonStylePreset {
  description_fr?: string;
  description_en?: string;
  layer_type: 'solid-polygon';
  fillColor: [number, number, number, number];
  stroked: boolean;
}

export type StylePreset = PathStylePreset | PolygonStylePreset;

export type StylePresets = Record<string, StylePreset>;

export interface BasemapLayer {
  title_fr?: string;
  title_en?: string;
  type: BasemapLayerType;
  file?: string;
  style?: string | null;
  step?: number;
}

export interface BasemapMetadata {
  file: string;
  title_fr: string;
  title_en: string;
  subtitle_fr?: string;
  subtitle_en?: string;
  description_fr?: string;
  description_en?: string;
  source: string;
  date: string;
  display_id_fr?: string;
  display_id_en?: string;
  bbox: [number, number, number, number];
  proj_source: string;
  proj_to: ProjectionConfig;
  simplification_level?: string;
  layers: BasemapLayer[];
  isCustom?: boolean;
}

export interface BasemapSuggestion extends BasemapMetadata {
  matchScore: number;
  matchReason: string;
}
