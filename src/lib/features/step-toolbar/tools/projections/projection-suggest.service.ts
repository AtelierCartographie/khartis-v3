import {
  suggest_projections,
  validate_bbox,
  type BBox,
  type D3Usage,
  type MatchedCountry,
  type ResolvedProjection
} from 'proj-suggest';
import type { GeoProjection } from 'd3-geo';
import { proj4d3 } from '$lib/features/map/utils/proj4d3.utils';
import { buildD3ProjectionFromConfig } from '$lib/features/commons/utils/d3-projection-config.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

export interface ProjectionSuggestion {
  id: string;
  name: string;
  type: 'national' | 'generic';
  equalArea?: boolean;
  epsg?: string;
  share?: number;
  proj4String: string | null;
  d3Config: D3Usage | null;
  bbox: [number, number, number, number];
  scale?: string[];
  shape?: string;
}

export interface BuiltProjectionSuggestion {
  projection: GeoProjection;
  source: 'proj4' | 'd3';
}

const UNSUPPORTED_SUGGESTION_IDS = new Set(['orthographic']);

function isUsableProjection(projection: GeoProjection): boolean {
  const projected = projection([0, 0]);
  return (
    Array.isArray(projected) &&
    projected.length >= 2 &&
    projected.every(Number.isFinite)
  );
}

function nationalToSuggestion(
  country: MatchedCountry,
  bbox: [number, number, number, number]
): ProjectionSuggestion {
  return {
    id: `national-${country.id}`,
    name: country.projection,
    type: 'national',
    epsg: country.epsg,
    share: country.share,
    proj4String: country.proj4,
    d3Config: country.d3,
    bbox
  };
}

function genericToSuggestion(
  proj: ResolvedProjection,
  bbox: [number, number, number, number]
): ProjectionSuggestion {
  return {
    id: proj.id,
    name: proj.name ?? proj.id,
    type: 'generic',
    equalArea: proj.equalarea,
    proj4String: proj.proj4?.string ?? null,
    d3Config: proj.d3 ?? null,
    bbox,
    scale: proj.scale,
    shape: proj.shape
  };
}

function isSupportedProjectionSuggestion(
  suggestion: ProjectionSuggestion
): boolean {
  if (UNSUPPORTED_SUGGESTION_IDS.has(suggestion.id.toLowerCase())) {
    return false;
  }

  if (suggestion.d3Config?.projection === 'geoOrthographic') {
    return false;
  }

  return !/\+proj=ortho\b/i.test(suggestion.proj4String ?? '');
}

function buildD3SuggestionProjection(
  suggestion: ProjectionSuggestion
): BuiltProjectionSuggestion | null {
  if (!suggestion.d3Config) {
    return null;
  }

  const projection = buildD3ProjectionFromConfig(suggestion.d3Config);
  if (!projection) {
    return null;
  }

  return {
    projection,
    source: 'd3'
  };
}

export function suggestProjectionsForBbox(
  bbox: [number, number, number, number]
): {
  national: ProjectionSuggestion[];
  generic: ProjectionSuggestion[];
} | null {
  const bboxInput: BBox = bbox;
  const validation = validate_bbox(bboxInput);
  if (!validation.valid) {
    return null;
  }

  const result = suggest_projections(bboxInput);

  return {
    national: result.national
      .map((country) => nationalToSuggestion(country, bbox))
      .filter(isSupportedProjectionSuggestion),
    generic: result.generic
      .map((projection) => genericToSuggestion(projection, bbox))
      .filter(isSupportedProjectionSuggestion)
  };
}

export function buildProjectionFromSuggestion(
  suggestion: ProjectionSuggestion
): BuiltProjectionSuggestion | null {
  if (!isSupportedProjectionSuggestion(suggestion)) {
    return null;
  }

  if (suggestion.type === 'generic') {
    const d3Projection = buildD3SuggestionProjection(suggestion);
    if (d3Projection) {
      return d3Projection;
    }
  }

  if (suggestion.proj4String) {
    try {
      const projection = proj4d3(suggestion.proj4String);
      if (isUsableProjection(projection)) {
        return {
          projection,
          source: 'proj4'
        };
      }
    } catch (err) {
      logger.error(
        'Failed to build proj4 projection suggestion',
        LogCategory.MAP,
        err
      );
    }
  }

  const d3Projection = buildD3SuggestionProjection(suggestion);
  if (d3Projection) {
    return d3Projection;
  }

  return null;
}
