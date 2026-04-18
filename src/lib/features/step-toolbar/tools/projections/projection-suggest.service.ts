import {
  suggest_projections,
  validate_bbox,
  type BBox,
  type D3Usage,
  type MatchedCountry,
  type ResolvedProjection
} from 'proj-suggest';
import type { GeoProjection } from 'd3-geo';
import * as d3geo from 'd3-geo';
import * as d3geoProjection from 'd3-geo-projection';
import { proj4d3 } from '$lib/features/map/utils/proj4d3';
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
  scale?: string[];
  shape?: string;
}

export interface BuiltProjectionSuggestion {
  projection: GeoProjection;
  source: 'proj4' | 'd3';
}

const D3_FACTORY_MAP: Record<string, (() => GeoProjection) | undefined> = {
  geoMercator: d3geo.geoMercator,
  geoEquirectangular: d3geo.geoEquirectangular,
  geoAlbers: d3geo.geoAlbers,
  geoOrthographic: d3geo.geoOrthographic,
  geoStereographic: d3geo.geoStereographic,
  geoEqualEarth: d3geo.geoEqualEarth,
  geoAzimuthalEqualArea: d3geo.geoAzimuthalEqualArea,
  geoAzimuthalEquidistant: d3geo.geoAzimuthalEquidistant,
  geoConicConformal: d3geo.geoConicConformal,
  geoConicEqualArea: d3geo.geoConicEqualArea,
  geoConicEquidistant: d3geo.geoConicEquidistant,
  geoTransverseMercator: d3geo.geoTransverseMercator,
  geoNaturalEarth1: d3geo.geoNaturalEarth1,
  geoGnomonic: d3geo.geoGnomonic,
  geoBonne: (d3geoProjection as Record<string, unknown>).geoBonne as
    | (() => GeoProjection)
    | undefined,
  geoCassini: (d3geoProjection as Record<string, unknown>).geoCassini as
    | (() => GeoProjection)
    | undefined,
  geoTimes: (d3geoProjection as Record<string, unknown>).geoTimes as
    | (() => GeoProjection)
    | undefined,
  geoBertin1953: (d3geoProjection as Record<string, unknown>).geoBertin1953 as
    | (() => GeoProjection)
    | undefined,
  geoArmadillo: (d3geoProjection as Record<string, unknown>).geoArmadillo as
    | (() => GeoProjection)
    | undefined,
  geoMollweide: (d3geoProjection as Record<string, unknown>).geoMollweide as
    | (() => GeoProjection)
    | undefined,
  geoInterruptedMollweide: (d3geoProjection as Record<string, unknown>)
    .geoInterruptedMollweide as (() => GeoProjection) | undefined,
  geoInterruptedMollweideHemispheres: (
    d3geoProjection as Record<string, unknown>
  ).geoInterruptedMollweideHemispheres as (() => GeoProjection) | undefined,
  geoAirocean: (d3geoProjection as Record<string, unknown>).geoAirocean as
    | (() => GeoProjection)
    | undefined,
  geoImago: (d3geoProjection as Record<string, unknown>).geoImago as
    | (() => GeoProjection)
    | undefined,
  geoCylindricalEqualArea: (d3geoProjection as Record<string, unknown>)
    .geoCylindricalEqualArea as (() => GeoProjection) | undefined,
  geoRobinson: (d3geoProjection as Record<string, unknown>).geoRobinson as
    | (() => GeoProjection)
    | undefined
};

function nationalToSuggestion(country: MatchedCountry): ProjectionSuggestion {
  return {
    id: `national-${country.id}`,
    name: country.projection,
    type: 'national',
    epsg: country.epsg,
    share: country.share,
    proj4String: country.proj4,
    d3Config: country.d3
  };
}

function genericToSuggestion(proj: ResolvedProjection): ProjectionSuggestion {
  return {
    id: proj.id,
    name: proj.name ?? proj.id,
    type: 'generic',
    equalArea: proj.equalarea,
    proj4String: proj.proj4?.string ?? null,
    d3Config: proj.d3 ?? null,
    scale: proj.scale,
    shape: proj.shape
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
    national: result.national.map(nationalToSuggestion),
    generic: result.generic.map(genericToSuggestion)
  };
}

export function buildProjectionFromSuggestion(
  suggestion: ProjectionSuggestion
): BuiltProjectionSuggestion | null {
  // Prefer proj4 string when available (more precise for national projections)
  if (suggestion.proj4String) {
    try {
      return {
        projection: proj4d3(suggestion.proj4String),
        source: 'proj4'
      };
    } catch (err) {
      logger.warn(
        'Failed to build projection from proj4 string, falling back to d3',
        LogCategory.MAP,
        { id: suggestion.id, error: err }
      );
    }
  }

  // Fallback to d3 config
  if (suggestion.d3Config) {
    const projection = buildD3Projection(suggestion.d3Config);
    if (projection) {
      return {
        projection,
        source: 'd3'
      };
    }
  }

  return null;
}

function buildD3Projection(config: D3Usage): GeoProjection | null {
  const factory = D3_FACTORY_MAP[config.projection];
  if (!factory) {
    logger.warn('Unknown d3 projection factory', LogCategory.MAP, {
      factory: config.projection
    });
    return null;
  }

  const projection = factory();

  if (config.rotate && 'rotate' in projection) {
    (projection as GeoProjection).rotate(
      config.rotate as [number, number, number]
    );
  }

  if (config.center && 'center' in projection) {
    (projection as GeoProjection).center(config.center);
  }

  if (
    config.parallels &&
    'parallels' in projection &&
    typeof (projection as Record<string, unknown>).parallels === 'function'
  ) {
    (
      projection as unknown as { parallels: (p: [number, number]) => void }
    ).parallels(config.parallels);
  }

  return projection;
}
