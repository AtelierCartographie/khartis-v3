import {
  geoGraticule,
  geoGraticule10,
  geoPath,
  type GeoPermissibleObjects,
  type GeoProjection
} from 'd3-geo';
import { buildD3ProjectionFromConfig } from '$lib/features/commons/utils/d3-projection-config.utils';
import {
  fitProjectionToBbox,
  isGlobalBbox
} from '$lib/features/commons/utils/projection.utils';
import type { ThumbnailGeometry } from '$lib/features/commons/utils/projection-thumbnail-geometry';
import { proj4d3 } from '$lib/features/map/utils/proj4d3.utils';
import {
  isUsableProjection,
  type ProjectionSuggestion
} from './projection-suggest.service';

const WIDTH = 120;
const HEIGHT = 120;
const PADDING = 8;
const SPHERE: GeoPermissibleObjects = { type: 'Sphere' };

export interface ThumbnailPaths {
  sphere: string;
  graticule: string;
  land: string;
  borders: string;
}

interface CacheEntry {
  base?: { sphere: string; graticule: string };
  full?: { land: string; borders: string };
}

const pathCache = new Map<string, CacheEntry>();

export function getThumbnailPaths(
  suggestion: ProjectionSuggestion,
  geometry: ThumbnailGeometry | null
): ThumbnailPaths {
  const signature = getSignature(suggestion);
  let entry = pathCache.get(signature);
  if (!entry) {
    entry = {};
    pathCache.set(signature, entry);
  }

  const needsBase = !entry.base;
  const needsFull = Boolean(geometry) && !entry.full;

  if (needsBase || needsFull) {
    const projection = buildThumbnailProjection(suggestion);
    if (projection) {
      const global = isGlobalFraming(suggestion);
      configureProjection(projection, suggestion, global);
      const path = geoPath(projection);
      if (needsBase) {
        entry.base = {
          sphere: path(SPHERE) ?? '',
          graticule: path(buildGraticule(suggestion.bbox, global)) ?? ''
        };
      }
      if (needsFull && geometry) {
        entry.full = {
          land: path(geometry.land) ?? '',
          borders: path(geometry.borders) ?? ''
        };
      }
    } else if (needsBase) {
      entry.base = { sphere: '', graticule: '' };
    }
  }

  return {
    sphere: entry.base?.sphere ?? '',
    graticule: entry.base?.graticule ?? '',
    land: entry.full?.land ?? '',
    borders: entry.full?.borders ?? ''
  };
}

function getSignature(suggestion: ProjectionSuggestion): string {
  const config = suggestion.d3Config;
  return [
    config?.projection ?? '',
    config?.rotate?.join(',') ?? '',
    config?.parallels?.join(',') ?? '',
    config?.center?.join(',') ?? '',
    config?.snippet ?? '',
    suggestion.proj4String ?? '',
    suggestion.bbox.map((value) => value.toFixed(3)).join(','),
    (suggestion.scale ?? []).join('|')
  ].join('§');
}

function buildThumbnailProjection(
  suggestion: ProjectionSuggestion
): GeoProjection | null {
  if (suggestion.d3Config) {
    const projection = buildD3ProjectionFromConfig(suggestion.d3Config);
    if (projection && isUsableProjection(projection)) {
      return projection;
    }
  }
  if (suggestion.proj4String) {
    try {
      const projection = proj4d3(suggestion.proj4String);
      if (isUsableProjection(projection)) {
        return projection;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function isGlobalFraming(suggestion: ProjectionSuggestion): boolean {
  const bbox = suggestion.bbox;
  if (bbox[0] > bbox[2] || isGlobalBbox(bbox)) {
    return true;
  }
  const { scale } = suggestion;
  return (
    scale !== undefined &&
    scale.length > 0 &&
    scale.every((value) => value === 'world')
  );
}

function configureProjection(
  projection: GeoProjection,
  suggestion: ProjectionSuggestion,
  global: boolean
): void {
  if (global) {
    projection.fitExtent(
      [
        [PADDING, PADDING],
        [WIDTH - PADDING, HEIGHT - PADDING]
      ],
      SPHERE
    );
  } else {
    fitProjectionToBbox(projection, suggestion.bbox, WIDTH, HEIGHT, PADDING);
  }
}

function buildGraticule(
  bbox: [number, number, number, number],
  global: boolean
): GeoPermissibleObjects {
  if (global) {
    return geoGraticule10();
  }
  const [west, south, east, north] = bbox;
  const step = stepForSpan(Math.max(east - west, north - south));
  return geoGraticule()
    .extent([
      [west, south],
      [east, north]
    ])
    .step([step, step])();
}

function stepForSpan(span: number): number {
  if (span > 90) {
    return 20;
  }
  if (span > 30) {
    return 10;
  }
  if (span > 10) {
    return 5;
  }
  if (span > 4) {
    return 2;
  }
  return 1;
}
