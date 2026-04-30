import {
  suggest_projections,
  validate_bbox,
  type BBox,
  type D3Usage,
  type MatchedCountry,
  type ResolvedProjection
} from 'proj-suggest';
import type { GeoProjection } from 'd3-geo';
import { proj4d3 } from '$lib/features/map/utils/proj4d3';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { buildD3ProjectionFromConfig } from '$lib/features/commons/utils/d3-projection-config.utils';

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
    logger.warn('Unknown d3 projection factory', LogCategory.MAP, {
      id: suggestion.id,
      bbox: suggestion.bbox,
      d3Projection: suggestion.d3Config.projection
    });
    return null;
  }

  return {
    projection,
    source: 'd3'
  };
}

/**
 * Returns ranked projection suggestions for a given dataset bbox, per
 * CDC [VIZ-TOOLS-c] ("Algorithme basé sur emprise géographique").
 *
 * Delegates to `proj-suggest`, the official Atelier de cartographie library
 * (Thomas Ansart) — a reimplementation of Snyder (1987) / Šavrič et al. (2016)
 * cartographic decision tree. We do not re-rank here: `result.national` is
 * already sorted by share of the bbox covered by the country/zone, and
 * `result.generic` is sorted by suitability for the bbox extent.
 *
 * Returns null when the bbox is invalid (e.g. zero width, off-globe). Otherwise
 * returns two parallel lists; the auto-selection layer prefers `national`
 * because the CDC reserves that category for officially endorsed CRSes per zone
 * (Lambert-93 for France, ETRS89-LAEA for Europe, etc.).
 */
export function suggestProjectionsForBbox(
  bbox: [number, number, number, number]
): {
  national: ProjectionSuggestion[];
  generic: ProjectionSuggestion[];
} | null {
  const bboxInput: BBox = bbox;
  const validation = validate_bbox(bboxInput);
  if (!validation.valid) {
    logger.warn('Invalid bbox for projection suggestion', LogCategory.MAP, {
      bbox,
      errors: validation.errors
    });
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
    logger.warn('Unsupported projection suggestion skipped', LogCategory.MAP, {
      id: suggestion.id
    });
    return null;
  }

  if (suggestion.type === 'generic') {
    const d3Projection = buildD3SuggestionProjection(suggestion);
    if (d3Projection) {
      return d3Projection;
    }
  }

  // Prefer proj4 string when available (more precise for national projections)
  if (suggestion.proj4String) {
    try {
      const projection = proj4d3(suggestion.proj4String);
      if (isUsableProjection(projection)) {
        return {
          projection,
          source: 'proj4'
        };
      }
      logger.warn(
        'Proj4 suggestion produced invalid coordinates, falling back to d3',
        LogCategory.MAP,
        {
          id: suggestion.id,
          epsg: suggestion.epsg,
          bbox: suggestion.bbox,
          d3Projection: suggestion.d3Config?.projection
        }
      );
    } catch (err) {
      logger.warn(
        'Failed to build projection from proj4 string, falling back to d3',
        LogCategory.MAP,
        {
          id: suggestion.id,
          epsg: suggestion.epsg,
          bbox: suggestion.bbox,
          d3Projection: suggestion.d3Config?.projection,
          error: err
        }
      );
    }
  }

  const d3Projection = buildD3SuggestionProjection(suggestion);
  if (d3Projection) {
    return d3Projection;
  }

  return null;
}
